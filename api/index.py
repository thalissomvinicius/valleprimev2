from flask import Flask, request, jsonify, send_file, after_this_request
from flask_cors import CORS
import os
import tempfile
from io import BytesIO
import datetime
import traceback
import json
import sqlite3
import hashlib
import secrets
import sys
import requests
import jwt
from functools import wraps

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

SECRET_KEY = os.environ.get('SECRET_KEY', 'dev_secret_key_valle_prime_v2')

# Default admin permissions for frontend filters
ADMIN_OBRAS = ['600', '601', '602', '603', '604', '605', '610', '616', '618', '620', '621', '623', '624', '625']
ADMIN_STATUS = ['0 - Disponível', '1 - Vendido', '2 - Reservado', '4 - Quitado', '7 - Suspenso', '8 - Fora de venda']

# Database path for SQLite (persistência: use SUPABASE em produção ou DB_PATH em volume persistente)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if os.environ.get('DB_PATH'):
    DB_PATH = os.environ.get('DB_PATH')
elif os.environ.get('VERCEL') == '1' or (os.path.exists('/tmp') and not os.environ.get('SUPABASE_URL')):
    DB_PATH = '/tmp/clients.db'
else:
    DB_PATH = os.path.join(BASE_DIR, 'clients.db')

# Supabase REST Config
SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_ANON_KEY')

# PDF Engine placeholder (import relativo: módulo está em api/generate_proposal_reportlab.py)
generate_pdf_reportlab = None
_pdf_import_error = None
try:
    from .generate_proposal_reportlab import generate_pdf_reportlab as _generate_pdf_reportlab
    generate_pdf_reportlab = _generate_pdf_reportlab
except Exception as e:
    _pdf_import_error = str(e)
    print(f"[PDF] ReportLab not available: {_pdf_import_error}")

def get_db_connection():
    # Only SQLite fallback now
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn, 'sqlite'

def query_supabase_rest(table, method='GET', params=None, data=None, return_error=False):
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
            response = requests.get(url, headers=headers, timeout=10)
        elif method == 'POST':
            response = requests.post(url, headers=headers, json=data, timeout=10)
        elif method == 'PATCH':
            response = requests.patch(url, headers=headers, json=data, timeout=10)
        elif method == 'DELETE':
            response = requests.delete(url, headers=headers, timeout=10)
        
        # Log response for debug
        print(f"[Supabase REST] {method} {url} -> {response.status_code}")
        
        if response.status_code in [200, 201, 204, 206]:
            if not response.text: return True
            try:
                return response.json()
            except:
                return True
        
        print(f"[Supabase REST ERROR] {response.status_code}: {response.text}")
        if return_error:
            return {"status": response.status_code, "error": response.text}
        return None
    except Exception as e:
        print(f"[Supabase REST EXCEPTION] {e}")
        if return_error:
            return {"status": "exception", "error": str(e)}
        return None

def query_db(sql, params=(), one=False, commit=False):
    # Try Supabase REST API first if configured and it's a known simple query
    if SUPABASE_URL and SUPABASE_KEY:
        table = None
        if "FROM clients" in sql or "INTO clients" in sql: table = "clients"
        elif "FROM users" in sql or "INTO users" in sql: table = "users"
        
        if table:
            try:
                # Handle INSERT
                if "INSERT INTO" in sql:
                    # Very basic parser for our specific inserts
                    if table == "clients":
                        payload = {
                            "nome": params[0],
                            "cpf_cnpj": params[1],
                            "tipo_pessoa": params[2],
                            "created_by": params[3],
                            "data": params[4]
                        }
                    else: # users
                        payload = {
                            "username": params[0],
                            "password_hash": params[1],
                            "nome": params[2],
                            "role": params[3],
                            "active": params[4],
                            "permissions": params[5] if len(params) > 5 else None
                        }
                    res = query_supabase_rest(table, 'POST', data=payload)
                    return True if res is not None else False
                
                # Handle DELETE
                if "DELETE FROM" in sql:
                    where_id = f"id=eq.{params[0]}"
                    res = query_supabase_rest(table, 'DELETE', params=where_id)
                    return True if res is not None else False

                # Handle SELECT COUNT
                if "COUNT(*)" in sql:
                    where_clause = None
                    if "WHERE" in sql:
                        if "created_by =" in sql:
                            where_clause = f"created_by=eq.{params[0]}"
                        elif "id =" in sql:
                            where_clause = f"id=eq.{params[0]}"
                    
                    # PostgREST count is a bit tricky, but we'll use a simple approach
                    # Just get the list and return length or use Prefer: count=exact if needed
                    # For now, let's get matching items
                    res = query_supabase_rest(table, 'GET', params=where_clause)
                    count = len(res) if isinstance(res, list) else 0
                    return {"count": count} if one else [{"count": count}]

                # Handle SELECT (ALL, specific columns, or WHERE)
                if "SELECT" in sql.upper():
                    rest_params = []
                    
                    # Handle WHERE clauses
                    if "WHERE" in sql.upper():
                        # Try to extract equality filters (very basic parser)
                        import re
                        # Supports ?, %s and direct values in simple cases
                        # This is a bit naive but covers our specific needs
                        where_match = re.search(r"WHERE\s+(.+?)(?:ORDER BY|LIMIT|$)", sql, re.IGNORECASE | re.DOTALL)
                        if where_match:
                            where_part = where_match.group(1)
                            # Match patterns like "column = ?" or "column = %s"
                            filter_matches = re.findall(r"(\w+)\s*=\s*(\?|%s)", where_part)
                            for i, (col, placeholder) in enumerate(filter_matches):
                                if i < len(params):
                                    val = params[i]
                                    if isinstance(val, bool):
                                        val = str(val).lower()
                                    rest_params.append(f"{col}=eq.{val}")
                    
                    # Handle ORDER BY
                    if "ORDER BY created_at DESC" in sql:
                        rest_params.append("order=created_at.desc")
                    elif "ORDER BY id" in sql:
                        rest_params.append("order=id.asc")
                    
                    final_params = "&".join(rest_params) if rest_params else ""
                    # If we have specific columns, we could try to parse them, 
                    # but select=* is safer for our simple Row to Dict mapping
                    if not any(p.startswith("select=") for p in rest_params):
                        final_params = (final_params + "&" if final_params else "") + "select=*"
                        
                    res = query_supabase_rest(table, 'GET', params=final_params)
                    
                    if one:
                        return res[0] if (isinstance(res, list) and len(res) > 0) else None
                    return res or []

            except Exception as api_err:
                print(f"[Supabase API Fallback Error] {api_err}")
                import traceback
                traceback.print_exc()

    # Original direct connection logic
    conn, db_type = None, None
    try:
        conn, db_type = get_db_connection()
        cur = conn.cursor()
        if db_type == 'postgres':
            sql = sql.replace('?', '%s')
        cur.execute(sql, params)
        rowcount = cur.rowcount
        if commit:
            conn.commit()
            print(f"[DB] Committed. Rowcount: {rowcount}")
            return True
        if one:
            rv = cur.fetchone()
            if rv:
                col_names = [desc[0] for desc in cur.description]
                result = dict(zip(col_names, rv))
                # Convert datetime to string for JSON compatibility
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
                # Convert datetime to string for JSON compatibility
                for key, val in row_dict.items():
                    if isinstance(val, (datetime.datetime, datetime.date)):
                        row_dict[key] = val.isoformat()
                results.append(row_dict)
            return results
        return []
    except Exception as e:
        print(f"QUERY ERROR: {e}")
        if conn:
            try:
                conn.rollback()
            except:
                pass
        # Re-raise the exception instead of returning None
        raise
    finally:
        if conn: 
            try:
                conn.close()
            except:
                pass

