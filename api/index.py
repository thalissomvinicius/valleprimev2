from flask import Flask, request, send_file
from flask_cors import CORS
import os
import datetime
import traceback
import sqlite3
import json
import sys
import requests
import secrets
import hashlib
import jwt
from functools import wraps

# JWT Configuration
SECRET_KEY = os.environ.get('SECRET_KEY', 'dev_secret_key_valle_prime_v2')

# 1. Setup paths to find local modules
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# 2. Database path configuration
if os.environ.get('VERCEL') == '1' or os.path.exists('/tmp'):
    DB_PATH = '/tmp/clients.db'
else:
    DB_PATH = os.path.join(BASE_DIR, 'clients.db')

# 3. Import helper (safe import)
try:
    from generate_proposal_reportlab import generate_pdf_reportlab
except Exception as e:
    print(f"IMPORT ERROR: {e}")
    generate_pdf_reportlab = None

# Initialize Flask
app = Flask(__name__)
# More permissive CORS for debugging
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Helper to get connection
def get_db_connection():
    """Get database connection (Postgres or SQLite)"""
    db_url = os.environ.get('DATABASE_URL')
    if db_url:
        # PRIMARY DRIVER: PSYCOPG2 (Standard for AWS/Vercel)
        # We try this first because it's compiled C and handles SSL correctly by default.
        try:
            import psycopg2
            # sslmode='require' is standard for cloud DBs
            conn = psycopg2.connect(db_url, sslmode='require')
            return conn, 'postgres'
        except ImportError:
            print("DB INFO: Psycopg2 not installed, checking for pg8000...")
        except Exception as e:
            print(f"DB WARNING: Psycopg2 failed ({str(e)}). Falling back to pg8000.")

        # FALLBACK DRIVER: PG8000 (Pure Python)
        # Use this if psycopg2 crashes (e.g. ABI mismatch on Lambda)
        try:
            import pg8000.dbapi
            import urllib.parse
            import ssl
            u = urllib.parse.urlparse(db_url)
            
            # Create permissive SSL context to prevent hangs on some platforms
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
        except Exception as e:
            print(f"DB CRITICAL: All drivers failed. Last error: {e}")
            # DO NOT FALLBACK TO SQLITE IF DATABASE_URL IS PRESENT
            # This causes data loss on Vercel (ephemeral filesystem).
            raise e
            
    # Local Dev (No DATABASE_URL) -> Use SQLite
    print("DB INFO: No DATABASE_URL found, using local SQLite.")
    db_dir = os.path.dirname(DB_PATH)
    if not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)
            
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn, 'sqlite'

