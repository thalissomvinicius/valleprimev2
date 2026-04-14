import requests
import json
import zlib
import base64

API = "https://valleprimev2.onrender.com"

# 1. Push dados de teste
print("=== TESTE PUSH ===")
test_data = [
    {"codigo_corretor": 1, "corretor": "JOAO DA SILVA TESTE", "vendas_detalhadas": [{"data_venda": "2026-04-14", "valor_venda": 150000}]},
    {"codigo_corretor": 2, "corretor": "MARIA OLIVEIRA TESTE", "vendas_detalhadas": [{"data_venda": "2026-04-13", "valor_venda": 200000}]}
]
json_str = json.dumps(test_data, ensure_ascii=False)
compressed = zlib.compress(json_str.encode('utf-8'), level=9)
b64 = base64.b64encode(compressed).decode('ascii')

payload = {
    "cache_key": "13-70100-all",
    "dados_compressed": b64,
    "atualizado_em": "2026-04-14T19:35:00",
    "total_corretores": 2
}
headers = {"Content-Type": "application/json", "X-Sync-Secret": "valleprime-sync-2026"}

r = requests.post(f"{API}/api/integracao/sync/push", headers=headers, json=payload, timeout=30)
print(f"PUSH Status: {r.status_code}")
print(f"PUSH Response: {r.text}")

# 2. GET Dom Eliseu
print("\n=== TESTE GET (Dom Eliseu) ===")
r2 = requests.get(f"{API}/api/integracao/cache/corretores?empresa=13&obra=70100&mes=all", timeout=30)
print(f"GET Status: {r2.status_code}")
print(f"GET Size: {len(r2.text)} chars")

try:
    data = r2.json()
    print(f"JSON valid: YES")
    print(f"is_cache: {data.get('is_cache')}")
    print(f"atualizado_em: {data.get('atualizado_em')}")
    dados = data.get("dados", [])
    print(f"dados count: {len(dados)}")
    if dados:
        for d in dados:
            print(f"  - {d.get('corretor', 'N/A')}")
except Exception as e:
    print(f"JSON FAILED: {e}")
    print(f"First 500: {r2.text[:500]}")
