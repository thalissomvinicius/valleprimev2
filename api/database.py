import sqlite3
import os
import datetime
import json
import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if os.environ.get('VERCEL') == '1' or os.environ.get('RENDER') == '1' or os.path.exists('/opt/render'):
    DB_PATH = '/tmp/clients.db'
else:
    DB_PATH = os.path.join(BASE_DIR, 'clients.db')

SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_ANON_KEY')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def query_supabase_rest(table, method='GET', params=None, data=None):
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
        
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if params:
        url += f"?{params}"
    
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation" if method in ['POST', 'PATCH'] else ""
    }
    
    try:
        if method == 'GET':
            response = requests.get(url, headers=headers, timeout=5)
        elif method == 'POST':
            response = requests.post(url, headers=headers, json=data, timeout=5)
        elif method == 'PATCH':
            response = requests.patch(url, headers=headers, json=data, timeout=5)
        elif method == 'DELETE':
            response = requests.delete(url, headers=headers, timeout=5)
        
        if response.status_code in [200, 201, 204, 206]:
            if not response.text: return True
            try:
                return response.json()
            except:
                return True
        return None
    except Exception:
        return None

def db_execute_sqlite(sql, params=(), one=False, commit=False):
    """Executa apenas SQLite bruto"""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(sql, params)
        if commit:
            conn.commit()
            return True
        if one:
            rv = cur.fetchone()
            if rv:
                col_names = [desc[0] for desc in cur.description]
                result = dict(zip(col_names, rv))
                for key, val in result.items():
                    if isinstance(val, (datetime.datetime, datetime.date)):
                        result[key] = val.isoformat()
                return result
            return None
        rv = cur.fetchall()
        if cur.description:
            col_names = [desc[0] for desc in cur.description]
            results = []
            for row in rv:
                row_dict = dict(zip(col_names, row))
                for key, val in row_dict.items():
                    if isinstance(val, (datetime.datetime, datetime.date)):
                        row_dict[key] = val.isoformat()
                results.append(row_dict)
            return results
        return []
    except Exception as e:
        print(f"SQLITE ERROR: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()

# --- USERS REPOSITORY ---
def get_user_by_id(user_id):
    if SUPABASE_URL:
        res = query_supabase_rest('users', 'GET', f"id=eq.{user_id}")
        if isinstance(res, list) and len(res) > 0:
            return res[0]
    return db_execute_sqlite("SELECT * FROM users WHERE id = ?", (user_id,), one=True)

def get_user_by_username(username, active_only=False):
    params = f"username=eq.{username}"
    if active_only: params += "&active=eq.true"
    
    if SUPABASE_URL:
        res = query_supabase_rest('users', 'GET', params)
        if isinstance(res, list) and len(res) > 0:
            return res[0]
            
    sql = "SELECT * FROM users WHERE username = ?"
    sql_params = [username]
    if active_only:
        sql += " AND active = 1"
    return db_execute_sqlite(sql, tuple(sql_params), one=True)

def get_all_users():
    if SUPABASE_URL:
        res = query_supabase_rest('users', 'GET', "order=id.asc")
        if isinstance(res, list): return res
    return db_execute_sqlite("SELECT id, username, nome, role, permissions, active FROM users ORDER BY id")

def create_user(username, password_hash, nome, role, permissions, active=True):
    payload = {
        "username": username,
        "password_hash": password_hash,
        "nome": nome,
        "role": role,
        "permissions": permissions,
        "active": active
    }
    if SUPABASE_URL:
        query_supabase_rest('users', 'POST', data=payload)
    db_execute_sqlite("INSERT INTO users (username, password_hash, nome, role, active, permissions) VALUES (?, ?, ?, ?, ?, ?)",
                      (username, password_hash, nome, role, 1 if active else 0, json.dumps(permissions)), commit=True)
    return True

def update_user(user_id, updates):
    if not updates: return True
    if SUPABASE_URL:
        query_supabase_rest('users', 'PATCH', f"id=eq.{user_id}", data=updates)
    
    cols = []
    params = []
    for k, v in updates.items():
        cols.append(f"{k} = ?")
        val = json.dumps(v) if isinstance(v, dict) else v
        params.append(val)
    params.append(user_id)
    sql = f"UPDATE users SET {', '.join(cols)} WHERE id = ?"
    return db_execute_sqlite(sql, tuple(params), commit=True)

def delete_user(user_id):
    if SUPABASE_URL:
        query_supabase_rest('users', 'DELETE', f"id=eq.{user_id}")
    return db_execute_sqlite("DELETE FROM users WHERE id = ?", (user_id,), commit=True)

def count_users():
    if SUPABASE_URL:
        res = query_supabase_rest('users', 'GET', "select=id")
        return {"count": len(res)} if isinstance(res, list) else {"count": 0}
    return db_execute_sqlite("SELECT COUNT(*) as count FROM users", one=True)

# --- CLIENTS REPOSITORY ---
def get_clients(tipo_pessoa, created_by=None):
    params = f"tipo_pessoa=eq.{tipo_pessoa}&order=created_at.desc"
    if created_by:
        params += f"&created_by=eq.{created_by}"
        
    if SUPABASE_URL:
        res = query_supabase_rest('clients', 'GET', params)
        if isinstance(res, list): return res
        
    sql = "SELECT * FROM clients WHERE tipo_pessoa = ?"
    sql_params = [tipo_pessoa]
    if created_by:
        sql += " AND created_by = ?"
        sql_params.append(created_by)
    sql += " ORDER BY created_at DESC"
    return db_execute_sqlite(sql, tuple(sql_params))

def check_duplicate_client(cpf_cnpj, exclude_id=None):
    params = f"cpf_cnpj=eq.{cpf_cnpj}"
    if exclude_id:
        params += f"&id=neq.{exclude_id}"
        
    if SUPABASE_URL:
        res = query_supabase_rest('clients', 'GET', params)
        if isinstance(res, list) and len(res) > 0:
            return res[0]
            
    sql = "SELECT id, nome FROM clients WHERE cpf_cnpj = ?"
    sql_params = [cpf_cnpj]
    if exclude_id:
        sql += " AND id != ?"
        sql_params.append(exclude_id)
    return db_execute_sqlite(sql, tuple(sql_params), one=True)

def get_client_by_id(client_id):
    if SUPABASE_URL:
        res = query_supabase_rest('clients', 'GET', f"id=eq.{client_id}")
        if isinstance(res, list) and len(res) > 0: return res[0]
    return db_execute_sqlite("SELECT * FROM clients WHERE id = ?", (client_id,), one=True)

def create_client(nome, cpf_cnpj, tipo_pessoa, created_by, data_dict):
    payload = {
        "nome": nome,
        "cpf_cnpj": cpf_cnpj,
        "tipo_pessoa": tipo_pessoa,
        "created_by": created_by,
        "data": data_dict
    }
    if SUPABASE_URL:
        query_supabase_rest('clients', 'POST', data=payload)
    db_execute_sqlite("INSERT INTO clients (nome, cpf_cnpj, tipo_pessoa, created_by, data) VALUES (?, ?, ?, ?, ?)",
                      (nome, cpf_cnpj, tipo_pessoa, created_by, json.dumps(data_dict)), commit=True)
    return True

def update_client(client_id, nome, cpf_cnpj, tipo_pessoa, data_dict, updated_at):
    payload = {
        "nome": nome,
        "cpf_cnpj": cpf_cnpj,
        "tipo_pessoa": tipo_pessoa,
        "data": data_dict,
        "updated_at": updated_at
    }
    if SUPABASE_URL:
        query_supabase_rest('clients', 'PATCH', f"id=eq.{client_id}", data=payload)
    return db_execute_sqlite("UPDATE clients SET nome = ?, cpf_cnpj = ?, tipo_pessoa = ?, data = ?, updated_at = ? WHERE id = ?",
                             (nome, cpf_cnpj, tipo_pessoa, json.dumps(data_dict), updated_at, client_id), commit=True)

def delete_client(client_id, user_id_filter=None):
    if user_id_filter:
        if SUPABASE_URL:
            query_supabase_rest('clients', 'DELETE', f"id=eq.{client_id}&created_by=eq.{user_id_filter}")
        return db_execute_sqlite("DELETE FROM clients WHERE id = ? AND created_by = ?", (client_id, user_id_filter), commit=True)
    else:
        if SUPABASE_URL:
            query_supabase_rest('clients', 'DELETE', f"id=eq.{client_id}")
        return db_execute_sqlite("DELETE FROM clients WHERE id = ?", (client_id,), commit=True)

def count_clients():
    if SUPABASE_URL:
        res = query_supabase_rest('clients', 'GET', "select=id")
        return {"count": len(res)} if isinstance(res, list) else {"count": 0}
    return db_execute_sqlite("SELECT COUNT(*) as count FROM clients", one=True)

def get_recent_clients(limit=5):
    if SUPABASE_URL:
        res = query_supabase_rest('clients', 'GET', f"select=id,nome,created_at,created_by&order=id.desc&limit={limit}")
        if isinstance(res, list): return res
    return db_execute_sqlite("SELECT id, nome, created_at, created_by FROM clients ORDER BY id DESC LIMIT ?", (limit,))

# --- PROPOSALS REPOSITORY ---
def get_proposals(user_id=None, limit=50, offset=0):
    params = f"order=created_at.desc&limit={limit}&offset={offset}"
    if user_id:
        params += f"&user_id=eq.{user_id}"
        
    if SUPABASE_URL:
        res = query_supabase_rest('proposals', 'GET', params)
        if isinstance(res, list): return res
        
    sql = "SELECT id, user_id, obra_codigo, obra_nome, quadra, lote, payload, created_at, updated_at FROM proposals"
    sql_params = []
    if user_id:
        sql += " WHERE user_id = ?"
        sql_params.append(user_id)
    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    sql_params.extend([limit, offset])
    return db_execute_sqlite(sql, tuple(sql_params))

def get_proposal_by_id(proposal_id):
    if SUPABASE_URL:
        res = query_supabase_rest('proposals', 'GET', f"id=eq.{proposal_id}")
        if isinstance(res, list) and len(res) > 0: return res[0]
    return db_execute_sqlite("SELECT * FROM proposals WHERE id = ?", (proposal_id,), one=True)

def count_proposals(user_id=None):
    params = "select=id"
    if user_id: params += f"&user_id=eq.{user_id}"
    if SUPABASE_URL:
        res = query_supabase_rest('proposals', 'GET', params)
        return {"count": len(res)} if isinstance(res, list) else {"count": 0}
        
    sql = "SELECT COUNT(*) as count FROM proposals"
    if user_id:
        return db_execute_sqlite(sql + " WHERE user_id = ?", (user_id,), one=True)
    return db_execute_sqlite(sql, one=True)

def create_proposal(user_id, obra_codigo, obra_nome, quadra, lote, payload):
    data = {
        "user_id": user_id,
        "obra_codigo": obra_codigo,
        "obra_nome": obra_nome,
        "quadra": quadra,
        "lote": lote,
        "payload": payload
    }
    if SUPABASE_URL:
        query_supabase_rest('proposals', 'POST', data=data)
    db_execute_sqlite("INSERT INTO proposals (user_id, obra_codigo, obra_nome, quadra, lote, payload) VALUES (?, ?, ?, ?, ?, ?)",
                      (user_id, obra_codigo, obra_nome, quadra, lote, json.dumps(payload)), commit=True)
    return True

def update_proposal(proposal_id, obra_codigo, obra_nome, quadra, lote, payload):
    data = {
        "obra_codigo": obra_codigo,
        "obra_nome": obra_nome,
        "quadra": quadra,
        "lote": lote,
        "payload": payload,
        "updated_at": datetime.datetime.now().isoformat()
    }
    if SUPABASE_URL:
        query_supabase_rest('proposals', 'PATCH', f"id=eq.{proposal_id}", data=data)
    db_execute_sqlite("UPDATE proposals SET payload = ?, obra_codigo = ?, obra_nome = ?, quadra = ?, lote = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                      (json.dumps(payload), obra_codigo, obra_nome, quadra, lote, proposal_id), commit=True)
    return True

def delete_proposal(proposal_id):
    if SUPABASE_URL:
        query_supabase_rest('proposals', 'DELETE', f"id=eq.{proposal_id}")
    return db_execute_sqlite("DELETE FROM proposals WHERE id = ?", (proposal_id,), commit=True)