def init_db():
    """Initialize database tables if they don't exist"""
    conn, db_type = get_db_connection()
    try:
        # Client table schema
        create_table_sql = """
        CREATE TABLE IF NOT EXISTS clients (
            id SERIAL PRIMARY KEY,
            nome TEXT NOT NULL,
            cpf_cnpj TEXT NOT NULL,
            tipo_pessoa TEXT NOT NULL DEFAULT 'PF',
            data TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
        if db_type == 'sqlite':
            create_table_sql = """
            CREATE TABLE IF NOT EXISTS clients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                cpf_cnpj TEXT NOT NULL,
                tipo_pessoa TEXT NOT NULL DEFAULT 'PF',
                created_by TEXT,
                data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                nome TEXT,
                role TEXT DEFAULT 'user',
                permissions TEXT,
                active BOOLEAN DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """
        else:
             create_table_sql = """
            CREATE TABLE IF NOT EXISTS clients (
                id SERIAL PRIMARY KEY,
                nome TEXT NOT NULL,
                cpf_cnpj TEXT NOT NULL,
                tipo_pessoa TEXT NOT NULL DEFAULT 'PF',
                created_by TEXT,
                data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                nome TEXT,
                role TEXT DEFAULT 'user',
                permissions TEXT,
                active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """
        
        with conn:
            with conn.cursor() as cur:
                # Split commands for sqlite which might not support multiple statements in execute
                if db_type == 'sqlite':
                    statements = create_table_sql.split(';')
                    for stmt in statements:
                        if stmt.strip():
                            cur.execute(stmt)
                    conn.commit()
                else:
                    cur.execute(create_table_sql)
                    conn.commit()
    except Exception as e:
        print(f"DB INIT ERROR: {e}")
    finally:
        try: conn.close()
        except: pass

# Helper to execute queries compatible with both
def query_db(sql, params=(), one=False, commit=False):
    conn, db_type = None, None
    try:
        conn, db_type = get_db_connection()
        cur = conn.cursor()
        
        # Adapt placeholders: SQLite uses ?, Postgres uses %s
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
        else:
            rv = cur.fetchall()
            col_names = [desc[0] for desc in cur.description]
            return [dict(zip(col_names, row)) for row in rv]
            
    except Exception as e:
        print(f"QUERY ERROR: {e}")
        return None
    finally:
        try:
            if conn: conn.close()
        except: pass

# Initialize DB on start (safe wrapper)
try:
    init_db()
except Exception as e:
    print(f"CRITICAL INIT FAILURE: {e}")

def format_currency(val):
    """Format value as Brazilian currency (R$ format)"""
    if not val: return "0,00"
    try:
        if isinstance(val, str):
             clean = val.replace("R$", "").strip().replace(".", "").replace(",", ".")
             val = float(clean)
        return f"{float(val):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception as e:
        return str(val)

# Routes

@app.route('/api/db-test')
def db_test():
    """Diagnostic route for DB"""
    start = datetime.datetime.now()
    log = []
    try:
        conn, db_type = get_db_connection()
        log.append(f"Connection established: {db_type}")
        
        cur = conn.cursor()
        cur.execute("SELECT 1")
        log.append("SELECT 1 successful")
        
        try:
            cur.execute("SELECT count(*) FROM clients")
            count = cur.fetchone()[0]
            log.append(f"Client count: {count}")
        except Exception as e:
            log.append(f"Count failed: {e}")
            
        conn.close()
        duration = (datetime.datetime.now() - start).total_seconds()
        return {
            "status": "ok",
            "duration": duration,
            "log": log
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "log": log
        }, 500

@app.route('/api/migrate-db')
def migrate_db():
    """General migration route to update DB schema"""
    result = {"success": True, "steps": []}
    
    try:
        conn, db_type = get_db_connection()
        cur = conn.cursor()
        
        # --- MIGRATION 1: tipo_pessoa ---
        # (Mantendo a lógica existente mas encapsulada)
        if db_type == 'postgres':
            cur.execute("""
                SELECT column_name FROM information_schema.columns 
                WHERE table_name = 'clients' AND column_name = 'tipo_pessoa'
            """)
            has_tipo = cur.fetchone() is not None
        else:
            cur.execute("PRAGMA table_info(clients)")
            columns = [row[1] for row in cur.fetchall()]
            has_tipo = 'tipo_pessoa' in columns
            
        if not has_tipo:
            cur.execute("ALTER TABLE clients ADD COLUMN tipo_pessoa TEXT DEFAULT 'PF'")
            result["steps"].append("Added tipo_pessoa column")
            # Update data logic skipped for brevity on re-run, but could include if needed
        
        # --- MIGRATION 2: created_by ---
        if db_type == 'postgres':
            cur.execute("""
                SELECT column_name FROM information_schema.columns 
                WHERE table_name = 'clients' AND column_name = 'created_by'
            """)
            has_created_by = cur.fetchone() is not None
        else:
            cur.execute("PRAGMA table_info(clients)")
            # Need to re-fetch columns for sqlite
            cur.execute("PRAGMA table_info(clients)")
            columns = [row[1] for row in cur.fetchall()]
            has_created_by = 'created_by' in columns
            
        if not has_created_by:
            cur.execute("ALTER TABLE clients ADD COLUMN created_by TEXT")
            conn.commit()
            result["steps"].append("Added created_by column")
        else:
            result["steps"].append("Column created_by already exists")
            
        conn.commit()
        conn.close()
        
        result["message"] = "Migrations completed successfully"
        
        return result
        
    except Exception as e:
        result["success"] = False
        result["error"] = str(e)
        return result, 500

@app.route('/api/debug-clients')
def debug_clients():
    """Debug route to see all client data and test schema"""
    result = {"success": True, "tests": {}}
    
    try:
        # Test 1: Simple count without tipo_pessoa
        simple_count = query_db("SELECT COUNT(*) as c FROM clients", one=True)
        result["tests"]["simple_count"] = simple_count.get('c') if simple_count else "error"
    except Exception as e:
        result["tests"]["simple_count_error"] = str(e)
    
    try:
        # Test 2: Select without tipo_pessoa column
        clients_basic = query_db("SELECT id, nome, cpf_cnpj FROM clients ORDER BY id")
        result["tests"]["basic_select_count"] = len(clients_basic) if clients_basic else 0
        result["clients_basic"] = clients_basic[:5] if clients_basic else []
    except Exception as e:
        result["tests"]["basic_select_error"] = str(e)
    
    try:
        # Test 3: Select with tipo_pessoa column
        clients_full = query_db("SELECT id, nome, cpf_cnpj, tipo_pessoa FROM clients ORDER BY id")
        result["tests"]["full_select_count"] = len(clients_full) if clients_full else 0
        result["clients_full"] = clients_full[:5] if clients_full else []
    except Exception as e:
        result["tests"]["full_select_error"] = str(e)
    
    try:
        # Test 4: Check if tipo_pessoa column exists
        # This works differently in SQLite vs PostgreSQL
        schema_check = query_db("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'clients'
        """)
        result["schema"] = schema_check if schema_check else []
    except Exception as e:
        result["tests"]["schema_error"] = str(e)
    
    return result

