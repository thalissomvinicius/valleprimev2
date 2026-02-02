from flask import Flask, request, jsonify
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
if os.environ.get('VERCEL') == '1' or os.path.exists('/tmp'):
    DB_PATH = '/tmp/clients.db'
else:
    DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'clients.db')

def get_db_connection():
    db_url = os.environ.get('DATABASE_URL')
    if db_url:
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
            ssl_context=ssl_context
        )
        return conn, 'postgres'
    
    # Fallback to Local SQLite
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
        col_names = [desc[0] for desc in cur.description]
        return [dict(zip(col_names, row)) for row in rv]
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
    return jsonify({"status": "ok", "message": "Auth logic restored (partially)"})

@app.route('/api/auth/login', methods=['POST'])
def login():
    try:
        data = request.get_json(silent=True) or {}
        username = data.get('username', '').strip()
        password = data.get('password', '')
        if not username or not password:
            return jsonify({'message': 'Missing credentials'}), 400
        
        user = query_db("SELECT * FROM users WHERE username = ? AND active = 1", (username,), one=True)
        # Handle default admin if not exists (lazy init)
        if not user and username == 'admin' and password == 'admin123':
             # Try to count users
             res = query_db("SELECT count(*) as cnt FROM users", one=True)
             if res and res['cnt'] == 0:
                 pw_hash = hash_password('admin123')
                 query_db("INSERT INTO users (username, password_hash, nome, role, active, permissions) VALUES (?, ?, ?, ?, ?, ?)",
                          ('admin', pw_hash, 'Admin', 'admin', True, json.dumps({"canViewAllClients": True})), commit=True)
                 user = query_db("SELECT * FROM users WHERE username = 'admin'", one=True)

        if not user or not verify_password(user['password_hash'], password):
            return jsonify({'message': 'Invalid credentials'}), 401
        
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
        return jsonify({'message': 'Internal Error', 'error': str(e), 'trace': traceback.format_exc()}), 500

@app.route('/api/migrate-db')
def migrate_db():
    try:
        conn, db_type = get_db_connection()
        cur = conn.cursor()
        
        # Ensure 'users' table exists
        if db_type == 'postgres':
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
        else:
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
        return jsonify({"success": True, "message": "Database initialized/migrated"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
