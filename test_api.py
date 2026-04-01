import requests
import json

url = "http://127.0.0.1:8001/api/integracao/corretores?empresa=28&obra=70100"
headers = {"Bypass-Tunnel-Reminder": "true"}

print(f"Testing URL: {url}")
try:
    response = requests.get(url, headers=headers, timeout=15)
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Total Corretores: {data.get('total_corretores', 0)}")
        if data.get('dados'):
            first = data['dados'][0]
            print(f"Sample Corretor: {first.get('corretor')}")
            print(f"VGV Total: {first.get('resumo', {}).get('vgv_total')}")
    else:
        print(f"Error Body: {response.text}")
except Exception as e:
    print(f"Request failed: {e}")
