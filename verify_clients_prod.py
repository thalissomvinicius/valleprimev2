import requests
import json
import time

BASE_URL = "https://valleprimev2.vercel.app/api/clients"

def create_client(name, cpf, extra_data):
    payload = {
        "nome": name,
        "cpf_cnpj": cpf,
        "data": extra_data
    }
    print(f"Creating {name} ({cpf})...")
    try:
        resp = requests.post(BASE_URL, json=payload, timeout=10)
        if resp.status_code == 200:
            print(f"✅ Success: {resp.json()}")
        else:
            print(f"❌ Failed: {resp.status_code} - {resp.text}")
    except Exception as e:
        print(f"❌ Exception: {e}")

def list_clients():
    print("\nListing clients...")
    try:
        resp = requests.get(BASE_URL, timeout=10)
        if resp.status_code == 200:
            clients = resp.json().get('clients', [])
            print(f"Found {len(clients)} clients.")
            for c in clients:
                print(f" - {c['nome']} ({c['cpf_cnpj']})")
        else:
            print(f"❌ Failed to list: {resp.status_code}")
    except Exception as e:
        print(f"❌ Exception listing: {e}")

# 1. Pessoa Física Simples
create_client("Teste PF Simples", "111.111.111-11", {"tipo": "PF", "email": "pf@teste.com"})

# 2. Pessoa Jurídica
create_client("Teste Empresa Ltda", "22.222.222/0001-22", {"tipo": "PJ", "razao_social": "Teste Empresa Ltda"})

# 3. Com Cônjuge
create_client("Teste Casal Feliz", "333.333.333-33", {
    "tipo": "PF",
    "estado_civil": "CASADO",
    "nome_conjuge": "Esposa Teste",
    "cpf_conjuge": "444.444.444-44"
})

# 4. Com Segundo Proponente
create_client("Teste Socio Joint Venture", "555.555.555-55", {
    "tipo": "PF",
    "has_segundo": True,
    "nome_segundo": "Socio Teste",
    "cpf_segundo": "666.666.666-66"
})

# Check Persistence
time.sleep(2)
list_clients()
