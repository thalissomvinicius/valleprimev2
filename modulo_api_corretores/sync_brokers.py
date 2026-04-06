"""
Sincronização UAU -> Railway/Supabase (v2)
- Cadastra SOMENTE Pessoa Física (CPF com 11 dígitos)
- Vincula cada corretor à sua Empresa (PJ/CNPJ) via HierarquiaIntegrante
"""
import os, sys, re
import pandas as pd
import requests

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database_uau import get_db_connection

API_BASE = os.environ.get("API_BASE", "https://valleprimev2-api.onrender.com")

def limpar_doc(doc):
    """Remove tudo que não é número do CPF/CNPJ"""
    if not doc:
        return ""
    return re.sub(r'\D', '', str(doc).strip())

def get_admin_token():
    resp = requests.post(f"{API_BASE}/api/login", json={"username": "admin", "password": "admin123"})
    if resp.status_code != 200:
        resp = requests.get(f"{API_BASE}/api/login-get?username=admin&password=admin123")
    if resp.status_code == 200:
        return resp.json().get("token")
    print(f"❌ Falha ao logar como Admin: {resp.status_code} {resp.text}")
    return None

def fetch_existing_users(token):
    resp = requests.get(f"{API_BASE}/api/users", headers={"Authorization": f"Bearer {token}"})
    if resp.status_code == 200:
        return {u["username"]: u for u in resp.json().get("users", [])}
    print(f"❌ Erro ao buscar usuários: {resp.text}")
    return {}

def delete_pj_users(token, existing_users):
    """Remove contas que foram criadas com CNPJ (14+ dígitos) por engano"""
    removidos = 0
    for username, user_data in existing_users.items():
        cpf_limpo = limpar_doc(username)
        if len(cpf_limpo) >= 14:
            user_id = user_data.get("id")
            if user_id:
                resp = requests.delete(
                    f"{API_BASE}/api/users/{user_id}",
                    headers={"Authorization": f"Bearer {token}"}
                )
                if resp.status_code == 200:
                    print(f"🗑️ Removido PJ: {user_data.get('nome', username)} (CNPJ: {username})")
                    removidos += 1
                else:
                    print(f"⚠️ Erro ao remover PJ {username}: {resp.text}")
    return removidos

