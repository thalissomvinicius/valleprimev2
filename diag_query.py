import sys
sys.path.insert(0, r'C:\Users\thalissom.cruz\Desktop\PORTIFOLIO\SCRIPTS\DISP\site-disponibilidade\modulo_api_corretores')
import pandas as pd
from database_uau import get_db_connection

conn = get_db_connection()
print("Conectado ao UAU!")

# 1. Listar TODAS as obras ativas de TODAS as empresas com o padrão 600-625
codes = "('600','601','602','603','604','605','610','616','618','620','621','623','624','625')"
q1 = f"SELECT Empresa_Obr, Cod_Obr, Descr_Obr, Status_Obr FROM Obras WITH(NOLOCK) WHERE Cod_Obr IN {codes} ORDER BY Empresa_Obr, Cod_Obr"
df1 = pd.read_sql(q1, conn)
print(f"\n=== OBRAS COM CÓDIGOS 600-625 (QUALQUER EMPRESA) ===")
print(df1.to_string())

# 2. Listar vendas por empresa+obra para entender a distribuição
q2 = """
SELECT TOP 30
    v.Empresa_Ven, v.Obra_Ven, o.Descr_Obr,
    COUNT(*) as total_vendas,
    MAX(FORMAT(v.Data_Ven, 'yyyy-MM-dd')) as ultima_venda
FROM Vendas v WITH(NOLOCK)
LEFT JOIN Obras o WITH(NOLOCK) ON v.Empresa_Ven = o.Empresa_Obr AND v.Obra_Ven = o.Cod_Obr
GROUP BY v.Empresa_Ven, v.Obra_Ven, o.Descr_Obr
ORDER BY ultima_venda DESC
"""
df2 = pd.read_sql(q2, conn)
print(f"\n=== VENDAS POR EMPRESA+OBRA (TOP 30 mais recentes) ===")
print(df2.to_string())

# 3. Vendas do Roberto Ronnie (cod_pes 538) 
q3 = """
SELECT TOP 10
    v.Empresa_Ven, v.Obra_Ven, v.Num_Ven, FORMAT(v.Data_Ven, 'yyyy-MM-dd') AS data, v.ValorTot_Ven
FROM Vendas v WITH(NOLOCK)
WHERE v.Vendedor_Ven = 538
ORDER BY v.Data_Ven DESC
"""
df3 = pd.read_sql(q3, conn)
print(f"\n=== VENDAS DO ROBERTO RONNIE (cod_pes=538) ===")
print(df3.to_string())

conn.close()
print("\nConcluído!")
