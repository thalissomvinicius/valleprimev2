import requests
import json

API = "https://valleprimev2.onrender.com"

r = requests.get(f"{API}/api/integracao/cache/corretores?empresa=13&obra=70100&mes=all", timeout=120)
print(f"Status: {r.status_code}")
print(f"Size: {len(r.text)} chars")
print(f"Encoding: {r.headers.get('Content-Encoding', 'none')}")
print(f"Type: {r.headers.get('Content-Type', 'none')}")

try:
    data = r.json()
    print(f"JSON valid: YES")
    print(f"is_cache: {data.get('is_cache')}")
    print(f"total_corretores: {data.get('total_corretores')}")
    print(f"atualizado_em: {data.get('atualizado_em')}")
    dados = data.get("dados", [])
    print(f"dados count: {len(dados)}")
    if dados:
        print(f"First broker: {dados[0].get('corretor', 'N/A')}")
except Exception as e:
    print(f"JSON parse FAILED: {e}")
    print(f"First 300 chars: {r.text[:300]}")