def sync():
    print("🔄 Sincronização v2: Apenas CPFs (Pessoa Física) com vínculo à Empresa")
    print("="*60)

    # 1. Token Admin
    token = get_admin_token()
    if not token:
        return
    print("✅ Autenticado como Admin.")

    # 2. Usuários existentes
    existing_users = fetch_existing_users(token)
    print(f"📊 {len(existing_users)} usuários no sistema atualmente.")

    # 3. Limpar PJs que foram cadastrados por engano
    print("\n--- Limpando contas PJ (CNPJ) cadastradas por engano ---")
    removidos = delete_pj_users(token, existing_users)
    print(f"🗑️ {removidos} contas PJ removidas.")
    
    # Recarregar lista após limpeza
    if removidos > 0:
        existing_users = fetch_existing_users(token)

    # 4. Buscar corretores PF no UAU COM vínculo à empresa
    query = """
    SELECT DISTINCT
        p_int.cod_pes AS id_corretor,
        p_int.nome_pes AS nome_corretor,
        p_int.cpf_pes AS cpf_corretor,
        p_sup.cod_pes AS id_empresa,
        p_sup.nome_pes AS nome_empresa,
        p_sup.cpf_pes AS cnpj_empresa
    FROM Pessoas p_int WITH(NOLOCK)
    -- Pegar vínculo via HierarquiaIntegrante
    LEFT JOIN HierarquiaIntegrante hi WITH(NOLOCK) ON p_int.cod_pes = hi.CodPes_hqi
    LEFT JOIN Pessoas p_sup WITH(NOLOCK) ON hi.CodPesSuper_hqi = p_sup.cod_pes
        AND LEN(REPLACE(REPLACE(REPLACE(p_sup.cpf_pes, '.', ''), '-', ''), '/', '')) >= 14
    WHERE p_int.cpf_pes IS NOT NULL
    AND LEN(REPLACE(REPLACE(REPLACE(p_int.cpf_pes, '.', ''), '-', ''), '/', '')) = 11
    AND (
        EXISTS (SELECT 1 FROM Vendas v WITH(NOLOCK) WHERE v.Vendedor_Ven = p_int.cod_pes AND v.Status_Ven IN (0, 3))
        OR EXISTS (SELECT 1 FROM HierarquiaIntegrante hi2 WITH(NOLOCK) WHERE hi2.CodPes_hqi = p_int.cod_pes)
    )
    """

    try:
        import warnings
        warnings.filterwarnings('ignore', category=UserWarning)
        with get_db_connection() as conn:
            df = pd.read_sql(query, conn)
    except Exception as e:
        print(f"❌ Erro ao conectar no UAU: {e}")
        return

    print(f"\n📊 Encontrados {len(df)} corretores PF (CPF) na base UAU.")

    # 5. Criar/atualizar contas
    stats = {"criados": 0, "existentes": 0, "atualizados": 0, "erros": 0}

    for _, row in df.iterrows():
        cod_pes = int(row['id_corretor'])
        nome = str(row['nome_corretor']).strip().title()
        cpf = limpar_doc(row['cpf_corretor'])

        if not cpf or len(cpf) != 11:
            continue

        # Dados da empresa vinculada
        empresa_nome = str(row['nome_empresa']).strip().title() if pd.notna(row['nome_empresa']) else None
        empresa_cnpj = limpar_doc(row['cnpj_empresa']) if pd.notna(row['cnpj_empresa']) else None
        empresa_id = int(row['id_empresa']) if pd.notna(row['id_empresa']) else None

        permissions = {
            "uau_corretor_id": cod_pes,
            "canViewAllClients": False,
        }
        if empresa_nome:
            permissions["empresa_nome"] = empresa_nome
        if empresa_cnpj:
            permissions["empresa_cnpj"] = empresa_cnpj
        if empresa_id:
            permissions["empresa_id"] = empresa_id

        if cpf in existing_users:
            # Já existe — atualizar permissions com dados da empresa
            user_id = existing_users[cpf].get("id")
            if user_id and empresa_nome:
                resp = requests.put(
                    f"{API_BASE}/api/users/{user_id}",
                    json={"permissions": permissions},
                    headers={"Authorization": f"Bearer {token}"}
                )
                if resp.status_code == 200:
                    stats["atualizados"] += 1
                else:
                    stats["existentes"] += 1
            else:
                stats["existentes"] += 1
            continue

        # Novo usuário
        senha_padrao = f"Valle@{cpf[-4:]}"
        payload = {
            "username": cpf,
            "password": senha_padrao,
            "nome": nome,
            "permissions": permissions
        }

        res = requests.post(
            f"{API_BASE}/api/users",
            json=payload,
            headers={"Authorization": f"Bearer {token}"}
        )

        if res.status_code == 200:
            print(f"✅ Criado: {nome} (CPF: {cpf}) -> Empresa: {empresa_nome or 'Sem vínculo'}")
            stats["criados"] += 1
        else:
            print(f"⚠️ Erro ao criar {cpf}: {res.text}")
            stats["erros"] += 1

    print("\n" + "="*60)
    print("📈 Sincronização v2 Finalizada!")
    print(f"✨ Novos criados: {stats['criados']}")
    print(f"🔄 Atualizados (empresa): {stats['atualizados']}")
    print(f"🆗 Já existiam: {stats['existentes']}")
    print(f"🗑️ PJs removidos: {removidos}")
    print(f"⚠️ Erros: {stats['erros']}")
    print("="*60)

if __name__ == "__main__":
    sync()
