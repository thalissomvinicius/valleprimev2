"""
Script de pesquisa v3: Entender hierarquia Empresa (CNPJ) -> Corretor (CPF).
Usa LEN(cpf_pes) para distinguir PF (11 digitos) de PJ (14 digitos).
"""
import sys, os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database_uau import get_db_connection

def pesquisar():
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Contar PF vs PJ usando comprimento do CPF (11=PF, 14=PJ)
    print("="*60)
    print("1. CONTAGEM PF vs PJ (pela length do CPF/CNPJ)")
    print("="*60)
    cursor.execute("""
        SELECT 
            CASE 
                WHEN LEN(REPLACE(REPLACE(REPLACE(p.cpf_pes, '.', ''), '-', ''), '/', '')) = 11 THEN 'PF (CPF)'
                WHEN LEN(REPLACE(REPLACE(REPLACE(p.cpf_pes, '.', ''), '-', ''), '/', '')) >= 14 THEN 'PJ (CNPJ)'
                ELSE 'Outro'
            END AS Tipo,
            COUNT(DISTINCT p.Cod_pes) AS Total
        FROM Pessoas p WITH(NOLOCK)
        WHERE p.CPF_pes IS NOT NULL
        AND (
            EXISTS (SELECT 1 FROM Vendas v WITH(NOLOCK) WHERE v.Vendedor_Ven = p.Cod_pes AND v.Status_Ven IN (0,3))
            OR EXISTS (SELECT 1 FROM HierarquiaIntegrante hi WITH(NOLOCK) WHERE hi.CodPes_hqi = p.Cod_pes)
        )
        GROUP BY 
            CASE 
                WHEN LEN(REPLACE(REPLACE(REPLACE(p.cpf_pes, '.', ''), '-', ''), '/', '')) = 11 THEN 'PF (CPF)'
                WHEN LEN(REPLACE(REPLACE(REPLACE(p.cpf_pes, '.', ''), '-', ''), '/', '')) >= 14 THEN 'PJ (CNPJ)'
                ELSE 'Outro'
            END
    """)
    for r in cursor.fetchall():
        print(f"  {r[0]}: {r[1]} registros")

    # 2. Mapear: Corretor PF -> sua Empresa PJ (via HierarquiaIntegrante.CodPesSuper_hqi)
    print("\n" + "="*60)
    print("2. AMOSTRA: Corretor (PF) -> Empresa (PJ) via Superior")
    print("="*60)
    cursor.execute("""
        SELECT TOP 20
            p_int.Nome_pes AS NomeCorretor,
            p_int.CPF_pes AS CPF_Corretor,
            p_sup.Nome_pes AS NomeEmpresa,
            p_sup.CPF_pes AS CNPJ_Empresa
        FROM HierarquiaIntegrante hi WITH(NOLOCK)
        INNER JOIN Pessoas p_int WITH(NOLOCK) ON hi.CodPes_hqi = p_int.Cod_pes
        LEFT JOIN Pessoas p_sup WITH(NOLOCK) ON hi.CodPesSuper_hqi = p_sup.Cod_pes
        WHERE p_int.CPF_pes IS NOT NULL
        AND LEN(REPLACE(REPLACE(REPLACE(p_int.cpf_pes, '.', ''), '-', ''), '/', '')) = 11
    """)
    for r in cursor.fetchall():
        empresa = f"{r[2]} (CNPJ: {r[3]})" if r[2] else "Sem empresa vinculada"
        print(f"  Corretor: {r[0]} | CPF: {r[1]}")
        print(f"    -> Empresa: {empresa}")
        print()

    # 3. Listar TODAS as empresas PJ que sao Superiores e quantos corretores PF cada uma tem
    print("="*60)
    print("3. TODAS AS EMPRESAS (PJ) E SEUS CORRETORES PF")
    print("="*60)
    cursor.execute("""
        SELECT 
            p_sup.Cod_pes AS CodEmpresa,
            p_sup.Nome_pes AS NomeEmpresa,
            p_sup.CPF_pes AS CNPJ,
            COUNT(DISTINCT p_int.Cod_pes) AS QtdCorretores
        FROM HierarquiaIntegrante hi WITH(NOLOCK)
        INNER JOIN Pessoas p_int WITH(NOLOCK) ON hi.CodPes_hqi = p_int.Cod_pes
        INNER JOIN Pessoas p_sup WITH(NOLOCK) ON hi.CodPesSuper_hqi = p_sup.Cod_pes
        WHERE p_int.CPF_pes IS NOT NULL
        AND LEN(REPLACE(REPLACE(REPLACE(p_int.cpf_pes, '.', ''), '-', ''), '/', '')) = 11
        AND LEN(REPLACE(REPLACE(REPLACE(p_sup.cpf_pes, '.', ''), '-', ''), '/', '')) >= 14
        GROUP BY p_sup.Cod_pes, p_sup.Nome_pes, p_sup.CPF_pes
        ORDER BY p_sup.Nome_pes
    """)
    empresas = cursor.fetchall()
    for r in empresas:
        print(f"  Empresa #{r[0]}: {r[1]} | CNPJ: {r[2]} | Corretores: {r[3]}")

    # 4. Detalhe da 1a empresa: listar corretores PF dentro dela
    if empresas:
        primeira = empresas[0]
        print(f"\n{'='*60}")
        print(f"4. DETALHE: Corretores PF da empresa '{primeira[1]}'")
        print(f"{'='*60}")
        cursor.execute("""
            SELECT p_int.Nome_pes, p_int.CPF_pes
            FROM HierarquiaIntegrante hi WITH(NOLOCK)
            INNER JOIN Pessoas p_int WITH(NOLOCK) ON hi.CodPes_hqi = p_int.Cod_pes
            WHERE hi.CodPesSuper_hqi = ?
            AND LEN(REPLACE(REPLACE(REPLACE(p_int.cpf_pes, '.', ''), '-', ''), '/', '')) = 11
            ORDER BY p_int.Nome_pes
        """, primeira[0])
        for r in cursor.fetchall():
            print(f"    -> {r[0]} | CPF: {r[1]}")

    conn.close()
    print("\n✅ Pesquisa concluída!")

if __name__ == "__main__":
    pesquisar()
