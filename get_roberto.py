import sys
sys.path.insert(0, r'C:\Users\thalissom.cruz\Desktop\PORTIFOLIO\SCRIPTS\DISP\site-disponibilidade\modulo_api_corretores')
import pandas as pd
from database_uau import get_db_connection

try:
    conn = get_db_connection()
    q = "SELECT cod_pes, nome_pes, cpf_pes FROM Pessoas WITH(NOLOCK) WHERE cod_pes IN (40, 538) OR cpf_pes LIKE '%26578239200%'"
    df = pd.read_sql(q, conn)
    print("=== PESQUISANDO ID 40 E 538 E CPF 26578239200 ===")
    print(df.to_string())
except Exception as e:
    print(e)
