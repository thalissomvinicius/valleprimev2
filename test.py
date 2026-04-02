import requests
import json
import sys

try:
    print("Testing /api/integracao/corretores with mes=2026-01")
    r = requests.get('http://127.0.0.1:8001/api/integracao/corretores?empresa=28&obra=07&mes=2026-01', timeout=10)
    data = r.json()
    for broker in data.get('dados', []):
        if broker['corretor'].startswith('ROBERTO'):
            print(f"Broker: {broker['corretor']}")
            for v in broker['vendas_detalhadas']:
                print(f"   Venda {v['venda_id']} - Data: {v['data_venda']}")
except Exception as e:
    print(f"Error: {e}")