@app.route('/api/health')
def health():
    """Diagnostic route"""
    try:
        import reportlab
        rl_info = f"ReportLab {reportlab.Version} OK"
    except Exception as e:
        rl_info = f"ReportLab ERROR: {str(e)}"
        
    # External API check
    ext_api_check = "Not tested"
    try:
        test_resp = requests.get("http://177.221.240.85:8000/api/consulta/624/", timeout=10)
        ext_api_check = f"Status {test_resp.status_code}, Data length: {len(test_resp.json().get('data', []))}"
    except Exception as e:
        ext_api_check = f"Error: {str(e)}"
    
    fallback_exists = os.path.exists(os.path.join(BASE_DIR, "fallback_availability.json"))
        
    return {
        "status": "ok",
        "vercel": os.environ.get('VERCEL') == '1',
        "python": sys.version,
        "base_dir": BASE_DIR,
        "db_path": DB_PATH,
        "files_in_api": os.listdir(BASE_DIR) if os.path.exists(BASE_DIR) else [],
        "reportlab": rl_info,
        "external_api_624": ext_api_check,
        "fallback_file_present": os.path.exists(os.path.join(BASE_DIR, "fallback_624.json")),
        "fallback_path_debug": os.path.join(BASE_DIR, f"fallback_624.json"),
        "cwd": os.getcwd(),
        "timestamp": datetime.datetime.now().isoformat()
    }, 200

@app.route('/api/debug_fallback/<int:numprod_psc>')
def debug_fallback(numprod_psc):
    """Deep dive debugging for fallback file loading"""
    import json
    
    filename = f"fallback_{numprod_psc}.json"
    filepath = os.path.join(BASE_DIR, filename)
    
    result = {
        "requested_id": numprod_psc,
        "filename": filename,
        "filepath": filepath,
        "exists": os.path.exists(filepath),
        "cwd": os.getcwd(),
        "base_dir": BASE_DIR,
    }
    
    if result["exists"]:
        try:
            result["size"] = os.path.getsize(filepath)
            with open(filepath, 'r', encoding='utf-8-sig') as f:
                content = f.read(200) # Read first 200 chars
                result["preview"] = content
                f.seek(0) # Reset
                try:
                    data = json.load(f)
                    result["json_valid"] = True
                    result["is_dict"] = isinstance(data, dict)
                    if isinstance(data, dict):
                        result["has_data_key"] = 'data' in data
                        if 'data' in data:
                            result["data_len"] = len(data['data'])
                            result["data_type"] = str(type(data['data']))
                except Exception as json_err:
                     result["json_valid"] = False
                     result["json_error"] = str(json_err)
        except Exception as e:
            result["read_error"] = str(e)
            
    return result

@app.route('/api/ping')
def ping():
    return "pong", 200

@app.route('/api/debug-insert')
def debug_insert():
    """Direct DB write test"""
    log = []
    try:
        conn, db_type = get_db_connection()
        cur = conn.cursor()
        
        # 1. DELETE PREVIOUS TEST
        try:
            cur.execute("DELETE FROM clients WHERE cpf_cnpj = 'TEST_DEBUG_123'")
            log.append("Cleaned old test data")
        except: pass
        
        # 2. INSERT
        ts = datetime.datetime.now().isoformat()
        if db_type == 'postgres':
            cur.execute("INSERT INTO clients (nome, cpf_cnpj, data, updated_at) VALUES (%s, %s, %s, %s)", ('TESTE_DEBUG', 'TEST_DEBUG_123', '{}', ts))
        else:
            cur.execute("INSERT INTO clients (nome, cpf_cnpj, data, updated_at) VALUES (?, ?, ?, ?)", ('TESTE_DEBUG', 'TEST_DEBUG_123', '{}', ts))
            
        conn.commit()
        log.append("INSERT + COMMIT executed")
        
        # 3. VERIFY
        if db_type == 'postgres':
            cur.execute("SELECT id, nome FROM clients WHERE cpf_cnpj = %s", ('TEST_DEBUG_123',))
        else:
            cur.execute("SELECT id, nome FROM clients WHERE cpf_cnpj = ?", ('TEST_DEBUG_123',))
            
        row = cur.fetchone()
        
        conn.close()
        
        return {
            "status": "success" if row else "failed",
            "found_inserted_row": bool(row),
            "log": log,
            "db_type": db_type
        }
    except Exception as e:
        return {"error": str(e), "log": log}, 500

