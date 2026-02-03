from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
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

# Database path for SQLite
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if os.environ.get('VERCEL') == '1' or os.path.exists('/tmp'):
    DB_PATH = '/tmp/clients.db'
else:
    DB_PATH = os.path.join(BASE_DIR, 'clients.db')

# Supabase REST Config
SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_ANON_KEY')

# PDF Engine placeholder
generate_pdf_reportlab = None

def get_db_connection():
    # Only SQLite fallback now
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn, 'sqlite'

def query_supabase_rest(table, method='GET', data=None, params=None):
    """Fallback driver using Supabase REST API (HTTP) to bypass TCP blocks"""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
    
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    try:
        if method == 'GET':
            resp = requests.get(url, headers=headers, params=params, timeout=10)
        elif method == 'POST':
            resp = requests.post(url, headers=headers, json=data, timeout=10)
        
        if resp.status_code in [200, 201]:
            return resp.json()
        print(f"[Supabase API] Error {resp.status_code}: {resp.text}")
        return None
    except Exception as e:
        print(f"[Supabase API] Exception: {e}")
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
                            "active": params[4]
                        }
                    res = query_supabase_rest(table, 'POST', data=payload)
                    return True if res else False
                
                # Handle SELECT COUNT(*)
                if "SELECT COUNT(*)" in sql or "count(*)" in sql.lower():
                    # PostgREST count is usually done via HEAD request or 'select' parameter
                    res = query_supabase_rest(table, 'GET', params={"select": "id"})
                    total = len(res) if res else 0
                    if one: return {"count": total}
                    return [{"count": total}]

                # Handle SELECT ALL
                if "SELECT * FROM" in sql and "WHERE" not in sql:
                    res = query_supabase_rest(table, 'GET', params={"select": "*", "order": "created_at.desc" if table == "clients" else "id.asc"})
                    if one: return res[0] if res else None
                    return res or []
                
                # Handle SELECT WHERE (Simple cases like login or duplicate check)
                if "WHERE" in sql:
                    # Simple mapping for login: WHERE username = ? AND active = ?
                    # Or duplicate check: WHERE cpf_cnpj = ?
                    filters = {}
                    if "username =" in sql: filters["username"] = f"eq.{params[0]}"
                    if "cpf_cnpj =" in sql: filters["cpf_cnpj"] = f"eq.{params[0]}"
                    if "active =" in sql: filters["active"] = f"eq.{params[1]}"
                    if "created_by =" in sql: filters["created_by"] = f"eq.{params[0]}"
                    if "id =" in sql: filters["id"] = f"eq.{params[0]}"
                    
                    if filters:
                        filters["select"] = "*"
                        res = query_supabase_rest(table, 'GET', params=filters)
                        if one: return res[0] if res else None
                        return res or []

            except Exception as api_err:
                print(f"[Supabase API Fallback Error] {api_err}. Trying direct connection...")

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
    return jsonify({"status": "ok", "message": "Full system restored (v8.1-rest-fix)", "time": datetime.datetime.now().isoformat()})

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
        
        # Para admin hardcoded, retorna dados diretamente
        if payload.get('user_id') == 1 and payload.get('role') == 'admin':
            return jsonify({
                'user': {
                    'id': 1,
                    'username': 'admin',
                    'role': 'admin',
                    'permissions': {"canViewAllClients": True}
                }
            })
        
        # Para outros usuários, buscar no banco (se necessário)
        return jsonify({
            'user': {
                'id': payload.get('user_id'),
                'username': 'user',
                'role': payload.get('role', 'user'),
                'permissions': {}
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
    
    # TEMPORARY HARDCODED BYPASS
    if username == 'admin' and password == 'admin123':
        token = jwt.encode({
            'user_id': 1,
            'role': 'admin',
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=12)
        }, SECRET_KEY, algorithm="HS256")
        if isinstance(token, bytes): token = token.decode('utf-8')
        
        return jsonify({
            'token': token,
            'user': {
                'id': 1,
                'username': 'admin',
                'role': 'admin',
                'permissions': {"canViewAllClients": True}
            }
        })
    
    return jsonify({'message': 'Invalid credentials'}), 401

# ROTA ALTERNATIVA - para contornar problema de roteamento
@app.route('/api/login', methods=['POST'])
def login_alt():
    return login()

@app.route('/api/auth/login', methods=['POST'])
def login():
    try:
        data = request.get_json(silent=True) or {}
        username = data.get('username', '').strip()
        password = data.get('password', '')
        
        if not username or not password:
            return jsonify({'message': 'Credentials required'}), 400
        
        # TEMPORARY HARDCODED BYPASS - allows admin login while DB issue is investigated
        if username == 'admin' and password == 'admin123':
            token = jwt.encode({
                'user_id': 1,
                'role': 'admin',
                'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=12)
            }, SECRET_KEY, algorithm="HS256")
            if isinstance(token, bytes): token = token.decode('utf-8')
            
            return jsonify({
                'token': token,
                'user': {
                    'id': 1,
                    'username': 'admin',
                    'role': 'admin',
                    'permissions': {"canViewAllClients": True}
                }
            })
        
        # For any other user, try database
        conn = None
        conn, db_type = get_db_connection()
        
        cur = conn.cursor()
        # Use simple string interpolation for pg8000 safely
        sql = "SELECT * FROM users WHERE username = %s AND active = %s" if db_type == 'postgres' else "SELECT * FROM users WHERE username = ? AND active = ?"
        cur.execute(sql, (username, True))
        rv = cur.fetchone()
        
        user = None
        if rv:
            col_names = [desc[0] for desc in cur.description]
            user = dict(zip(col_names, rv))
        
        # If user not found and table might be empty, try to create admin once
        if not user and username == 'admin' and password == 'admin123':
             # We need to re-query count using the same cursor
             cnt_sql = "SELECT count(*) as cnt FROM users"
             cur.execute(cnt_sql)
             res = cur.fetchone()
             # handle result mapping manually since we are raw
             cnt = res[0] if res else 0
             
             if cnt == 0:
                 pw_hash = hash_password('admin123')
                 # Insert
                 ins_sql = "INSERT INTO users (username, password_hash, nome, role, active, permissions) VALUES (%s, %s, %s, %s, %s, %s)" if db_type == 'postgres' else "INSERT INTO users (username, password_hash, nome, role, active, permissions) VALUES (?, ?, ?, ?, ?, ?)"
                 cur.execute(ins_sql, ('admin', pw_hash, 'Admin', 'admin', True, json.dumps({"canViewAllClients": True})))
                 conn.commit()
                 
                 # Re-fetch
                 cur.execute(sql, ('admin', True))
                 rv = cur.fetchone()
                 if rv:
                    col_names = [desc[0] for desc in cur.description]
                    user = dict(zip(col_names, rv))

        if not user:
            conn.close()
            return jsonify({'message': 'Invalid credentials (User not found)'}), 401
            
        if not verify_password(user['password_hash'], password):
            conn.close()
            return jsonify({'message': 'Invalid credentials (Password mismatch)'}), 401
        
        conn.close()
        
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
        if user['permissions']:
            try: perms = json.loads(user['permissions'])
            except: pass
        
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
        if conn: conn.close()
        return jsonify({'message': 'Internal Login Error', 'error': str(e)}), 500

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
    """Busca dados de lotes do servidor externo ou fallback local"""
    # Try fetching from external API with timeout
    try:
        resp = requests.get(f"http://177.221.240.85:8000/api/consulta/{numprod_psc}/", timeout=8)
        if resp.status_code == 200:
            return jsonify(resp.json())
    except:
        pass
    
    # Fallback to local files
    filename = f"fallback_{numprod_psc}.json"
    filepath = os.path.join(BASE_DIR, filename)
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            return jsonify(json.load(f))
            
    return jsonify({"data": []})

@app.route('/api/clients', methods=['GET', 'POST'])
@app.route('/api/manage-clients', methods=['GET', 'POST'])
@token_required
def manage_clients():
    if request.method == 'GET':
        print(f"[DEBUG] GET Clients for user_id: {request.user_id}, role: {request.user_role}")
        can_see_all = request.user_role == 'admin'
        if not can_see_all:
             # Check specific permissions
             user = query_db("SELECT permissions FROM users WHERE id = ?", (request.user_id,), one=True)
             perms = json.loads(user['permissions']) if user and user['permissions'] else {}
             can_see_all = perms.get('canViewAllClients', False)
             
        if can_see_all:
            clients = query_db("SELECT * FROM clients ORDER BY created_at DESC")
        else:
            clients = query_db("SELECT * FROM clients WHERE created_by = ? ORDER BY created_at DESC", (str(request.user_id),))
        
        print(f"[DEBUG] Found {len(clients) if clients else 0} clients")
        return jsonify(clients or [])

    if request.method == 'POST':
        try:
            data = request.get_json()
            print(f"[DEBUG] Received data: {data}")  # Log received data
            
            if not data:
                return jsonify({'success': False, 'error': 'No data provided'}), 400
            
            # Accept both direct fields and form fields
            nome = data.get('nome') or data.get('nome_proponente')
            cpf_cnpj = data.get('cpf_cnpj') or data.get('cpf_cnpj_proponente')
            tipo_pessoa = data.get('tipo_pessoa', 'PF')
            
            print(f"[DEBUG] Extracted - nome: {nome}, cpf_cnpj: {cpf_cnpj}, tipo_pessoa: {tipo_pessoa}")
            
            if not nome or not cpf_cnpj:
                return jsonify({
                    'success': False, 
                    'error': 'Campos obrigatórios faltando',
                    'message': 'Nome e CPF/CNPJ são obrigatórios',
                    'required': ['nome or nome_proponente', 'cpf_cnpj or cpf_cnpj_proponente']
                }), 400
            
            # Insert into database
            print(f"[DEBUG] Attempting to insert client: {nome} - {cpf_cnpj}")
            success = query_db(
                "INSERT INTO clients (nome, cpf_cnpj, tipo_pessoa, created_by, data) VALUES (?, ?, ?, ?, ?)",
                (nome, cpf_cnpj, tipo_pessoa, str(request.user_id), json.dumps(data)), 
                commit=True
            )
            print(f"[DEBUG] Insert result: {success}")
            
            if success:
                return jsonify({'success': True, 'message': 'Cliente salvo com sucesso'})
            else:
                return jsonify({'success': False, 'error': 'Falha ao inserir no banco de dados'}), 500
                
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            print(f"[ERROR] Exception saving client: {str(e)}")
            print(f"[ERROR] Traceback: {error_trace}")
            return jsonify({
                'success': False, 
                'error': f'Erro ao salvar cliente: {str(e)}',
                'message': str(e),
                'trace': error_trace if os.getenv('VERCEL') else None  # Only show trace in production for debugging
            }), 500


@app.route('/api/clients/check-duplicate', methods=['GET'])
@app.route('/api/manage-clients/check-duplicate', methods=['GET'])
@token_required
def check_duplicate_client():
    """Check if CPF/CNPJ already exists"""
    try:
        cpf_cnpj = request.args.get('cpf_cnpj', '').strip()
        tipo_pessoa = request.args.get('tipo_pessoa', 'PF')
        client_id_raw = request.args.get('client_id')
        
        if not cpf_cnpj:
            return jsonify({'exists': False})
        
        # Extract numeric ID from client_id (may be in format "PF:123" or just "123")
        client_id = None
        if client_id_raw:
            # Try to extract numeric part
            import re
            match = re.search(r'\d+', str(client_id_raw))
            if match:
                client_id = int(match.group())
        
        # Check if exists
        if client_id:
            # Editing existing client - exclude self from check
            existing = query_db("SELECT id, nome FROM clients WHERE cpf_cnpj = ? AND id != ?", 
                               (cpf_cnpj, client_id), one=True)
        else:
            # New client
            existing = query_db("SELECT id, nome FROM clients WHERE cpf_cnpj = ?", 
                               (cpf_cnpj,), one=True)
        
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
        users = query_db("SELECT id, username, nome, role, permissions, active FROM users ORDER BY id")
        for u in users:
             u['permissions'] = json.loads(u['permissions']) if u['permissions'] else {}
        return jsonify({'users': users})
    
    if request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        if not username or not password:
            return jsonify({'message': 'Missing fields'}), 400
        
        pw_hash = hash_password(password)
        query_db("INSERT INTO users (username, password_hash, nome, role, active, permissions) VALUES (?, ?, ?, ?, ?, ?)",
                (username, pw_hash, data.get('nome'), 'user', True, json.dumps(data.get('permissions', {}))), commit=True)
        return jsonify({'success': True})

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
