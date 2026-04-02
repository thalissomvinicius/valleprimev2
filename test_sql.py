import pandas as pd
from database_uau import get_db_connection

def test_sql():
    try:
        conn = get_db_connection()
        print("Connected to UAU.")
        empresa = 28
        obra = '70100'
        data_inicio = '20260101'
        data_fim = '20260131'
        
        filtros_vendas = f"Empresa_Ven = {empresa} AND Obra_Ven = '{obra}' AND TipoVenda_Ven IN (0,1,2,3,4,5)"
        filtros_vendas += f" AND Data_Ven >= '{data_inicio}' AND Data_Ven <= '{data_fim}'"
        
        query = f"SELECT Data_Ven, Num_Ven FROM Vendas WITH(NOLOCK) WHERE {filtros_vendas}"
        print(f"Executing: {query}")
        
        df = pd.read_sql(query, conn)
        print("Total rows:", len(df))
        if not df.empty:
            print("Sample dates:")
            print(df.head())
            
    except Exception as e:
        print("Error:", e)

test_sql()