def hash_password(password):
    salt = secrets.token_hex(16)
    return hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000).hex() + ':' + salt

def verify_password(stored_password, provided_password):
    try:
        password_hash, salt = stored_password.split(':')
        new_hash = hashlib.pbkdf2_hmac('sha256', provided_password.encode(), salt.encode(), 100000).hex()
        return new_hash == password_hash
    except:
        return False

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(" ")[1]
        if not token:
            return jsonify({'message': 'Token missing'}), 401
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            request.user_id = data['user_id']
            request.user_role = data.get('role')
        except:
            return jsonify({'message': 'Invalid token'}), 401
        return f(*args, **kwargs)
    return decorated

@app.route('/api/hello')
def hello():
    # v8.6 Full REST mapping with DELETE support
    return jsonify({"status": "ok", "message": "Full system restored (v8.8-force-deploy)", "time": datetime.datetime.now().isoformat()})

def migrate_db_internal():
    """Internal migration logic to ensure tables exist"""
    try:
        conn, db_type = get_db_connection()
        cur = conn.cursor()
        
        if db_type == 'postgres':
            cur.execute("""
                CREATE TABLE IF NOT EXISTS clients (
                    id SERIAL PRIMARY KEY,
                    nome TEXT NOT NULL,
                    cpf_cnpj TEXT NOT NULL,
                    tipo_pessoa TEXT NOT NULL DEFAULT 'PF',
                    created_by TEXT,
                    data TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    nome TEXT,
                    role TEXT DEFAULT 'user',
                    permissions TEXT,
                    active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
        else:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS clients (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome TEXT NOT NULL,
                    cpf_cnpj TEXT NOT NULL,
                    tipo_pessoa TEXT NOT NULL DEFAULT 'PF',
                    created_by TEXT,
                    data TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    nome TEXT,
                    role TEXT DEFAULT 'user',
                    permissions TEXT,
                    active BOOLEAN DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
        # Ensure admin user exists
        admin_exists = False
        if db_type == 'postgres':
            cur.execute("SELECT 1 FROM users WHERE username = 'admin'")
            admin_exists = bool(cur.fetchone())
        else:
            cur.execute("SELECT 1 FROM users WHERE username = 'admin'")
            admin_exists = bool(cur.fetchone())
            
        if not admin_exists:
            # Hash for 'admin123'
            # salt: 1234567890abcdef1234567890abcdef
            # pbkdf2: SHA256, 100k, admin123 -> a09be...
            default_hash = "a09be37937be13180bb2ef0133b37803df3bf7c2688029514e868f0b09315d16:1234567890abcdef1234567890abcdef"
            if db_type == 'postgres':
                cur.execute("INSERT INTO users (username, password_hash, nome, role, active) VALUES (%s, %s, %s, %s, %s)",
                           ('admin', default_hash, 'Administrador', 'admin', True))
            else:
                cur.execute("INSERT INTO users (username, password_hash, nome, role, active) VALUES (?, ?, ?, ?, ?)",
                           ('admin', default_hash, 'Administrador', 'admin', 1))
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"MIGRATION ERROR: {e}")
        traceback.print_exc()
        return False

@app.route('/api/debug/db')
def debug_db():
    try:
        # Test manual insert if requested
        if request.args.get('test_insert') == 'true':
            query_db("INSERT INTO clients (nome, cpf_cnpj, tipo_pessoa, created_by, data) VALUES (?, ?, ?, ?, ?)",
                     ("Teste Manual", "00000000000", "PF", "system", "{}"), commit=True)
            return jsonify({"message": "Manual test insert executed. Refresh this page to see count."})

        clients_count = query_db("SELECT COUNT(*) as count FROM clients", one=True)
        users_count = query_db("SELECT COUNT(*) as count FROM users", one=True)
        last_clients = query_db("SELECT id, nome, created_at, created_by FROM clients ORDER BY id DESC LIMIT 5")
        
        # Environment check (hiding secrets)
        env_vars = {k: "SET" if "KEY" in k or "URL" in k or "PASSWORD" in k or "SECRET" in k else v 
                   for k, v in os.environ.items() if k in ['DATABASE_URL', 'DATABASE_URL1', 'VERCEL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']}
        
        return jsonify({
            "database": "connected",
            "clients_total": clients_count['count'] if clients_count else 0,
            "users_total": users_count['count'] if users_count else 0,
            "last_clients": last_clients or [],
            "supabase_api": {
                "active": bool(SUPABASE_URL and SUPABASE_KEY),
                "url": SUPABASE_URL
            },
            "env_check": env_vars
        })
    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500

@app.route('/api/migrate-db')
def migrate_db():
    if migrate_db_internal():
        return jsonify({"success": True, "message": "Database initialized/migrated"})
    else:
        return jsonify({"success": False, "message": "Migration failed (check logs)"}), 500

# Rota para verificar autenticação (usada pelo frontend ao carregar a página)
@app.route('/api/auth/me', methods=['GET'])
def auth_me():
    """Valida token JWT e retorna dados do usuário"""
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return jsonify({'message': 'Token required'}), 401
    
    token = auth_header.split(' ')[1]
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        
        # Buscar no banco para retornar os dados reais e permissões
        user = query_db("SELECT id, username, nome, role, permissions, active FROM users WHERE id = ?", (payload.get('user_id'),), one=True)
        
        if not user or not user.get('active'):
            return jsonify({'message': 'User not found or inactive'}), 401
            
        perms = user.get('permissions') or {}
        if isinstance(perms, str):
            try: perms = json.loads(perms)
            except: perms = {}

        # Ensure admin has all permissions if role is admin
        if user['role'] == 'admin':
            if not perms: perms = {}
            perms['canViewAllClients'] = True
            perms['obrasPermitidas'] = ADMIN_OBRAS
            perms['statusPermitidos'] = ADMIN_STATUS

        return jsonify({
            'user': {
                'id': user['id'],
                'username': user['username'],
                'role': user['role'],
                'active': user['active'],
                'nome': user.get('nome'),
                'permissions': perms
            }
        })
    except jwt.ExpiredSignatureError:
        return jsonify({'message': 'Token expired'}), 401
    except jwt.InvalidTokenError:
        return jsonify({'message': 'Invalid token'}), 401

# ROTA ALTERNATIVA GET - para contornar problema de body parsing no Vercel
@app.route('/api/login-get', methods=['GET'])
def login_get():
    """Login via GET parameters - bypass for Vercel body parsing issue"""
    username = request.args.get('username', '').strip()
    password = request.args.get('password', '')
    
    if not username or not password:
        return jsonify({'message': 'Credentials required'}), 400
    
    return login_internal(username, password)

@app.route('/api/auth/login', methods=['POST'])
@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json(silent=True) or {}
        username = data.get('username', '').strip()
        password = data.get('password', '')
        return login_internal(username, password)
    except Exception as e:
        traceback.print_exc()
        return jsonify({'message': 'Erro interno de login', 'error': str(e)}), 500

def login_internal(username, password):
    try:
        if not username or not password:
            return jsonify({'message': 'Credentials required'}), 400
        
        # USE query_db for consistency and Supabase support
        user = query_db("SELECT * FROM users WHERE username = ? AND active = ?", (username, True), one=True)
        
        # If user not found and table might be empty, try to create admin once
        if not user and username == 'admin' and password == 'admin123':
            cnt_res = query_db("SELECT COUNT(*) as count FROM users", one=True)
            cnt = cnt_res['count'] if cnt_res else 0

            if cnt == 0:
                pw_hash = hash_password('admin123')
                query_db("INSERT INTO users (username, password_hash, nome, role, active, permissions) VALUES (?, ?, ?, ?, ?, ?)",
                        ('admin', pw_hash, 'Admin', 'admin', True, json.dumps({"canViewAllClients": True})), commit=True)
                # Re-fetch
                user = query_db("SELECT * FROM users WHERE username = ? AND active = ?", (username, True), one=True)

        if not user:
            return jsonify({'message': 'Credenciais inválidas (Usuário não encontrado)'}), 401
            
        if not verify_password(user['password_hash'], password):
            return jsonify({'message': 'Credenciais inválidas (Senha incorreta)'}), 401
        
        try:
            token = jwt.encode({
                'user_id': user['id'],
                'role': user['role'],
                'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=12)
            }, SECRET_KEY, algorithm="HS256")
            if isinstance(token, bytes): token = token.decode('utf-8')
        except Exception as jwt_err:
            return jsonify({'message': 'JWT Encoding Error', 'error': str(jwt_err)}), 500
        
        perms = {}
        target_perms = user.get('permissions')
        if target_perms:
            try: perms = json.loads(target_perms) if isinstance(target_perms, str) else target_perms
            except: pass
        
        # Ensure admin has all permissions if role is admin
        if user['role'] == 'admin':
            if not perms: perms = {}
            perms['canViewAllClients'] = True
            perms['obrasPermitidas'] = ADMIN_OBRAS
            perms['statusPermitidos'] = ADMIN_STATUS

        return jsonify({
            'token': token,
            'user': {
                'id': user['id'],
                'username': user['username'],
                'role': user['role'],
                'permissions': perms
            }
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'message': 'Erro interno no processamento de login', 'error': str(e)}), 500

# Cache da consulta de lotes (por código da obra, TTL em segundos)
_consulta_cache = {}
CONSULTA_CACHE_TTL = int(os.environ.get('CONSULTA_CACHE_TTL', 120))  # 2 min

@app.route('/api/availability')
def get_availability():
    numprod_psc = request.args.get('numprod_psc', '624')
    return fetch_consulta(numprod_psc)

@app.route('/api/consulta/<codigo>')
@app.route('/api/consulta/<codigo>/')
def get_consulta(codigo):
    """Rota alternativa para compatibilidade com frontend"""
    return fetch_consulta(codigo)

def fetch_consulta(numprod_psc):
    """Busca dados de lotes do servidor externo ou fallback local (com cache)."""
    now = datetime.datetime.utcnow().timestamp()
    cached = _consulta_cache.get(numprod_psc)
    if cached and (now - cached['ts']) < CONSULTA_CACHE_TTL:
        return jsonify(cached['data'])

    try:
        # Try fetching from external API with timeout
        try:
            resp = requests.get(f"http://177.221.240.85:8000/api/consulta/{numprod_psc}/", timeout=8)
            if resp.status_code == 200:
                data = resp.json()
                _consulta_cache[numprod_psc] = {'ts': now, 'data': data}
                return jsonify(data)
        except Exception:
            pass

        # Fallback to local files
        filename = f"fallback_{numprod_psc}.json"
        filepath = os.path.join(BASE_DIR, filename)
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8-sig') as f:
                data = json.load(f)
            _consulta_cache[numprod_psc] = {'ts': now, 'data': data}
            return jsonify(data)

        return jsonify({"data": []})
    except Exception as e:
        print(f"[ERROR] fetch_consulta {numprod_psc}: {e}")
        return jsonify({"data": [], "error": str(e)})

@app.route('/api/clients/<int:client_id>', methods=['DELETE'])
@app.route('/api/manage-clients/<int:client_id>', methods=['DELETE'])
@token_required
def delete_client(client_id):
    """Delete a specific client by ID"""
    try:
        print(f"[DEBUG] DELETE Client {client_id} by user {request.user_id}")
        
        # Check if user can delete this client
        can_delete = request.user_role == 'admin'
        if not can_delete:
            # Check if user owns this client
            client = query_db("SELECT created_by FROM clients WHERE id = ?", (client_id,), one=True)
            if client and str(client.get('created_by')) == str(request.user_id):
                can_delete = True
        
        if not can_delete:
            return jsonify({'success': False, 'error': 'Sem permissão para excluir este cliente'}), 403
        
        # Delete the client
        query_db("DELETE FROM clients WHERE id = ?", (client_id,), commit=True)
        
        return jsonify({'success': True, 'message': 'Cliente excluído com sucesso'})
    except Exception as e:
        print(f"[ERROR] Delete client: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/clients', methods=['GET', 'POST'])
@app.route('/api/manage-clients', methods=['GET', 'POST'])
@token_required
def manage_clients():
    if request.method == 'GET':
        print(f"[DEBUG] GET Clients for user_id: {request.user_id}, role: {request.user_role}")
        
        # Get query parameters
        search = request.args.get('q', '').strip()
        type_filter = request.args.get('type', '').strip().upper()  # 'PF' or 'PJ'
        created_by_filter = request.args.get('created_by', '').strip()
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 50))
        offset = (page - 1) * limit
        
        can_see_all = request.user_role == 'admin'
        if not can_see_all:
             # Check specific permissions
             user = query_db("SELECT permissions FROM users WHERE id = ?", (request.user_id,), one=True)
             perms = json.loads(user['permissions']) if user and user['permissions'] else {}
             can_see_all = perms.get('canViewAllClients', False)
        
        search_digits = ''.join(c for c in search if c.isdigit())

        def _fetch_clients_sqlite():
            conditions = []
            params = []

            if type_filter in ['PF', 'PJ']:
                conditions.append("tipo_pessoa = ?")
                params.append(type_filter)

            if not can_see_all:
                conditions.append("created_by = ?")
                params.append(str(request.user_id))
            elif created_by_filter:
                conditions.append("created_by = ?")
                params.append(created_by_filter)

            if search:
                conditions.append("(nome LIKE ? OR cpf_cnpj LIKE ?)")
                params.append(f"%{search}%")
                params.append(f"%{search_digits or search}%")

            where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""
            count_sql = f"SELECT COUNT(*) as count FROM clients{where_clause}"
            count_result = query_db(count_sql, tuple(params), one=True)
            total = count_result['count'] if count_result else 0

            select_sql = f"SELECT * FROM clients{where_clause} ORDER BY created_at DESC LIMIT ? OFFSET ?"
            params.extend([limit, offset])
            rows = query_db(select_sql, tuple(params))
            return rows, total

        # Prefer Supabase REST if configured to avoid SQLite mismatch
        if SUPABASE_URL and SUPABASE_KEY:
            use_sqlite = False
            params = ["select=*"]
            if type_filter in ['PF', 'PJ']:
                params.append(f"tipo_pessoa=eq.{type_filter}")
            if not can_see_all:
                params.append(f"created_by=eq.{request.user_id}")
            elif created_by_filter:
                params.append(f"created_by=eq.{created_by_filter}")
            if search:
                safe_term = search.replace('*', '').replace('%', '')
                if search_digits:
                    params.append(f"or=(nome.ilike.*{safe_term}*,cpf_cnpj.ilike.*{search_digits}*)")
                else:
                    params.append(f"or=(nome.ilike.*{safe_term}*,cpf_cnpj.ilike.*{safe_term}*)")
            params.append("order=created_at.desc")
            params.append(f"limit={limit}")
            params.append(f"offset={offset}")

            clients = query_supabase_rest("clients", "GET", params="&".join(params), return_error=True)
            if isinstance(clients, dict) and clients.get("error"):
                err_text = str(clients.get("error", ""))
                if "tipo_pessoa" in err_text:
                    params = [p for p in params if not p.startswith("tipo_pessoa=")]
                    clients = query_supabase_rest("clients", "GET", params="&".join(params), return_error=True)
                if isinstance(clients, dict) and clients.get("error") and ("PGRST205" in str(clients.get("error")) or "Could not find the table" in str(clients.get("error"))):
                    use_sqlite = True
                if use_sqlite:
                    clients, total_count = _fetch_clients_sqlite()
                    clients = clients or []
                    # Skip Supabase count
                    count_res = None
                else:
                    count_res = None
                if isinstance(clients, dict) and clients.get("error") and not use_sqlite:
                    return jsonify({
                        "success": False,
                        "error": "Erro ao buscar clientes (Supabase)",
                        "details": clients
                    }), 500
            clients = clients or []

            # Total count (fallback to list length if error)
            if not use_sqlite:
                count_params = ["select=id"]
                if type_filter in ['PF', 'PJ']:
                    count_params.append(f"tipo_pessoa=eq.{type_filter}")
                if not can_see_all:
                    count_params.append(f"created_by=eq.{request.user_id}")
                elif created_by_filter:
                    count_params.append(f"created_by=eq.{created_by_filter}")
                if search:
                    safe_term = search.replace('*', '').replace('%', '')
                    if search_digits:
                        count_params.append(f"or=(nome.ilike.*{safe_term}*,cpf_cnpj.ilike.*{search_digits}*)")
                    else:
                        count_params.append(f"or=(nome.ilike.*{safe_term}*,cpf_cnpj.ilike.*{safe_term}*)")

                count_res = query_supabase_rest("clients", "GET", params="&".join(count_params), return_error=True)
                if isinstance(count_res, dict) and count_res.get("error"):
                    err_text = str(count_res.get("error", ""))
                    if "tipo_pessoa" in err_text:
                        count_params = [p for p in count_params if not p.startswith("tipo_pessoa=")]
                        count_res = query_supabase_rest("clients", "GET", params="&".join(count_params), return_error=True)
                if isinstance(count_res, list):
                    total_count = len(count_res)
                else:
                    total_count = len(clients)

        else:
            # Build WHERE clause (SQLite)
            conditions = []
            params = []
            
            # Filter by type (PF/PJ)
            if type_filter in ['PF', 'PJ']:
                conditions.append("tipo_pessoa = ?")
                params.append(type_filter)
            
            # Filter by created_by (if user can't see all, or if explicitly filtered)
            if not can_see_all:
                conditions.append("created_by = ?")
                params.append(str(request.user_id))
            elif created_by_filter:
                conditions.append("created_by = ?")
                params.append(created_by_filter)
            
            # Search filter
            if search:
                conditions.append("(nome LIKE ? OR cpf_cnpj LIKE ?)")
                params.append(f"%{search}%")
                params.append(f"%{search_digits or search}%")
            
            where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""
            
            # Count total
            count_sql = f"SELECT COUNT(*) as count FROM clients{where_clause}"
            count_result = query_db(count_sql, tuple(params), one=True)
            total_count = count_result['count'] if count_result else 0
            
            # Get clients with pagination
            select_sql = f"SELECT * FROM clients{where_clause} ORDER BY created_at DESC LIMIT ? OFFSET ?"
            params.extend([limit, offset])
            clients = query_db(select_sql, tuple(params))
        
        print(f"[DEBUG] Found {len(clients) if clients else 0} clients (total: {total_count})")
        
        # Parse 'data' field from JSON string to object for each client
        if isinstance(clients, list):
            for client in clients:
                if 'data' in client and client['data']:
                    try:
                        if isinstance(client['data'], str):
                            client['data'] = json.loads(client['data'])
                    except json.JSONDecodeError:
                        client['data'] = {}
                else:
                    client['data'] = {}
            
            return jsonify({
                "success": True,
                "clients": clients,
                "total_count": total_count
            })
        return jsonify({"success": True, "clients": [], "total_count": 0})

    if request.method == 'POST':
        try:
            data = request.get_json()
            print(f"[DEBUG] Received data keys: {list(data.keys()) if data else 'None'}")
            
            if not data:
                return jsonify({'success': False, 'error': 'No data provided'}), 400
            
            # Check if this is an UPDATE (client_id provided) or INSERT (new client)
            client_id = data.get('client_id') or data.get('id')
            
            # Robust data extraction for both sources (Proposal vs Client Tab)
            nome = data.get('nome') or data.get('nome_proponente') or data.get('razao_social_proponente')
            cpf_cnpj = data.get('cpf_cnpj') or data.get('cpf_cnpj_proponente')
            tipo_pessoa = data.get('tipo_pessoa', 'PF').upper()
            
            # Clean CPF/CNPJ - remove formatting for storage
            if cpf_cnpj:
                cpf_cnpj_clean = ''.join(c for c in cpf_cnpj if c.isdigit())
            else:
                cpf_cnpj_clean = ''
            
            print(f"[DEBUG] Extracted - nome: {nome}, cpf_cnpj: {cpf_cnpj_clean}, tipo_pessoa: {tipo_pessoa}, client_id: {client_id}")
            
            if not nome or not cpf_cnpj_clean:
                return jsonify({
                    'success': False, 
                    'error': 'Campos obrigatórios faltando',
                    'message': 'Nome e CPF/CNPJ são obrigatórios',
                    'required': ['nome or nome_proponente', 'cpf_cnpj or cpf_cnpj_proponente']
                }), 400
            
            # Prepare data JSON (remove id/client_id to avoid recursion)
            data_to_store = {k: v for k, v in data.items() if k not in ['id', 'client_id', 'created_by']}
            data_json = json.dumps(data_to_store, ensure_ascii=False)

            # Prefer Supabase REST if configured
            if SUPABASE_URL and SUPABASE_KEY:
                error_details = None
                # Permission check for update (only admin or owner)
                if client_id and request.user_role != 'admin':
                    owner_res = query_supabase_rest(
                        "clients",
                        "GET",
                        params=f"select=created_by&id=eq.{client_id}",
                        return_error=True
                    )
                    if isinstance(owner_res, dict) and owner_res.get("error"):
                        return jsonify({'success': False, 'error': 'Erro ao validar permissões', 'details': owner_res}), 500
                    if owner_res and str(owner_res[0].get('created_by')) != str(request.user_id):
                        return jsonify({'success': False, 'error': 'Sem permissão para editar este cliente'}), 403

                payload = {
                    "nome": nome,
                    "cpf_cnpj": cpf_cnpj_clean,
                    "tipo_pessoa": tipo_pessoa,
                    "data": data_to_store
                }
                if not client_id:
                    payload["created_by"] = str(request.user_id)

                if client_id:
                    print(f"[DEBUG] Attempting Supabase UPDATE client {client_id}: {nome}")
                    res = query_supabase_rest(
                        "clients",
                        "PATCH",
                        params=f"id=eq.{client_id}",
                        data=payload,
                        return_error=True
                    )
                    # Retry with JSON string if data column is TEXT
                    if isinstance(res, dict) and res.get("error"):
                        error_details = res
                        err_text = str(res.get("error", ""))
                        if "tipo_pessoa" in err_text:
                            payload.pop("tipo_pessoa", None)
                        if "created_by" in err_text:
                            payload.pop("created_by", None)
                        payload["data"] = data_json
                        res = query_supabase_rest(
                            "clients",
                            "PATCH",
                            params=f"id=eq.{client_id}",
                            data=payload,
                            return_error=True
                        )
                    if isinstance(res, dict) and res.get("error"):
                        error_details = res
                    success = not (isinstance(res, dict) and res.get("error"))
                    action = 'atualizado'
                else:
                    print(f"[DEBUG] Attempting Supabase INSERT client: {nome} - {cpf_cnpj_clean}")
                    res = query_supabase_rest(
                        "clients",
                        "POST",
                        data=payload,
                        return_error=True
                    )
                    # Retry with JSON string if data column is TEXT
                    if isinstance(res, dict) and res.get("error"):
                        error_details = res
                        err_text = str(res.get("error", ""))
                        if "tipo_pessoa" in err_text:
                            payload.pop("tipo_pessoa", None)
                        if "created_by" in err_text:
                            payload.pop("created_by", None)
                        payload["data"] = data_json
                        res = query_supabase_rest(
                            "clients",
                            "POST",
                            data=payload,
                            return_error=True
                        )
                    if isinstance(res, dict) and res.get("error"):
                        error_details = res
                    success = not (isinstance(res, dict) and res.get("error"))
                    action = 'salvo'
            else:
                if client_id:
                    # UPDATE existing client
                    print(f"[DEBUG] Attempting to UPDATE client {client_id}: {nome}")
                    success = query_db(
                        "UPDATE clients SET nome = ?, cpf_cnpj = ?, tipo_pessoa = ?, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                        (nome, cpf_cnpj_clean, tipo_pessoa, data_json, client_id), 
                        commit=True
                    )
                    action = 'atualizado'
                else:
                    # INSERT new client
                    print(f"[DEBUG] Attempting to INSERT client: {nome} - {cpf_cnpj_clean}")
                    success = query_db(
                        "INSERT INTO clients (nome, cpf_cnpj, tipo_pessoa, created_by, data) VALUES (?, ?, ?, ?, ?)",
                        (nome, cpf_cnpj_clean, tipo_pessoa, str(request.user_id), data_json), 
                        commit=True
                    )
                    action = 'salvo'
            
            print(f"[DEBUG] Database operation result: {success}")
            
            if success:
                return jsonify({'success': True, 'message': f'Cliente {action} com sucesso'})
            else:
                if SUPABASE_URL and SUPABASE_KEY and error_details:
                    return jsonify({
                        'success': False,
                        'error': 'Falha ao salvar no Supabase',
                        'details': error_details
                    }), 500
                return jsonify({'success': False, 'error': 'Falha ao salvar no banco de dados'}), 500

        except Exception as e:
            error_trace = traceback.format_exc()
            print(f"[ERROR] Exception saving client: {str(e)}")
            print(f"[ERROR] Traceback: {error_trace}")
            return jsonify({
                'success': False,
                'error': f'Erro ao salvar cliente: {str(e)}',
                'message': str(e),
                'trace': error_trace if os.getenv('VERCEL') else None
            }), 500


def _format_currency_br(value):
    """Format number as Brazilian currency string (e.g. 1234.56 -> 1.234,56)"""
    if value is None or (isinstance(value, (int, float)) and not (value == value)):
        return "0,00"
    try:
        n = float(value) if not isinstance(value, (int, float)) else value
        return f"{n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except (TypeError, ValueError):
        return str(value) if value else "0,00"


def _parse_currency_value(val):
    """Parse value that can be number (19777.97) or BR string ('19.777,97'). Do NOT strip dots when it's already a number."""
    if val is None or val == "":
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip()
    if not s:
        return None
    # String with comma = Brazilian format (19.777,97)
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _plan_type_label(num_parcelas):
    """Retorna o rótulo do plano para o PDF (igual à lógica do frontend: Fixas, Corrigidas, Reajustáveis)."""
    n = int(num_parcelas) if num_parcelas is not None else 1
    if n <= 1:
        return "À VISTA"
    if n <= 36:
        return "FIXA"
    if n <= 72:
        return "CORRIGIDA"
    return "REAJUSTÁVEL"


def _normalize_proposal_data(data):
    """Build flat dict for PDF from frontend payload (lot, obraName, clientData, etc.)."""
    flat = {}
    # 1) Flatten nested client "data" (from API response)
    if isinstance(data.get("data"), dict):
        for k, v in data["data"].items():
            if k not in flat and v is not None and v != "":
                flat[k] = v
    # 2) Copy all scalar values from top-level (client form + proposal fields)
    for k, v in data.items():
        if k in ("lot", "data"):
            continue
        if isinstance(v, (dict, list)):
            continue
        if v is not None and v != "":
            flat[k] = v
    # 3) Map "lot" object -> lote, quadra, area, logradouro, empreendimento, cidade, estado
    lot = data.get("lot") or {}
    if isinstance(lot, dict):
        flat["lote"] = flat.get("lote") or str(lot.get("LT", ""))
        flat["quadra"] = flat.get("quadra") or str(lot.get("QD", ""))
        flat["area"] = flat.get("area") or str(lot.get("M2", "") or lot.get("Area", ""))
        flat["logradouro"] = flat.get("logradouro") or str(lot.get("Logradouro", ""))
        emp_raw = flat.get("empreendimento") or data.get("obraName") or str(lot.get("Descricao_Empreendimento", ""))
        # Separar nome do loteamento de "CIDADE" quando vier "NOME - CIDADE" (ex: "RESIDENCIAL JARDIM DO VALLE - DOM ELISEU")
        if emp_raw and " - " in emp_raw and not (flat.get("cidade_empreendimento") or lot.get("Cidade") or lot.get("Estado")):
            parts = emp_raw.split(" - ", 1)
            flat["empreendimento"] = parts[0].strip()
            flat["cidade_empreendimento"] = parts[1].strip() if len(parts) > 1 else ""
        else:
            flat["empreendimento"] = emp_raw
            flat["cidade_empreendimento"] = flat.get("cidade_empreendimento") or str(lot.get("Cidade", "") or lot.get("cidade_empreendimento", ""))
        flat["estado_empreendimento"] = flat.get("estado_empreendimento") or str(lot.get("Estado", "") or lot.get("UF", "") or lot.get("estado_empreendimento", "") or "")
        # Estado padrão PA quando há cidade e estado vazio (empreendimentos no Pará)
        if flat.get("cidade_empreendimento") and not flat.get("estado_empreendimento"):
            flat["estado_empreendimento"] = "PA"
    # 4) valor_inicial from lotValue (pode vir número 19777.97 ou string "19.777,97")
    lot_val = _parse_currency_value(data.get("lotValue"))
    if lot_val is not None:
        flat["valor_inicial"] = _format_currency_br(lot_val)
    # 5) Saldo a parcelar: qtd, valor por parcela, periodicidade, tipo
    remaining = _parse_currency_value(data.get("remainingBalance"))
    n_installments = data.get("balanceInstallments")
    try:
        rem = float(remaining) if remaining is not None else 0
        n_inst = int(n_installments) if n_installments else 0
        if n_inst > 0 and rem >= 0:
            flat["saldo_qtd_parcelas"] = str(n_inst).zfill(2)
            flat["saldo_valor_parcela"] = flat.get("saldo_valor_parcela") or _format_currency_br(rem / n_inst)
            flat["saldo_periodicidade"] = flat.get("saldo_periodicidade") or ("MENSAL" if n_inst > 1 else "ÚNICA")
            flat["saldo_tipo_parcela"] = flat.get("saldo_tipo_parcela") or _plan_type_label(n_inst)
        if rem >= 0:
            flat["valor_saldo_parcelar"] = flat.get("valor_saldo_parcelar") or _format_currency_br(rem)
    except (TypeError, ValueError):
        pass
    # 6) Data da proposta -> dia, mês por extenso em CAIXA ALTA, ano (ex: 04 de FEVEREIRO de 2026)
    MESES = ("janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro")
    proposta_data = data.get("proposta_data") or flat.get("proposta_data")
    if proposta_data:
        parts = str(proposta_data).split("T")[0].split("-")
        if len(parts) == 3:
            yyyy, mm, dd = parts[0], parts[1], parts[2]
            flat["ano_proposta_final"] = yyyy
            try:
                nome_mes = MESES[int(mm) - 1] if 1 <= int(mm) <= 12 else str(mm)
                flat["mes_proposta_final"] = nome_mes.upper()
            except (ValueError, IndexError):
                flat["mes_proposta_final"] = str(mm).upper()
            flat["dia_proposta_final"] = dd
        # Rodapé: CIDADE/UF do loteamento (ex.: DOM ELISEU/PA)
        cidade_lote = flat.get("cidade_empreendimento") or flat.get("cidade_proponente") or ""
        uf_lote = flat.get("estado_empreendimento") or ""
        if cidade_lote and uf_lote:
            flat["cidade_proposta_final"] = flat.get("cidade_proposta_final") or f"{cidade_lote}/{uf_lote}"
        else:
            flat["cidade_proposta_final"] = flat.get("cidade_proposta_final") or cidade_lote or uf_lote
    # 7) Valor total entrada — usar apenas valor da entrada (entradaValue/valor_total_entrada), nunca sinal/comissão
    entrada_total = _parse_currency_value(data.get("valor_total_entrada") or data.get("entradaValue"))
    if entrada_total is None and (flat.get("entrada_qtd_parcelas") or data.get("entrada_qtd_parcelas")) and (flat.get("entrada_valor_parcela") or data.get("entrada_valor_parcela")):
        n_e = int(data.get("entrada_qtd_parcelas") or flat.get("entrada_qtd_parcelas") or 1)
        v_parc = _parse_currency_value(flat.get("entrada_valor_parcela") or data.get("entrada_valor_parcela"))
        if v_parc is not None and n_e > 0:
            entrada_total = n_e * v_parc
    if entrada_total is not None and entrada_total > 0:
        flat["valor_total_entrada"] = _format_currency_br(entrada_total)
    # 7b) Se não há entrada (desativada ou zero), remover TODOS os campos de entrada + valor_total_entrada
    entrada_enabled = data.get("entradaEnabled")
    entrada_val = _parse_currency_value(data.get("entradaValue"))
    entrada_val_parcela = _parse_currency_value(flat.get("entrada_valor_parcela") or data.get("entrada_valor_parcela"))
    if entrada_enabled is False or (entrada_val is not None and entrada_val == 0) or (entrada_val_parcela is not None and entrada_val_parcela == 0):
        for key in list(flat.keys()):
            if key.startswith("entrada_") or key == "valor_total_entrada":
                del flat[key]
    else:
        # Tipo de parcela da entrada: deixar em branco (não exibir "À VISTA"); a seção já tem "FIXA" quando aplicável
        flat["entrada_tipo_parcela"] = ""
    # 9) Valor sinal (comissão) – usar parse para não estourar valor
    valor_sinal = _parse_currency_value(data.get("valor_sinal") or data.get("downPaymentTotal") or data.get("sinalOriginalTotal"))
    if valor_sinal is not None:
        flat["valor_sinal"] = _format_currency_br(valor_sinal)
    # 10) Sexo: form pode enviar "sexo" (M/F) -> PDF espera sexo_masc_proponente / sexo_fem_proponente (bool)
    sx = flat.get("sexo") or data.get("sexo")
    if sx is not None and sx != "":
        s = str(sx).upper()[:1]
        flat["sexo_masc_proponente"] = s == "M"
        flat["sexo_fem_proponente"] = s == "F"
    sx2 = flat.get("sexo_seg") or data.get("sexo_seg")
    if sx2 is not None and sx2 != "":
        s2 = str(sx2).upper()[:1]
        flat["sexo_masc_segundo"] = s2 == "M"
        flat["sexo_fem_segundo"] = s2 == "F"
    # 11) Se não há segundo proponente/cônjuge/procurador, limpar todos os campos *_segundo para não sair "BRASILEIRO" etc. na seção em branco
    has_segundo = data.get("has_segundo")
    nome_segundo = (flat.get("nome_segundo") or data.get("nome_segundo") or "").strip()
    if not has_segundo and not nome_segundo:
        for key in list(flat.keys()):
            if key.endswith("_segundo"):
                del flat[key]
    return flat


def _api_asset_path(*parts):
    """Retorna caminho para arquivo em api/; tenta BASE_DIR e depois cwd/api (Render)."""
    path = os.path.join(BASE_DIR, *parts)
    if os.path.exists(path):
        return path
    cwd_api = os.path.join(os.getcwd(), 'api', *parts)
    if os.path.exists(cwd_api):
        return cwd_api
    return path


@app.route('/api/generate_proposal', methods=['POST'])
def generate_proposal():
    try:
        if not generate_pdf_reportlab:
            err_msg = 'Gerador de PDF nao disponivel'
            if _pdf_import_error:
                err_msg += f': {_pdf_import_error}'
            return jsonify({'success': False, 'error': err_msg}), 500

        data = request.get_json(silent=True) or {}
        if not data:
            return jsonify({'success': False, 'error': 'Dados vazios para gerar proposta'}), 400

        positions_path = _api_asset_path('posicoes_campos.json')
        if not os.path.exists(positions_path):
            return jsonify({
                'success': False,
                'error': 'Arquivo posicoes_campos.json nao encontrado',
                'tried': [os.path.join(BASE_DIR, 'posicoes_campos.json'), os.path.join(os.getcwd(), 'api', 'posicoes_campos.json')]
            }), 500

        # Normalize payload so PDF gets all expected keys (empreendimento, lote, quadra, valor_inicial, saldo_*, etc.)
        try:
            pdf_data = _normalize_proposal_data(data)
        except Exception as norm_err:
            print(f"[ERROR] _normalize_proposal_data: {norm_err}")
            traceback.print_exc()
            return jsonify({'success': False, 'error': f'Dados invalidos: {str(norm_err)}'}), 400

        # Try known background names (usar _api_asset_path para achar em cwd/api no Render)
        possible_names = ['PROPOSTA LIMPA.jpg', 'PROPOSTA_LIMPA.jpg', 'proposta_limpa.jpg', 'proposta-limpa.jpg']
        background_image_path = next((_api_asset_path(name) for name in possible_names if os.path.exists(_api_asset_path(name))), None)
        if not background_image_path:
            print("[WARN] Background image not found. Generating PDF without template.")

        tmp_dir = '/tmp' if os.environ.get('VERCEL') == '1' or os.path.exists('/tmp') else None
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf', dir=tmp_dir) as tmp:
            output_pdf = tmp.name

        generate_pdf_reportlab(pdf_data, background_image_path, positions_path, output_filename=output_pdf)

        # Ler PDF para memória e enviar (evita problema de arquivo removido no Render)
        try:
            with open(output_pdf, 'rb') as f:
                pdf_bytes = f.read()
        finally:
            try:
                os.remove(output_pdf)
            except Exception:
                pass

        return send_file(BytesIO(pdf_bytes), mimetype='application/pdf', as_attachment=False, download_name='proposta.pdf')
    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"[ERROR] generate_proposal: {str(e)}")
        print(f"[ERROR] Traceback: {error_trace}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/clients/check-duplicate', methods=['GET'])
@app.route('/api/manage-clients/check-duplicate', methods=['GET'])
@token_required
def check_duplicate_client():
    """Check if CPF/CNPJ already exists"""
    try:
        cpf_cnpj = request.args.get('cpf_cnpj', '').strip()
        tipo_pessoa = request.args.get('tipo_pessoa', 'PF').upper()
        client_id_raw = request.args.get('client_id')
        
        if not cpf_cnpj:
            return jsonify({'exists': False})

        cpf_cnpj_clean = ''.join(c for c in cpf_cnpj if c.isdigit())
        
        # Extract numeric ID from client_id (may be in format "PF:123" or just "123")
        client_id = None
        if client_id_raw:
            # Try to extract numeric part
            import re
            match = re.search(r'\d+', str(client_id_raw))
            if match:
                client_id = int(match.group())
        
        if SUPABASE_URL and SUPABASE_KEY:
            params = [
                "select=id,nome",
                f"cpf_cnpj=eq.{cpf_cnpj_clean}",
                f"tipo_pessoa=eq.{tipo_pessoa}"
            ]
            if client_id:
                params.append(f"id=neq.{client_id}")
            params.append("limit=1")

            existing = query_supabase_rest("clients", "GET", params="&".join(params), return_error=True)
            if isinstance(existing, dict) and existing.get("error"):
                err_text = str(existing.get("error", ""))
                if "tipo_pessoa" in err_text:
                    # Retry without tipo_pessoa filter if column does not exist
                    params = [
                        "select=id,nome",
                        f"cpf_cnpj=eq.{cpf_cnpj_clean}"
                    ]
                    if client_id:
                        params.append(f"id=neq.{client_id}")
                    params.append("limit=1")
                    existing = query_supabase_rest("clients", "GET", params="&".join(params), return_error=True)
            else:
                    return jsonify({'exists': False, 'error': existing.get("error")})
            if existing and isinstance(existing, list):
                item = existing[0] if existing else None
                if item:
                    return jsonify({'exists': True, 'client_name': item.get('nome'), 'client_id': item.get('id')})
            return jsonify({'exists': False})

        # SQLite fallback
        if client_id:
            # Editing existing client - exclude self from check
            existing = query_db(
                "SELECT id, nome FROM clients WHERE cpf_cnpj = ? AND tipo_pessoa = ? AND id != ?",
                (cpf_cnpj_clean, tipo_pessoa, client_id),
                one=True
            )
        else:
            # New client
            existing = query_db(
                "SELECT id, nome FROM clients WHERE cpf_cnpj = ? AND tipo_pessoa = ?",
                (cpf_cnpj_clean, tipo_pessoa),
                one=True
            )

        if existing:
            return jsonify({'exists': True, 'client_name': existing['nome'], 'client_id': existing['id']})
        
        return jsonify({'exists': False})
            
    except Exception as e:
        print(f"[ERROR] check_duplicate_client: {str(e)}")
        return jsonify({'exists': False, 'error': str(e)})



@app.route('/api/users', methods=['GET', 'POST'])
@token_required
def manage_users():
    if request.user_role != 'admin':
        return jsonify({'message': 'Forbidden'}), 403
    
    if request.method == 'GET':
        users = query_db("SELECT * FROM users ORDER BY id")
        for u in users:
             u['permissions'] = json.loads(u['permissions']) if u['permissions'] and isinstance(u['permissions'], str) else (u['permissions'] or {})
        return jsonify({'users': users})
    
    if request.method == 'POST':
        try:
            data = request.get_json()
            username = data.get('username', '').strip()
            password = data.get('password')
            nome = data.get('nome', '').strip()
            
            if not username or not password:
                return jsonify({'message': 'Usuário e senha são obrigatórios'}), 400
            
            # Verificar se já existe
            existing = query_db("SELECT id FROM users WHERE username = ?", (username,), one=True)
            if existing:
                return jsonify({'message': 'Este nome de usuário já está em uso'}), 400
                
            pw_hash = hash_password(password)
            # Default permissions structure
            default_perms = {
                "canViewAllClients": False,
                "obrasPermitidas": [],
                "statusPermitidos": []
            }
            perms = data.get('permissions') or default_perms
            
            query_db("INSERT INTO users (username, password_hash, nome, role, active, permissions) VALUES (?, ?, ?, ?, ?, ?)",
                    (username, pw_hash, nome, 'user', True, json.dumps(perms)), commit=True)
                    
            return jsonify({'success': True, 'message': 'Usuário criado com sucesso'})
        except Exception as e:
            print(f"[ERROR] manage_users POST: {e}")
            return jsonify({'success': False, 'message': f'Erro ao criar usuário: {str(e)}'}), 500

@app.route('/api/users/<int:user_id>', methods=['PUT', 'DELETE'])
@token_required
def user_ops(user_id):
    if request.user_role != 'admin':
        return jsonify({'message': 'Forbidden'}), 403
        
    if request.method == 'DELETE':
        query_db("DELETE FROM users WHERE id = ?", (user_id,), commit=True)
        return jsonify({'success': True})
    
    if request.method == 'PUT':
        data = request.get_json()
        # Simple update logic
        updates = []
        params = []
        if 'nome' in data:
            updates.append("nome = ?")
            params.append(data['nome'])
        if 'active' in data:
            updates.append("active = ?")
            params.append(bool(data['active']))
        if 'permissions' in data:
            updates.append("permissions = ?")
            params.append(json.dumps(data['permissions']))
            
        if not updates: return jsonify({'message': 'No data'}), 400
        
        params.append(user_id)
        query_db(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", tuple(params), commit=True)
        return jsonify({'success': True})

@app.route('/api/health')
def health_check():
    return jsonify({"status": "healthy", "python": sys.version})

# Auto-migrate database on startup
try:
    print("[STARTUP] Running database migration...")
    migrate_db_internal()
    print("[STARTUP] Database migration completed successfully")
except Exception as e:
    print(f"[STARTUP] Database migration failed: {e}")

if __name__ == '__main__':
    print("[LOCAL] Iniciando API em http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
