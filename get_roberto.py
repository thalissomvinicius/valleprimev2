import os
import sys
import requests

# Load env file manually
env_vars = {}
try:
    with open('backend/.env') as f:
        for line in f:
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                env_vars[k.strip()] = v.strip().strip('"\'')
except Exception as e:
    print(f"Error loading .env: {e}")

supabase_url = env_vars.get('SUPABASE_URL')
supabase_key = env_vars.get('SUPABASE_SERVICE_ROLE_KEY') or env_vars.get('SUPABASE_ANON_KEY')

if not supabase_url or not supabase_key:
    print("Missing Supabase credentials in .env")
    sys.exit(1)

headers = {
    'apikey': supabase_key,
    'Authorization': f'Bearer {supabase_key}',
    'Content-Type': 'application/json'
}

print("Fetching users from Supabase...")
r = requests.get(f"{supabase_url}/rest/v1/users?select=id,nome,username,role", headers=headers)

if r.status_code == 200:
    users = r.json()
    roberto = [u for u in users if "ROBERTO" in str(u.get('nome', '')).upper()]
    if roberto:
        print("\n✅ CRENDENCIAIS DO ROBERTO ENCONTRADAS:")
        for r_user in roberto:
            print(f"- Nome: {r_user.get('nome')}")
            print(f"- Username (Login): {r_user.get('username')}")
            print(f"- Role: {r_user.get('role')}")
            print("----------------------------")
    else:
        print("❌ Usuário 'ROBERTO' não encontrado no banco Supabase.")
else:
    print(f"Erro ao consultar Supabase: {r.status_code} - {r.text}")

