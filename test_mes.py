import requests
import json

url = 'http://127.0.0.1:8001/api/integracao/corretores?empresa=28&obra=70100&mes=2026-03'
print("GET", url)
try:
    r = requests.get(url, timeout=5)
    data = r.json()
    print("Total records found:", data.get('total_corretores', 'error'))
    
    for b in data.get('dados', []):
        if not b['vendas_detalhadas']: continue
        print(f"[{b['corretor']}] has {len(b['vendas_detalhadas'])} vendas:")
        for v in b['vendas_detalhadas']:
            print(f"  - Data: {v.get('data_venda')} | VendaID: {v.get('venda_id')}")
            
except Exception as e:
    print("Error:", e)
