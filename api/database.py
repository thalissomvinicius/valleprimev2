"""
Database module - Supabase REST API only.
All data operations go through the Supabase PostgREST endpoint.
"""
import os
import datetime
import json
import requests

SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_ANON_KEY')

def _supabase_request(table, method='GET', params=None, data=None, expect_single=False):
    """Core Supabase REST API handler."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ConnectionError("SUPABASE_URL and SUPABASE_KEY must be set in environment variables.")
    
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if params:
        url += f"?{params}"
    
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if method in ['POST', 'PATCH']:
        headers["Prefer"] = "return=representation"
    if method == 'DELETE':
        headers["Prefer"] = "return=minimal"
    
    try:
        if method == 'GET':
            response = requests.get(url, headers=headers, timeout=8)
        elif method == 'POST':
            response = requests.post(url, headers=headers, json=data, timeout=8)
        elif method == 'PATCH':
            response = requests.patch(url, headers=headers, json=data, timeout=8)
        elif method == 'DELETE':
            response = requests.delete(url, headers=headers, timeout=8)
        else:
            raise ValueError(f"Unsupported HTTP method: {method}")
        
        if response.status_code not in [200, 201, 204, 206]:
            print(f"[SUPABASE ERROR] {method} {table}: {response.status_code} - {response.text[:200]}")
            return None
        
        if not response.text or response.status_code == 204:
            return True
        
        result = response.json()
        
        if expect_single:
            if isinstance(result, list):
                return result[0] if len(result) > 0 else None
            return result
        
        return result
    except requests.exceptions.Timeout:
        print(f"[SUPABASE TIMEOUT] {method} {table}")
        raise
    except Exception as e:
        print(f"[SUPABASE ERROR] {method} {table}: {e}")
        raise


# --- USERS REPOSITORY ---

def get_user_by_id(user_id):
    return _supabase_request('users', 'GET', f"id=eq.{user_id}&select=*", expect_single=True)

def get_user_by_username(username, active_only=False):
    params = f"username=eq.{username}&select=*"
    if active_only:
        params += "&active=eq.true"
    return _supabase_request('users', 'GET', params, expect_single=True)

def get_all_users():
    result = _supabase_request('users', 'GET', "select=id,username,nome,role,permissions,active&order=id.asc")
    return result if isinstance(result, list) else []

def create_user(username, password_hash, nome, role, permissions, active=True):
    payload = {
        "username": username,
        "password_hash": password_hash,
        "nome": nome,
        "role": role,
        "permissions": permissions if isinstance(permissions, dict) else json.loads(permissions) if isinstance(permissions, str) else {},
        "active": active
    }
    return _supabase_request('users', 'POST', data=payload)

def update_user(user_id, updates):
    if not updates:
        return True
    # Ensure permissions is stored as JSON object, not string
    if 'permissions' in updates and isinstance(updates['permissions'], str):
        updates['permissions'] = json.loads(updates['permissions'])
    return _supabase_request('users', 'PATCH', f"id=eq.{user_id}", data=updates)

def delete_user(user_id):
    return _supabase_request('users', 'DELETE', f"id=eq.{user_id}")

def count_users():
    res = _supabase_request('users', 'GET', "select=id")
    return {"count": len(res)} if isinstance(res, list) else {"count": 0}


# --- CLIENTS REPOSITORY ---

def get_clients(tipo_pessoa, created_by=None):
    params = f"tipo_pessoa=eq.{tipo_pessoa}&order=created_at.desc&select=*"
    if created_by:
        params += f"&created_by=eq.{created_by}"
    result = _supabase_request('clients', 'GET', params)
    return result if isinstance(result, list) else []

def check_duplicate_client(cpf_cnpj, exclude_id=None):
    params = f"cpf_cnpj=eq.{cpf_cnpj}&select=id,nome"
    if exclude_id:
        params += f"&id=neq.{exclude_id}"
    return _supabase_request('clients', 'GET', params, expect_single=True)

def get_client_by_id(client_id):
    return _supabase_request('clients', 'GET', f"id=eq.{client_id}&select=*", expect_single=True)

def create_client(nome, cpf_cnpj, tipo_pessoa, created_by, data_dict):
    payload = {
        "nome": nome,
        "cpf_cnpj": cpf_cnpj,
        "tipo_pessoa": tipo_pessoa,
        "created_by": created_by,
        "data": data_dict if isinstance(data_dict, dict) else json.loads(data_dict) if isinstance(data_dict, str) else {}
    }
    return _supabase_request('clients', 'POST', data=payload)

def update_client(client_id, nome, cpf_cnpj, tipo_pessoa, data_dict, updated_at):
    payload = {
        "nome": nome,
        "cpf_cnpj": cpf_cnpj,
        "tipo_pessoa": tipo_pessoa,
        "data": data_dict if isinstance(data_dict, dict) else json.loads(data_dict) if isinstance(data_dict, str) else {},
        "updated_at": updated_at
    }
    return _supabase_request('clients', 'PATCH', f"id=eq.{client_id}", data=payload)

def delete_client(client_id, user_id_filter=None):
    params = f"id=eq.{client_id}"
    if user_id_filter:
        params += f"&created_by=eq.{user_id_filter}"
    return _supabase_request('clients', 'DELETE', params)

def count_clients():
    res = _supabase_request('clients', 'GET', "select=id")
    return {"count": len(res)} if isinstance(res, list) else {"count": 0}

def get_recent_clients(limit=5):
    result = _supabase_request('clients', 'GET', f"select=id,nome,created_at,created_by&order=id.desc&limit={limit}")
    return result if isinstance(result, list) else []


# --- PROPOSALS REPOSITORY ---

def get_proposals(user_id=None, limit=50, offset=0):
    params = f"select=id,user_id,obra_codigo,obra_nome,quadra,lote,payload,created_at,updated_at&order=created_at.desc&limit={limit}&offset={offset}"
    if user_id:
        params += f"&user_id=eq.{user_id}"
    result = _supabase_request('proposals', 'GET', params)
    return result if isinstance(result, list) else []

def get_proposal_by_id(proposal_id):
    return _supabase_request('proposals', 'GET', f"id=eq.{proposal_id}&select=*", expect_single=True)

def count_proposals(user_id=None):
    params = "select=id"
    if user_id:
        params += f"&user_id=eq.{user_id}"
    res = _supabase_request('proposals', 'GET', params)
    return {"count": len(res)} if isinstance(res, list) else {"count": 0}

def create_proposal(user_id, obra_codigo, obra_nome, quadra, lote, payload):
    data = {
        "user_id": user_id,
        "obra_codigo": obra_codigo,
        "obra_nome": obra_nome,
        "quadra": quadra,
        "lote": lote,
        "payload": payload if isinstance(payload, dict) else json.loads(payload) if isinstance(payload, str) else {}
    }
    return _supabase_request('proposals', 'POST', data=data)

def update_proposal(proposal_id, obra_codigo, obra_nome, quadra, lote, payload):
    data = {
        "obra_codigo": obra_codigo,
        "obra_nome": obra_nome,
        "quadra": quadra,
        "lote": lote,
        "payload": payload if isinstance(payload, dict) else json.loads(payload) if isinstance(payload, str) else {},
        "updated_at": datetime.datetime.now().isoformat()
    }
    return _supabase_request('proposals', 'PATCH', f"id=eq.{proposal_id}", data=data)

def delete_proposal(proposal_id):
    return _supabase_request('proposals', 'DELETE', f"id=eq.{proposal_id}")
