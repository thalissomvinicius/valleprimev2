import sys
import os
import pandas as pd

# Set path
BASE_DIR = os.getcwd()
sys.path.append(os.path.join(BASE_DIR, 'api'))
sys.path.append(os.path.join(BASE_DIR, 'modulo_api_corretores'))

from database_uau import get_db_connection
from integracao_corretores import fetch_dados_corretores

print("🚀 Iniciando diagnóstico de Fetch dos dados...")

try:
    with get_db_connection() as conn:
        print("✅ Conectado ao SQL Server UAU.")
        
        # Testando Empresa 28 / Obra 70100
        print("🔍 Buscando dados para Empresa 28, Obra 70100...")
        resultado = fetch_dados_corretores(conn, empresa=28, obra="70100")
        
        print(f"📊 Sucesso! Retornou {len(resultado)} corretores.")
        if resultado:
            for c in resultado[:2]:
                print(f"- Corretor: {c['corretor']} | VGV: {c['resumo']['vgv_total']}")
        else:
            print("⚠️ Aviso: A query retornou uma lista vazia.")

except Exception as e:
    import traceback
    print(f"❌ ERRO NO FETCH: {e}")
    traceback.print_exc()
