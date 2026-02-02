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

# PDF Engine placeholder
generate_pdf_reportlab = None

def get_db_connection():
    db_url = os.environ.get('DATABASE_URL')
    if db_url:
        try:
            import psycopg2
            conn = psycopg2.connect(db_url, sslmode='require', connect_timeout=5)
            return conn, 'postgres'
        except Exception as e:
            print(f"DB WARNING: psycopg2 failed ({str(e)}). Falling back to pg8000.")
            
        import pg8000.dbapi
        import urllib.parse
        import ssl
        u = urllib.parse.urlparse(db_url)
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        
        conn = pg8000.dbapi.connect(
            user=u.username,
            password=u.password,
            host=u.hostname,
            port=u.port,
            database=u.path[1:],
            ssl_context=ssl_context,
            timeout=10
        )
        return conn, 'postgres'
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn, 'sqlite'

def query_db(sql, params=(), one=False, commit=False):
    conn, db_type = None, None
    try:
        conn, db_type = get_db_connection()
        cur = conn.cursor()
        if db_type == 'postgres':
            sql = sql.replace('?', '%s')
        cur.execute(sql, params)
        if commit:
            conn.commit()
            return True
        if one:
            rv = cur.fetchone()
            if rv:
                col_names = [desc[0] for desc in cur.description]
                return dict(zip(col_names, rv))
            return None
        rv = cur.fetchall()
        if cur.description:
            col_names = [desc[0] for desc in cur.description]
            return [dict(zip(col_names, row)) for row in rv]
        return []
    except Exception as e:
        print(f"QUERY ERROR: {e}")
        return None
    finally:
        if conn: conn.close()

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
    return jsonify({"status": "ok", "message": "Full system restored (v3.1)", "time": datetime.datetime.now().isoformat()})

@app.route('/api/db-diag')
def db_diag():
    try:
        conn, db_type = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        res = cur.fetchone()
        
        # Check users count
        user_count = -1
        try:
            cur.execute("SELECT count(*) FROM users")
            user_count = cur.fetchone()[0]
        except:
            pass
            
        conn.close()
        return jsonify({
            "status": "ok", 
            "db_type": db_type, 
            "result": res[0],
            "user_count": user_count,
            "table_users_exists": user_count >= 0
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e), "trace": traceback.format_exc()}), 500

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
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"MIGRATION ERROR: {e}")
        return False

@app.route('/api/migrate-db')
def migrate_db():
    if migrate_db_internal():
        return jsonify({"success": True, "message": "Database initialized/migrated"})
    else:
        return jsonify({"success": False, "message": "Migration failed (check logs)"}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    try:
        data = request.get_json(silent=True) or {}
        username = data.get('username', '').strip()
        password = data.get('password', '')
        if not username or not password:
            return jsonify({'message': 'Credentials required'}), 400
        
        # Try to find user
        user = query_db("SELECT * FROM users WHERE username = ? AND active = 1", (username,), one=True)
        
        # If user not found and table might be missing or empty, handle admin logic
        if not user and username == 'admin' and password == 'admin123':
             # Check if table exists/has users by attempting a count
             res = query_db("SELECT count(*) as cnt FROM users", one=True)
             
             if res is None:
                 # Table likely doesn't exist, run migration for users table at least
                 migrate_db_internal() # Helper for code reuse
                 res = query_db("SELECT count(*) as cnt FROM users", one=True)
             
             if res and res['cnt'] == 0:
                 pw_hash = hash_password('admin123')
                 query_db("INSERT INTO users (username, password_hash, nome, role, active, permissions) VALUES (?, ?, ?, ?, ?, ?)",
                          ('admin', pw_hash, 'Admin', 'admin', True, json.dumps({"canViewAllClients": True})), commit=True)
                 user = query_db("SELECT * FROM users WHERE username = 'admin'", one=True)

        if not user:
            return jsonify({'message': 'Invalid credentials (User not found)'}), 401
            
        if not verify_password(user['password_hash'], password):
            return jsonify({'message': 'Invalid credentials (Password mismatch)'}), 401
        
        token = jwt.encode({
            'user_id': user['id'],
            'role': user['role'],
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=12)
        }, SECRET_KEY, algorithm="HS256")
        
        return jsonify({
            'token': token,
            'user': {
                'id': user['id'],
                'username': user['username'],
                'role': user['role'],
                'permissions': json.loads(user['permissions']) if user['permissions'] else {}
            }
        })
    except Exception as e:
        return jsonify({'message': 'Internal Login Error', 'error': str(e)}), 500

@app.route('/api/availability')
def get_availability():
    numprod_psc = request.args.get('numprod_psc', '624')
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
@token_required
def manage_clients():
    if request.method == 'GET':
        can_see_all = request.user_role == 'admin'
        if not can_see_all:
             # Check specific permissions
             user = query_db("SELECT permissions FROM users WHERE id = ?", (request.user_id,), one=True)
             perms = json.loads(user['permissions']) if user['permissions'] else {}
             can_see_all = perms.get('canViewAllClients', False)
             
        if can_see_all:
            clients = query_db("SELECT * FROM clients ORDER BY created_at DESC")
        else:
            clients = query_db("SELECT * FROM clients WHERE created_by = ? ORDER BY created_at DESC", (str(request.user_id),))
        return jsonify(clients or [])

    if request.method == 'POST':
        data = request.get_json()
        nome = data.get('nome')
        cpf_cnpj = data.get('cpf_cnpj')
        tipo_pessoa = data.get('tipo_pessoa', 'PF')
        
        if not nome or not cpf_cnpj:
            return jsonify({'message': 'Missing fields'}), 400
            
        success = query_db("INSERT INTO clients (nome, cpf_cnpj, tipo_pessoa, created_by, data) VALUES (?, ?, ?, ?, ?)",
                         (nome, cpf_cnpj, tipo_pessoa, str(request.user_id), json.dumps(data)), commit=True)
        return jsonify({'success': bool(success)})

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