@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    data = request.get_json(silent=True) or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    if not username or not password:
        return {'message': 'Username and password are required'}, 400
        
    user = query_db("SELECT * FROM users WHERE username = ? AND active = 1", (username,), one=True)
    
    # Init admin if no users exist
    if not user:
        all_users = query_db("SELECT count(*) as cnt FROM users", one=True)
        if all_users and all_users['cnt'] == 0 and username == 'admin' and password == 'admin123':
            # Create default admin
            try:
                pw_hash = hash_password('admin123')
                # Admin permissions: can view all
                query_db("INSERT INTO users (username, password_hash, nome, role, active, permissions) VALUES (?, ?, ?, ?, ?, ?)", 
                        ('admin', pw_hash, 'Administrador', 'admin', True, json.dumps({"canViewAllClients": True})), commit=True)
                user = query_db("SELECT * FROM users WHERE username = 'admin'", one=True)
            except Exception as e:
                return {'message': f'Error creating default admin: {str(e)}'}, 500
    
    if not user or not verify_password(user['password_hash'], password):
        return {'message': 'Invalid credentials'}, 401
    
    token = jwt.encode({
        'user_id': user['id'],
        'role': user['role'],
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=12)
    }, SECRET_KEY, algorithm="HS256")
    
    # Parse permissions if JSON
    permissions = {}
    if user['permissions']:
         try: permissions = json.loads(user['permissions'])
         except: pass
         
    return {
        'token': token,
        'user': {
            'id': user['id'],
            'username': user['username'],
            'nome': user['nome'],
            'role': user['role'],
            'permissions': permissions
        }
    }

@app.route('/api/auth/me', methods=['GET'])
@token_required
def auth_me():
    user = query_db("SELECT id, username, nome, role, permissions FROM users WHERE id = ?", (request.user_id,), one=True)
    if not user:
        return {'message': 'User not found'}, 404
        
    permissions = {}
    if user['permissions']:
         try: permissions = json.loads(user['permissions'])
         except: pass
         
    return {
        'user': {
            'id': user['id'],
            'username': user['username'],
            'nome': user['nome'],
            'role': user['role'],
            'permissions': permissions
        }
    }

@app.route('/api/users', methods=['GET', 'POST'])
@token_required
def manage_users():
    # Only admin can manage users
    if request.user_role != 'admin':
        return {'message': 'Permission denied'}, 403

    if request.method == 'GET':
        users = query_db("SELECT id, username, nome, role, permissions, active, created_at FROM users ORDER BY id")
        result = []
        for u in users:
            perms = {}
            if u['permissions']:
                try: perms = json.loads(u['permissions'])
                except: pass
            
            result.append({
                'id': u['id'],
                'username': u['username'],
                'nome': u['nome'],
                'role': u['role'],
                'active': bool(u['active']),
                'aprovado': bool(u['active']), # Compatibility
                'permissions': perms,
                'created_at': str(u['created_at'])
            })
        return {'users': result}

    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        username = data.get('username', '').strip()
        password = data.get('password', '')
        nome = data.get('nome', '').strip()
        
        if not username or not password:
             return {'message': 'Username and password required'}, 400
             
        # Check existing
        existing = query_db("SELECT id FROM users WHERE username = ?", (username,), one=True)
        if existing:
            return {'message': 'Username already exists'}, 409
            
        pw_hash = hash_password(password)
        
        # Permissions
        perms_dict = list(filter(None, [    # Default permissions could be set here
             # "canViewAllClients": False
        ])) 
        # Actually permissions come often empty or specific. 
        # Let's handle permissions if passed, otherwise empty.
        # Frontend passes 'obrasPermitidas' etc inside the user object usually.
        # We will store them in the 'permissions' JSON column.
        
        # Extract known permissions from request if they exist at top level or inside permissions
        # The frontend AdminPanel sends: obrasPermitidas, statusPermitidos, canViewAllClients
        permissions_data = {
            "obrasPermitidas": data.get('obrasPermitidas', []),
            "statusPermitidos": data.get('statusPermitidos', []),
            "canViewAllClients": data.get('canViewAllClients', False)
        }
        
        permissions_json = json.dumps(permissions_data)
        
        query_db("INSERT INTO users (username, password_hash, nome, role, permissions, active) VALUES (?, ?, ?, ?, ?, ?)",
                (username, pw_hash, nome, 'user', permissions_json, True), commit=True)
                
        return {'success': True}

