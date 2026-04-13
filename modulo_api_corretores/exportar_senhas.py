"""
Exporta corretores PF (CPF) organizados por empresa para TXT.
Exclui CNPJs da lista de login.
"""
import sys, os, re
import pandas as pd
from collections import defaultdict

# Fix encoding no Windows para suportar emojis nos logs
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database_uau import get_db_connection

def limpar_doc(doc):
    if not doc:
        return ""
    return re.sub(r'\D', '', str(doc).strip())

def formatar_cpf(cpf):
    cpf = limpar_doc(cpf)
    if len(cpf) == 11:
        return f"{cpf[:3]}.{cpf[3:6]}.{cpf[6:9]}-{cpf[9:]}"
    return cpf

def formatar_cnpj(cnpj):
    cnpj = limpar_doc(cnpj)
    if len(cnpj) == 14:
        return f"{cnpj[:2]}.{cnpj[2:5]}.{cnpj[5:8]}/{cnpj[8:12]}-{cnpj[12:]}"
    return cnpj

def exportar():
    print("🔄 Exportando lista de Corretores PF organizados por empresa...")

    query = """
    SELECT DISTINCT
        p_int.cod_pes AS id_corretor,
        p_int.nome_pes AS nome_corretor,
        p_int.cpf_pes AS cpf_corretor,
        p_sup.nome_pes AS nome_empresa,
        p_sup.cpf_pes AS cnpj_empresa
    FROM Pessoas p_int WITH(NOLOCK)
    LEFT JOIN HierarquiaIntegrante hi WITH(NOLOCK) ON p_int.cod_pes = hi.CodPes_hqi
    LEFT JOIN Pessoas p_sup WITH(NOLOCK) ON hi.CodPesSuper_hqi = p_sup.cod_pes
    WHERE p_int.cpf_pes IS NOT NULL
    AND LEN(p_int.cpf_pes) >= 11
    AND (
        EXISTS (SELECT 1 FROM Vendas v WITH(NOLOCK) WHERE v.Vendedor_Ven = p_int.cod_pes AND v.Status_Ven IN (0, 3))
        OR EXISTS (SELECT 1 FROM HierarquiaIntegrante hi2 WITH(NOLOCK) WHERE hi2.CodPes_hqi = p_int.cod_pes)
    )
    ORDER BY p_sup.nome_pes, p_int.nome_pes
    """

    try:
        import warnings
        warnings.filterwarnings('ignore', category=UserWarning)
        with get_db_connection() as conn:
            df = pd.read_sql(query, conn)
    except Exception as e:
        print(f"❌ Erro na consulta SQL: {e}")
        return

    # Limpar dados
    df['cpf_limpo'] = df['cpf_corretor'].apply(limpar_doc)
    df['nome_corretor'] = df['nome_corretor'].str.strip().str.title()
    df['nome_empresa'] = df['nome_empresa'].fillna('').str.strip().str.title()
    df['cnpj_empresa'] = df['cnpj_empresa'].fillna('')
    df = df[df['cpf_limpo'].str.len() == 11].drop_duplicates(subset=['cpf_limpo'])

    # Agrupar por empresa
    empresas = defaultdict(list)
    for _, row in df.iterrows():
        empresa_key = row['nome_empresa'] if row['nome_empresa'] else "SEM EMPRESA VINCULADA"
        cnpj = limpar_doc(row['cnpj_empresa'])
        empresas[(empresa_key, cnpj)].append({
            "nome": row['nome_corretor'],
            "cpf": row['cpf_limpo'],
        })

    # Escrever TXT
    caminho = os.path.join(os.path.dirname(os.path.dirname(__file__)), "corretores_cadastrados.txt")

    total_pf = sum(len(v) for v in empresas.values())
    total_empresas = len([k for k in empresas if k[0] != "SEM EMPRESA VINCULADA"])

    with open(caminho, "w", encoding="utf-8") as f:
        f.write("╔══════════════════════════════════════════════════════════════════╗\n")
        f.write("║        RELATÓRIO DE ACESSOS - SISTEMA VALLEPRIME               ║\n")
        f.write("║        Corretores organizados por Empresa                      ║\n")
        f.write("╚══════════════════════════════════════════════════════════════════╝\n\n")
        f.write(f"Total de Corretores (PF): {total_pf}\n")
        f.write(f"Total de Empresas (PJ):   {total_empresas}\n")
        f.write(f"Senha padrão: Valle@ + 4 últimos dígitos do CPF\n")
        f.write("="*66 + "\n\n")

        # Ordenar por nome da empresa
        for (empresa_nome, empresa_cnpj), corretores in sorted(empresas.items()):
            if empresa_nome == "SEM EMPRESA VINCULADA":
                continue  # Listar por último

            cnpj_fmt = formatar_cnpj(empresa_cnpj) if empresa_cnpj else "N/A"
            f.write(f"┌─────────────────────────────────────────────────────────────────┐\n")
            f.write(f"│ EMPRESA: {empresa_nome}\n")
            f.write(f"│ CNPJ:    {cnpj_fmt}\n")
            f.write(f"│ Corretores: {len(corretores)}\n")
            f.write(f"└─────────────────────────────────────────────────────────────────┘\n")

            for c in sorted(corretores, key=lambda x: x['nome']):
                cpf_fmt = formatar_cpf(c['cpf'])
                senha = f"Valle@{c['cpf'][-4:]}"
                f.write(f"   Nome:    {c['nome']}\n")
                f.write(f"   Usuário: {c['cpf']}\n")
                f.write(f"   CPF:     {cpf_fmt}\n")
                f.write(f"   Senha:   {senha}\n")
                f.write(f"   - - - - - - - - - - - - - - - - -\n")
            f.write("\n")

        # Corretores sem empresa
        sem_empresa = empresas.get(("SEM EMPRESA VINCULADA", ""), [])
        if sem_empresa:
            f.write(f"┌─────────────────────────────────────────────────────────────────┐\n")
            f.write(f"│ SEM EMPRESA VINCULADA\n")
            f.write(f"│ Corretores avulsos: {len(sem_empresa)}\n")
            f.write(f"└─────────────────────────────────────────────────────────────────┘\n")
            for c in sorted(sem_empresa, key=lambda x: x['nome']):
                cpf_fmt = formatar_cpf(c['cpf'])
                senha = f"Valle@{c['cpf'][-4:]}"
                f.write(f"   Nome:    {c['nome']}\n")
                f.write(f"   Usuário: {c['cpf']}\n")
                f.write(f"   CPF:     {cpf_fmt}\n")
                f.write(f"   Senha:   {senha}\n")
                f.write(f"   - - - - - - - - - - - - - - - - -\n")

    print(f"✅ Arquivo salvo em: {caminho}")
    print(f"📊 {total_pf} corretores PF em {total_empresas} empresas.")

if __name__ == "__main__":
    exportar()
