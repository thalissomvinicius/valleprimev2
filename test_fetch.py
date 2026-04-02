import sys
import os
import asyncio

from modulo_api_corretores.integracao_corretores import fetch_dados_corretores
from database_uau import get_db_connection

def main():
    print("Connecting to DB...")
    try:
        with get_db_connection() as conn:
            print("Connected! Fetching mes=2026-01")
            payload = fetch_dados_corretores(
                conn=conn,
                empresa=28,
                obra='70100',
                mes='2026-01'
            )
            print("Total corretores:", len(payload))
            for b in payload:
                print(f"BROKER: {b['corretor']}")
                for v in b['vendas_detalhadas']:
                    print(f"  Venda: {v['data_venda']}")
    except Exception as e:
        print("ERROR:", e)

if __name__ == "__main__":
    main()