@app.route('/api/users/<int:user_id>', methods=['PUT', 'DELETE'])
@token_required
def user_operations(user_id):
    if request.user_role != 'admin':
        return {'message': 'Permission denied'}, 403
        
    if request.method == 'DELETE':
        # Prevent self-delete
        if user_id == request.user_id:
            return {'message': 'Cannot delete yourself'}, 400
            
        query_db("DELETE FROM users WHERE id = ?", (user_id,), commit=True)
        return {'success': True}

    if request.method == 'PUT':
        data = request.get_json(silent=True) or {}
        
        # Valid fields to update
        updates = []
        params = []
        
        if 'nome' in data:
            updates.append("nome = ?")
            params.append(data['nome'])
            
        if 'password' in data and data['password']:
            updates.append("password_hash = ?")
            params.append(hash_password(data['password']))
            
        if 'active' in data: # mapped from 'aprovado' potentially
            updates.append("active = ?")
            params.append(bool(data['active']))
            
        if 'aprovado' in data: # Frontend compatibility
            updates.append("active = ?")
            params.append(bool(data['aprovado']))
            
        # Permissions update
        if 'obrasPermitidas' in data or 'statusPermitidos' in data or 'canViewAllClients' in data:
            # We need to fetch existing permissions to merge? Or just overwrite?
            # Overwrite is safer/simpler for admin panel usually.
            permissions_data = {
                "obrasPermitidas": data.get('obrasPermitidas', []),
                "statusPermitidos": data.get('statusPermitidos', []),
                "canViewAllClients": data.get('canViewAllClients', False)
            }
            updates.append("permissions = ?")
            params.append(json.dumps(permissions_data))
            
        if 'role' in data:
            updates.append("role = ?")
            params.append(data['role'])

        if not updates:
            return {'message': 'No data to update'}, 400
            
        params.append(user_id)
        sql = f"UPDATE users SET {', '.join(updates)} WHERE id = ?"
        query_db(sql, tuple(params), commit=True)
        
        return {'success': True}

@app.route('/api/generate_proposal', methods=['POST'])
def generate():
    """Generate PDF proposal document"""
    if not generate_pdf_reportlab:
        return {"error": "PDF Generation engine (ReportLab) failed to load"}, 500
        
    try:
        req = request.json
        lot = req.get('lot', {})
        
        def safe_float(v):
            if not v: return 0.0
            if isinstance(v, (int, float)): return float(v)
            try:
                return float(str(v).replace("R$", "").replace(".", "").replace(",", "."))
            except:
                return 0.0

        # Financials
        lot_value = safe_float(req.get('lotValue', 0))
        down_payment_total = safe_float(req.get('downPaymentTotal', 0))
        balance_total = safe_float(req.get('remainingBalance', 0))
        
        # Installments
        down_payment_installments = int(req.get('downPaymentInstallments', 1))
        down_payment_installment_value = down_payment_total / down_payment_installments if down_payment_installments > 0 else 0
        balance_installments = int(req.get('balanceInstallments', 1))
        
        plan_type = "FIXAS"
        if balance_installments == 1:
            plan_type = "À VISTA"
        elif 36 < balance_installments <= 72:
            plan_type = "CORRIGIDAS"
        elif balance_installments > 72:
            plan_type = "REAJUSTÁVEL"
            
        balance_installment_value = balance_total / balance_installments if balance_installments > 0 else 0
        
        # Dates
        proposta_data = req.get('proposta_data', None)
        if proposta_data:
            try:
                prop_year, prop_month, prop_day = proposta_data.split('-')
                cur_day, cur_month, cur_year_full = prop_day, prop_month, prop_year
                cur_year_short = prop_year[2:]
            except:
                now = datetime.datetime.now()
                cur_day, cur_month, cur_year_full, cur_year_short = now.strftime("%d"), now.strftime("%m"), now.strftime("%Y"), now.strftime("%y")
        else:
            now = datetime.datetime.now()
            cur_day, cur_month, cur_year_full, cur_year_short = now.strftime("%d"), now.strftime("%m"), now.strftime("%Y"), now.strftime("%y")
        
        # Project Info
        obra_name_full = req.get('obraName', 'VALLE')
        obra_parts = obra_name_full.split(' - ')
        obra_city = obra_parts[-1] if len(obra_parts) > 1 else "ANANINDEUA"
        obra_name = obra_parts[0].replace("RESIDENCIAL ", "") if len(obra_parts) > 1 else obra_name_full
        
        # Entrada
        entrada_value = safe_float(req.get('entradaValue', 0))
        entrada_enabled = req.get('entradaEnabled', False)
        has_entrada = bool(entrada_enabled) and entrada_value > 0.01
        
        # Data Map
        data = {
            "empreendimento": obra_name,
            "quadra": str(lot.get('QD', '')),
            "lote": str(lot.get('LT', '')),
            "area": str(lot.get('M2', '')),
            "logradouro": str(req.get('logradouro', lot.get('LOGRADOURO', lot.get('logradouro', '')))),
            "valor_inicial": format_currency(lot_value),
            "valor_total_entrada": format_currency(entrada_value) if has_entrada else "",
            "valor_sinal": format_currency(down_payment_total),
            "sinal_l1_qtd_parcelas": req.get('sinal_l1_qtd_parcelas', str(down_payment_installments)),
            "sinal_l1_valor_parcela": req.get('sinal_l1_valor_parcela', format_currency(down_payment_installment_value)),
            "sinal_l1_dia": req.get('sinal_l1_dia', cur_day),
            "sinal_l1_mes": req.get('sinal_l1_mes', cur_month),
            "sinal_l1_ano": req.get('sinal_l1_ano', cur_year_full),
            "sinal_l1_periodicidade": req.get('sinal_l1_periodicidade', ("MENSAL" if down_payment_installments > 1 else "À VISTA")),
            "valor_saldo_parcelar": format_currency(balance_total),
            "saldo_qtd_parcelas": str(balance_installments),
            "saldo_valor_parcela": format_currency(balance_installment_value),
            "saldo_dia": req.get('saldo_dia', cur_day),
            "saldo_mes": req.get('saldo_mes', cur_month),
            "saldo_ano": req.get('saldo_ano', cur_year_full),
            "saldo_periodicidade": "MENSAL",
            "saldo_tipo_parcela": plan_type,
            "cidade_proposta_final": f"{obra_city} / PA",
            "dia_proposta_final": cur_day,
            "mes_proposta_final": {
                "01": "JANEIRO", "02": "FEVEREIRO", "03": "MARÇO", "04": "ABRIL",
                "05": "MAIO", "06": "JUNHO", "07": "JULHO", "08": "AGOSTO",
                "09": "SETEMBRO", "10": "OUTUBRO", "11": "NOVEMBRO", "12": "DEZEMBRO"
            }.get(cur_month, "JANEIRO"),
            "ano_proposta_final": cur_year_short,
            "cidade_empreendimento": obra_city,
            "estado_empreendimento": "PA"
        }
        
        # Merge other fields
        exclude_keys = ['lot', 'lotValue', 'downPaymentTotal', 'downPaymentInstallments', 'remainingBalance', 'balanceInstallments', 'obraName', 'entradaValue', 'entradaEnabled']
        has_segundo = bool(req.get('has_segundo', False))
        
        for key, value in req.items():
            if key in exclude_keys: continue
            if ('_segundo' in key or 'segundo' in key.lower()) and not has_segundo: continue
            if ('entrada' in key.lower()) and not has_entrada: continue
            
            if key not in data:
                data[key] = value if isinstance(value, bool) else (str(value) if value is not None else "")

        # PJ Mapping
        if req.get('tipo_pessoa') == 'PJ':
            data['nacionalidade_proponente'] = '-'
            if req.get('inscricao_estadual_proponente'):
                data['rg_proponente'] = str(req.get('inscricao_estadual_proponente'))
            if req.get('data_fundacao_proponente'):
                data['data_nascimento_proponente'] = str(req.get('data_fundacao_proponente'))

        # Assets
        bg_path = os.path.join(BASE_DIR, "PROPOSTA LIMPA.jpg")
        json_path = os.path.join(BASE_DIR, "posicoes_campos.json")
        output_file = os.path.join('/tmp' if os.environ.get('VERCEL') == '1' else BASE_DIR, "temp_proposal.pdf")
        
        if not os.path.exists(bg_path):
             return {"error": f"Internal Error: Asset missing {bg_path}"}, 500
        if not os.path.exists(json_path):
             return {"error": f"Internal Error: Asset missing {json_path}"}, 500
        
        generate_pdf_reportlab(data, bg_path, json_path, output_file)
        
        # Auto-save client to DB
        try:
            name = req.get('nome_proponente', '').strip()
            cpf = req.get('cpf_cnpj_proponente', '').strip()
            tipo_pessoa_req = req.get('tipo_pessoa', 'PF')
            if name and cpf:
                # Consider tipo_pessoa when checking duplicates / saving
                existing = query_db("SELECT id FROM clients WHERE cpf_cnpj = ? AND tipo_pessoa = ?", (cpf, tipo_pessoa_req), one=True)
                client_json = json.dumps(req)
                now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                if existing:
                    query_db("UPDATE clients SET nome = ?, tipo_pessoa = ?, data = ?, updated_at = ? WHERE id = ?", (name, tipo_pessoa_req, client_json, now, existing['id']), commit=True)
                else:
                    query_db("INSERT INTO clients (nome, cpf_cnpj, tipo_pessoa, data, updated_at) VALUES (?, ?, ?, ?, ?)", (name, cpf, tipo_pessoa_req, client_json, now), commit=True)
        except Exception as e:
            print(f"AUTO-SAVE ERROR: {e}")


        return send_file(output_file, as_attachment=True, download_name=f"Proposta_Q{str(lot.get('QD', ''))}_L{str(lot.get('LT', ''))}.pdf")

    except Exception as e:
        return {"error": str(e), "traceback": traceback.format_exc()}, 500

# Old get_clients replaced by centralized clients() route

@app.route('/api/manage-clients/check-duplicate', methods=['GET'])
def check_duplicate():
    try:
        cpf = request.args.get('cpf_cnpj', '').strip()
        tipo_pessoa = request.args.get('tipo_pessoa', 'PF')
        cid = request.args.get('client_id')
        if not cpf: return {'exists': False}
        
        if cid:
            row = query_db("SELECT id, nome FROM clients WHERE cpf_cnpj = ? AND tipo_pessoa = ? AND id != ?", (cpf, tipo_pessoa, cid), one=True)
        else:
            row = query_db("SELECT id, nome FROM clients WHERE cpf_cnpj = ? AND tipo_pessoa = ?", (cpf, tipo_pessoa), one=True)
        
        if row:
            return {'exists': True, 'client': {'id': row['id'], 'nome_proponente': row['nome']}}
        return {'exists': False}
    except Exception as e:
        return {'error': str(e)}, 500


@app.route('/api/manage-clients/<int:client_id>', methods=['DELETE'])
def delete_client_route(client_id):
    """Delete a client by ID. Must be after check-duplicate route."""
    try:
        conn, db_type = get_db_connection()
        cur = conn.cursor()
        if db_type == 'postgres':
            cur.execute("DELETE FROM clients WHERE id = %s", (client_id,))
        else:
            cur.execute("DELETE FROM clients WHERE id = ?", (client_id,))
        conn.commit()
        deleted = cur.rowcount
        conn.close()
        if deleted:
            return {"success": True}, 200
        return {"success": False, "error": "Cliente não encontrado"}, 404
    except Exception as e:
        return {"success": False, "error": str(e)}, 500


@app.route('/api/consulta/<int:numprod_psc>', methods=['GET'])
def consulta(numprod_psc):
    """
    Proxy to external availability server.
    Ensures an array is ALWAYS returned to prevent frontend .filter() crashes.
    """
    external_url = f"http://177.221.240.85:8000/api/consulta/{numprod_psc}/"
    fallback_filename = f"fallback_{numprod_psc}.json"
    fallback_path = os.path.join(BASE_DIR, fallback_filename)
    
    try:
        # Reduced timeout to 1.5s for fast fallback
        resp = requests.get(external_url, timeout=1.5)
        if resp.status_code == 200:
            data_json = resp.json()
            actual_data = data_json.get('data', [])
            if not isinstance(actual_data, list):
                if isinstance(data_json, list): actual_data = data_json
                else: actual_data = []
            return {"success": True, "data": actual_data}, 200
        else:
            print(f"PROXY STATUS ERROR: {resp.status_code} for {external_url}")
    except Exception as e:
        print(f"PROXY EXCEPTION: {e}")

    # FALLBACK LOGIC: If API fails/timeouts, try to load from local JSON
    if os.path.exists(fallback_path):
        try:
            with open(fallback_path, 'r', encoding='utf-8-sig') as f:
                fallback_data = json.load(f)
                # If it's the whole response object
                if isinstance(fallback_data, dict) and 'data' in fallback_data:
                    return {"success": True, "data": fallback_data['data'], "source": "fallback"}, 200
                # If it's just the list
                if isinstance(fallback_data, list):
                    return {"success": True, "data": fallback_data, "source": "fallback"}, 200
        except Exception as fe:
            print(f"FALLBACK ERROR: {fe}")

    return {"success": True, "data": [], "error": "API Timeout & No Fallback"}, 200


@app.route('/api/manage-clients', methods=['GET', 'POST', 'OPTIONS'])
def clients():
    try:
        if request.method == 'GET':
            # Support optional query parameters for search, pagination and type filtering
            q = (request.args.get('q') or '').strip()
            tipo = (request.args.get('type') or request.args.get('tipo_pessoa') or '').strip().upper()
            created_by = (request.args.get('created_by') or '').strip()
            
            try:
                page = int(request.args.get('page', 1))
            except:
                page = 1
            try:
                limit = int(request.args.get('limit', 50))
            except:
                limit = 50

            offset = max(0, (page - 1) * limit)

            where_clauses = []
            params = []

            if tipo and tipo not in ['TODOS', 'ALL', '']:
                # Include clients with NULL tipo_pessoa based on CPF/CNPJ length
                # CPF has 11 digits = PF, CNPJ has 14 digits = PJ
                if tipo == 'PF':
                    where_clauses.append("(tipo_pessoa = ? OR (tipo_pessoa IS NULL AND LENGTH(REPLACE(REPLACE(REPLACE(cpf_cnpj, '.', ''), '-', ''), '/', '')) = 11))")
                elif tipo == 'PJ':
                    where_clauses.append("(tipo_pessoa = ? OR (tipo_pessoa IS NULL AND LENGTH(REPLACE(REPLACE(REPLACE(cpf_cnpj, '.', ''), '-', ''), '/', '')) = 14))")
                else:
                    where_clauses.append("tipo_pessoa = ?")
                params.append(tipo)
            
            if created_by:
                where_clauses.append("created_by = ?")
                params.append(created_by)

            if q:
                where_clauses.append("(nome LIKE ? OR cpf_cnpj LIKE ?)")
                qparam = f"%{q}%"
                params.extend([qparam, qparam])

            where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

            # Total count
            count_sql = f"SELECT COUNT(*) as total FROM clients {where_sql}"
            count_row = query_db(count_sql, tuple(params), one=True)
            total = int(count_row.get('total', 0)) if count_row else 0

            # Data page
            select_sql = f"SELECT id, nome, cpf_cnpj, data, created_at, updated_at, tipo_pessoa, created_by FROM clients {where_sql} ORDER BY updated_at DESC LIMIT ? OFFSET ?"
            params_with_pagination = params + [limit, offset]
            rows = query_db(select_sql, tuple(params_with_pagination))

            clients_list = []
            if rows:
                for row in rows:
                    client = row.copy()
                    # Convert datetimes to string
                    if isinstance(client.get('created_at'), datetime.datetime):
                        client['created_at'] = client['created_at'].isoformat()
                    if isinstance(client.get('updated_at'), datetime.datetime):
                        client['updated_at'] = client['updated_at'].isoformat()

                    # Parse JSON data if it's a string
                    if isinstance(client.get('data'), str):
                        try:
                            client['data'] = json.loads(client['data'])
                        except:
                            client['data'] = {}
                    clients_list.append(client)

            return {"success": True, "clients": clients_list, "total_count": total}, 200
            
        if request.method == 'POST':
            # Use force=True to ignore Content-Type, silent=True to return None instead of 400
            req = request.get_json(force=True, silent=True)
            
            if not req:
                print(f"BAD REQUEST DEBUG: No JSON received. Data: {request.data}")
                return {"error": "Invalid JSON or Empty Body", "debug_data": str(request.data)}, 400

            # Accept both 'nome' and 'nome_proponente'
            name = req.get('nome') or req.get('nome_proponente', '')
            cpf = req.get('cpf_cnpj') or req.get('cpf_cnpj_proponente', '')
            tipo_pessoa = req.get('tipo_pessoa', 'PF')
            created_by = req.get('created_by') or None # ID of the user creating/updating
            
            # Additional cleanup
            if name: name = name.strip()
            if cpf: cpf = cpf.strip()

            data_json = json.dumps(req.get('data', req)) # If 'data' missing, store whole req
            now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            if not name or not cpf:
                return {"error": "Name and CPF/CNPJ are required fields"}, 400
                
            existing = query_db("SELECT id FROM clients WHERE cpf_cnpj = ? AND tipo_pessoa = ?", (cpf, tipo_pessoa), one=True)
            
            if existing:
                # Update: we preserve original created_by unless explicitly needed, or update if NULL?
                # For now let's just update common fields. 
                # If created_by is missing in DB but passed in req, maybe update it? Let's verify.
                # Simplification: Only update non-identity fields. 
                result = query_db("UPDATE clients SET nome = ?, tipo_pessoa = ?, data = ?, updated_at = ? WHERE id = ?", (name, tipo_pessoa, data_json, now, existing['id']), commit=True)
                if result is None:
                    return {"error": "Failed to update client in database"}, 500
            else:
                result = query_db("INSERT INTO clients (nome, cpf_cnpj, tipo_pessoa, data, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?)", (name, cpf, tipo_pessoa, data_json, now, created_by), commit=True)
                if result is None:
                    return {"error": "Failed to insert client in database"}, 500
                
            return {"success": True}, 200
            
    except Exception as e:
        return {"error": str(e)}, 500

# Vercel requires the app variable
app = app

# Trigger Deploy: DB Switch
