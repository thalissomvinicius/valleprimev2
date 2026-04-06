from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import datetime
import traceback
import json
import hashlib
import secrets
import sys
import requests
import jwt
from functools import wraps
import threading
import time

# Importar gerador de PDF
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from generate_proposal_reportlab import generate_pdf_reportlab
except ImportError as e:
    print(f"[WARN] Could not import generate_pdf_reportlab: {e}")
    generate_pdf_reportlab = None

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

@app.after_request
def add_cors_headers(response):
    """Ensure CORS headers are present even on errors."""
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

SECRET_KEY = os.environ.get('SECRET_KEY', 'dev_secret_key_valle_prime_v2')

# Supabase is the sole data source (configured via environment variables)

from database import (
    get_user_by_id, get_user_by_username, get_all_users, create_user, update_user, delete_user, count_users,
    get_clients, check_duplicate_client, get_client_by_id, create_client, update_client, delete_client, count_clients, get_recent_clients,
    get_proposals, get_proposal_by_id, count_proposals, create_proposal, update_proposal, delete_proposal,
    create_alert, get_recent_alerts
)

def hash_password(password):
    salt = secrets.token_hex(16)
    return hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000).hex() + ':' + salt

def verify_password(stored_password, provided_password):
    if not stored_password or not provided_password:
        return False
    try:
        # Format 1: PBKDF2 with salt (hash:salt)
        if ':' in stored_password:
            password_hash, salt = stored_password.split(':')
            new_hash = hashlib.pbkdf2_hmac('sha256', provided_password.encode(), salt.encode(), 100000).hex()
            return new_hash == password_hash
        
        # Format 2: Simple MD5 hash
        md5_hash = hashlib.md5(provided_password.encode()).hexdigest()
        if stored_password == md5_hash:
            return True
        
        # Format 3: Simple SHA256 hash
        sha256_hash = hashlib.sha256(provided_password.encode()).hexdigest()
        if stored_password == sha256_hash:
            return True
        
        # Format 4: Plain text comparison (for testing only)
        if stored_password == provided_password:
            return True
        
        return False
    except Exception as e:
        print(f"[VERIFY_PASSWORD ERROR] {e}")
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
    return jsonify({"status": "ok", "message": "Full system restored (v8.6-master-sync)", "time": datetime.datetime.now().isoformat()})

def check_supabase_connection():
    """Verify Supabase connectivity and ensure default admin exists"""
    try:
        from database import SUPABASE_URL, SUPABASE_KEY
        if not SUPABASE_URL or not SUPABASE_KEY:
            print("[STARTUP] WARNING: SUPABASE_URL or SUPABASE_KEY not set!")
            return False
            
        # Check if admin user exists
        admin = get_user_by_username('admin')
        if not admin:
            print("[STARTUP] Admin user not found. Seeding default admin...")
            # Hash for 'admin123' (salt: 1234567890abcdef1234567890abcdef)
            default_hash = "a09be37937be13180bb2ef0133b37803df3bf7c2688029514e868f0b09315d16:1234567890abcdef1234567890abcdef"
            create_user('admin', default_hash, 'Administrador', 'admin', {"all": True}, True)
            print("[STARTUP] Default admin seeded successfully.")
        else:
            print("[STARTUP] Supabase connected. Admin user exists.")
        
        return True
    except Exception as e:
        print(f"[STARTUP] Supabase connection/seed failed: {e}")
        return False

@app.route('/api/debug/db')
def debug_db():
    try:
        from database import SUPABASE_URL, SUPABASE_KEY
        if request.args.get('test_insert') == 'true':
            create_client("Teste Manual", "00000000000", "PF", "system", {})
            return jsonify({"message": "Manual test insert executed. Refresh this page to see count."})

        clients_count = count_clients()
        users_count = count_users()
        last_clients = get_recent_clients(5)
        
        env_vars = {k: "SET" if "KEY" in k or "URL" in k or "PASSWORD" in k or "SECRET" in k else v 
                   for k, v in os.environ.items() if k in ['DATABASE_URL', 'DATABASE_URL1', 'VERCEL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']}
        
        return jsonify({
            "database": "supabase-only",
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

def get_optional_user_from_token():
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None, None
    token = auth_header.split(' ')[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return payload.get('user_id'), payload.get('role')
    except:
        return None, None

def extract_proposal_meta(payload):
    obra_codigo = None
    obra_nome = None
    quadra = None
    lote = None
    if isinstance(payload, dict):
        obra_nome = payload.get('obraName') or payload.get('obra_nome') or payload.get('obra')
        obra_codigo = payload.get('obra_codigo')
        lot = payload.get('lot')
        if isinstance(lot, dict):
            quadra = lot.get('QD') or lot.get('quadra')
            lote = lot.get('LT') or lot.get('lote')
            obra_codigo = obra_codigo or lot.get('CODIGO') or lot.get('codigo_obra') or lot.get('Empreendimento') or lot.get('Obra')
        else:
            quadra = payload.get('quadra')
            lote = payload.get('lote')
    return obra_codigo, obra_nome, quadra, lote

def store_proposal(payload, user_id):
    obra_codigo, obra_nome, quadra, lote = extract_proposal_meta(payload)
    print(f"\n[DEBUG STORE_PROPOSAL] Preparing to insert into proposals: user_id={user_id}, obra_codigo={obra_codigo}, obra_nome={obra_nome}, quadra={quadra}, lote={lote}")
    try:
        create_proposal(user_id, obra_codigo, obra_nome, quadra, lote, payload)
        print("[DEBUG STORE_PROPOSAL] Insert successful.")
    except Exception as e:
        print(f"[DEBUG STORE_PROPOSAL] Insert exception: {e}")
        import traceback
        traceback.print_exc()

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
        
        user_id = payload.get('user_id')
        
        # Removed hardcoded admin bypass
            
        # Buscar usuário no banco
        user_record = get_user_by_id(user_id)
        
        if user_record:
            # Rejeitar se inativo
            active = user_record.get('active')
            if active is not None and str(active).lower() in ('false', '0'):
                return jsonify({'message': 'Usuário inativo ou pendente de aprovação'}), 401
                
            perms = user_record.get('permissions')
            parsed_perms = {}
            if perms:
                if isinstance(perms, str):
                    try:
                        parsed_perms = json.loads(perms)
                    except:
                        pass
                else:
                    parsed_perms = perms
                    
            return jsonify({
                'user': {
                    'id': user_record.get('id'),
                    'username': user_record.get('username'),
                    'nome': user_record.get('nome'),
                    'role': user_record.get('role', 'user'),
                    'permissions': parsed_perms,
                    'active': True
                }
            })
            
        # Fallback (não encontrado)
        return jsonify({'message': 'User not found in database'}), 401
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
    

    
    try:
        user = get_user_by_username(username, active_only=True)
        # If user not found and table might be empty, try to create admin once
        if not user and username == 'admin' and password == 'admin123':
            cnt_res = count_users()
            if cnt_res and cnt_res.get('count', 0) == 0:
                pw_hash = hash_password('admin123')
                create_user('admin', pw_hash, 'Admin', 'admin', {"canViewAllClients": True}, True)
                user = get_user_by_username('admin', active_only=True)
    except Exception as e:
        print(f"[LOGIN-GET] Lookup failed: {e}")
        user = None
    
    if not user:
        return jsonify({'message': 'Invalid credentials'}), 401
    
    # Verify password
    if not verify_password(user.get('password_hash', ''), password):
        return jsonify({'message': 'Invalid credentials'}), 401
    
    # Generate token
    try:
        token = jwt.encode({
            'user_id': user['id'],
            'role': user['role'],
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=12)
        }, SECRET_KEY, algorithm="HS256")
        if isinstance(token, bytes): token = token.decode('utf-8')
    except Exception as e:
        print(f"[LOGIN-GET] Token generation failed: {e}")
        return jsonify({'message': 'Internal error'}), 500
    
    # Parse permissions
    perms = {}
    if user.get('permissions'):
        try:
            perms = json.loads(user['permissions']) if isinstance(user['permissions'], str) else user['permissions']
        except:
            pass
    
    return jsonify({
        'token': token,
        'user': {
            'id': user['id'],
            'username': user['username'],
            'nome': user.get('nome'),
            'role': user['role'],
            'permissions': perms
        }
    })

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
        

        
        try:
            user = get_user_by_username(username, active_only=True)
            if not user and username == 'admin' and password == 'admin123':
                cnt_res = count_users()
                if cnt_res and cnt_res.get('count', 0) == 0:
                    pw_hash = hash_password('admin123')
                    create_user('admin', pw_hash, 'Admin', 'admin', {"canViewAllClients": True}, True)
                    user = get_user_by_username('admin', active_only=True)
        except Exception as e:
            print(f"[LOGIN POST] Lookup failed: {e}")
            user = None

        if not user:
            return jsonify({'message': 'Invalid credentials (User not found)'}), 401
            
        if not verify_password(user['password_hash'], password):
            return jsonify({'message': 'Invalid credentials (Password mismatch)'}), 401
        
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
                'nome': user.get('nome'),
                'role': user['role'],
                'permissions': perms
            }
        })
    except Exception as e:
        if conn: conn.close()
        return jsonify({'message': 'Internal Login Error', 'error': str(e)}), 500

@app.route('/api/proposals', methods=['GET'])
@token_required
def list_proposals():
    try:
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 50))
        if page < 1: page = 1
        if limit < 1: limit = 50
        offset = (page - 1) * limit

        uid_filter = None if request.user_role == 'admin' else request.user_id
        
        total_count = count_proposals(uid_filter)
        rows = get_proposals(uid_filter, limit, offset)

        proposals = []
        for row in rows:
            payload = row.get('payload')
            if isinstance(payload, str):
                try:
                    payload = json.loads(payload)
                except:
                    pass
            proposals.append({
                "id": row.get("id"),
                "user_id": row.get("user_id"),
                "obra_codigo": row.get("obra_codigo"),
                "obra_nome": row.get("obra_nome"),
                "quadra": row.get("quadra"),
                "lote": row.get("lote"),
                "payload": payload,
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at")
            })

        return jsonify({
            "success": True,
            "proposals": proposals,
            "total_count": total_count['count'] if total_count else 0,
            "page": page,
            "limit": limit
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/proposals/<int:proposal_id>', methods=['GET', 'PUT', 'DELETE'])
@token_required
def proposal_detail(proposal_id):
    proposal = get_proposal_by_id(proposal_id)
    if not proposal:
        return jsonify({"error": "Not found"}), 404

    if request.user_role != 'admin' and proposal.get('user_id') != request.user_id:
        return jsonify({"error": "Forbidden"}), 403

    if request.method == 'DELETE':
        delete_proposal(proposal_id)
        return jsonify({"success": True})

    if request.method == 'GET':
        payload = proposal.get('payload')
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except:
                pass
        return jsonify({
            "id": proposal.get("id"),
            "user_id": proposal.get("user_id"),
            "obra_codigo": proposal.get("obra_codigo"),
            "obra_nome": proposal.get("obra_nome"),
            "quadra": proposal.get("quadra"),
            "lote": proposal.get("lote"),
            "payload": payload,
            "created_at": proposal.get("created_at"),
            "updated_at": proposal.get("updated_at")
        })

    data = request.get_json(silent=True) or {}
    payload = data.get('payload') if isinstance(data, dict) and 'payload' in data else data
    if not isinstance(payload, dict):
        return jsonify({"error": "Invalid payload"}), 400

    obra_codigo, obra_nome, quadra, lote = extract_proposal_meta(payload)
    update_proposal(proposal_id, obra_codigo, obra_nome, quadra, lote, payload)
    return jsonify({"success": True})

@app.route('/api/proposals/<int:proposal_id>/pdf', methods=['GET'])
@token_required
def proposal_pdf(proposal_id):
    proposal = get_proposal_by_id(proposal_id)
    if not proposal:
        return jsonify({"error": "Not found"}), 404

    if request.user_role != 'admin' and proposal.get('user_id') != request.user_id:
        return jsonify({"error": "Forbidden"}), 403

    payload = proposal.get('payload')
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except:
            payload = None
    if not payload:
        return jsonify({"error": "Invalid payload"}), 400

    if not generate_pdf_reportlab:
        return jsonify({'error': 'PDF generator not available'}), 500

    base_dir = os.path.dirname(os.path.abspath(__file__))
    positions_path = os.path.join(base_dir, 'posicoes_campos.json')
    background_path = os.path.join(base_dir, 'PROPOSTA LIMPA.jpg')
    output_path = os.path.join(base_dir, f'proposta_output_{proposal_id}.pdf')

    generate_pdf_reportlab(payload, background_path, positions_path, output_path)

    if not os.path.exists(output_path):
        return jsonify({'error': 'Failed to generate PDF'}), 500

    return send_file(
        output_path,
        mimetype='application/pdf',
        as_attachment=False,
        download_name='proposta.pdf'
    )

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
    """Busca dados de lotes do servidor externo"""
    def enrich_payload(payload):
        """Guarantee Data_Atualizacao exists at root and items for frontend footer."""
        if not payload:
            return payload or {"data": []}
        def parse_date_str(val):
            if not val:
                return None
            try:
                parts = str(val).split('/')
                if len(parts) == 3:
                    d, m, y = [int(p) for p in parts]
                    return datetime.date(y, m, d)
                # fallback ISO
                return datetime.date.fromisoformat(str(val))
            except Exception:
                return None

        last_update = None
        data_list = payload.get("data") if isinstance(payload, dict) and isinstance(payload.get("data"), list) else None
        # start with root date if present
        if isinstance(payload, dict):
            last_update = parse_date_str(payload.get("Data_Atualizacao"))

        # compute max date across items
        if data_list:
            for item in data_list:
                if not isinstance(item, dict):
                    continue
                d = parse_date_str(item.get("Data_Atualizacao"))
                if d and (last_update is None or d > last_update):
                    last_update = d

        # If still none, try first item's date
        if last_update is None and data_list and isinstance(data_list[0], dict):
            last_update = parse_date_str(data_list[0].get("Data_Atualizacao"))

        # propagate back to items and root in DD/MM/YYYY
        if last_update:
            formatted = last_update.strftime('%d/%m/%Y')
            if data_list:
                for item in data_list:
                    if isinstance(item, dict) and not item.get("Data_Atualizacao"):
                        item["Data_Atualizacao"] = formatted
            if isinstance(payload, dict):
                payload["Data_Atualizacao"] = formatted
        return payload

    try:
        import time
        connect_timeout = float(os.environ.get('CONSULTA_CONNECT_TIMEOUT', '12'))
        read_timeout = float(os.environ.get('CONSULTA_READ_TIMEOUT', '20'))
        retries = int(os.environ.get('CONSULTA_RETRIES', '1'))
        last_error = None
        
        # Headers para simular navegador real e evitar bloqueio por WAF/Firewall
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Referer': 'http://177.221.240.85:8000/',
            'Origin': 'http://177.221.240.85:8000',
            'Connection': 'keep-alive'
        }

        for attempt in range(retries + 1):
            try:
                resp = requests.get(
                    f"http://177.221.240.85:8000/api/consulta/{numprod_psc}/",
                    params={"t": int(time.time())},
                    headers=headers,
                    timeout=(connect_timeout, read_timeout)
                )
                if resp.status_code == 200:
                    payload = enrich_payload(resp.json())
                    if isinstance(payload, dict) and payload.get("success") is None:
                        payload["success"] = True
                    return jsonify(payload)
                last_error = f"HTTP {resp.status_code}"
            except Exception as e:
                last_error = str(e)
            time.sleep(0.6 * (attempt + 1))
        
        # Fallback para arquivo local se a API externa falhar
        try:
            fallback_path = os.path.join(os.path.dirname(__file__), f'fallback_{numprod_psc}.json')
            if os.path.exists(fallback_path):
                print(f"[WARN] API externa falhou ({last_error}). Usando fallback local: {fallback_path}")
                with open(fallback_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    # Tenta enriquecer dados do fallback também
                    payload = enrich_payload(data)
                    if isinstance(payload, dict):
                        payload["success"] = True
                        payload["_cached"] = True
                        payload["_error"] = str(last_error)
                    return jsonify(payload)
        except Exception as fallback_err:
            print(f"[ERROR] Falha ao ler fallback: {fallback_err}")

        return jsonify({
            "success": False,
            "data": [],
            "error": f"Consulta indisponivel. {last_error}"
        }), 503
    except Exception as e:
        print(f"[consulta] external fetch failed: {e}")
        return jsonify({
            "success": False,
            "data": [],
            "error": str(e)
        })

@app.route('/api/clients', methods=['GET', 'POST'])
@app.route('/api/manage-clients', methods=['GET', 'POST'])
@token_required
def manage_clients():
    if request.method == 'GET':
        print(f"[DEBUG] GET Clients for user_id: {request.user_id}, role: {request.user_role}")
        
        # Get type filter (pf or pj)
        client_type = request.args.get('type', 'pf').upper()  # 'PF' or 'PJ'
        print(f"[DEBUG] Filtering by tipo_pessoa: {client_type}")
        
        can_see_all = request.user_role == 'admin'
        if not can_see_all:
             # Check specific permissions
             user = get_user_by_id(request.user_id)
             perms = user.get('permissions', {}) if user else {}
             if isinstance(perms, str):
                 try:
                     perms = json.loads(perms)
                 except:
                     perms = {}
             can_see_all = perms.get('canViewAllClients', False)

        created_by = request.args.get('created_by')
        force_created_by = None
        if created_by and (request.user_role == 'admin' or str(created_by) == str(request.user_id)):
            force_created_by = str(created_by)
        
        if can_see_all:
            clients = get_clients(client_type, force_created_by if force_created_by else None)
        else:
            clients = get_clients(client_type, str(request.user_id))
        
        print(f"[DEBUG] Found {len(clients) if clients else 0} clients")
        # Normalize response for frontend
        if isinstance(clients, list):
            return jsonify({
                "success": True,
                "clients": clients,
                "total_count": len(clients)
            })
        return jsonify({"success": True, "clients": [], "total_count": 0})

    if request.method == 'POST':
        try:
            data = request.get_json()
            print(f"[DEBUG] Received data: {data}")

            if not data:
                return jsonify({'success': False, 'error': 'No data provided'}), 400

            client_id_raw = data.get('client_id')
            client_id = None
            if client_id_raw:
                import re
                match = re.search(r'\d+', str(client_id_raw))
                if match:
                    client_id = int(match.group())

            nome = data.get('nome') or data.get('nome_proponente') or data.get('razao_social_proponente')
            cpf_cnpj = data.get('cpf_cnpj') or data.get('cpf_cnpj_proponente')
            tipo_pessoa = data.get('tipo_pessoa', 'PF')

            print(f"[DEBUG] Extracted - nome: {nome}, cpf_cnpj: {cpf_cnpj}, tipo_pessoa: {tipo_pessoa}, client_id: {client_id}")

            if not nome or not cpf_cnpj:
                return jsonify({
                    'success': False,
                    'error': 'Campos obrigatórios faltando',
                    'message': 'Nome e CPF/CNPJ são obrigatórios',
                    'required': ['nome or nome_proponente', 'cpf_cnpj or cpf_cnpj_proponente']
                }), 400

            if client_id:
                existing = get_client_by_id(client_id)
                if not existing:
                    return jsonify({'success': False, 'error': 'Cliente não encontrado'}), 404

                can_update_any = request.user_role == 'admin'
                if not can_update_any:
                    user = get_user_by_id(request.user_id)
                    perms = json.loads(user['permissions']) if user and isinstance(user.get('permissions'), str) else (user.get('permissions') or {})
                    can_update_any = perms.get('canViewAllClients', False)

                if not can_update_any and str(existing.get('created_by')) != str(request.user_id):
                    return jsonify({'success': False, 'error': 'Sem permissão para atualizar este cliente'}), 403

                updated_at = datetime.datetime.now().isoformat()
                print(f"[DEBUG] Attempting to update client: {client_id} - {nome} - {cpf_cnpj}")
                success = update_client(client_id, nome, cpf_cnpj, tipo_pessoa, data, updated_at)
                print(f"[DEBUG] Update result: {success}")
                if success:
                    return jsonify({'success': True, 'message': 'Cliente atualizado com sucesso', 'database': 'supabase-rest'})
                return jsonify({'success': False, 'error': 'Falha ao atualizar no banco de dados Supabase'}), 500

            existing_id = None
            for c in get_clients(tipo_pessoa, str(request.user_id)):
                if c.get('cpf_cnpj') == cpf_cnpj:
                    existing_id = c.get('id')
                    break
            if existing_id:
                updated_at = datetime.datetime.now().isoformat()
                print(f"[DEBUG] Attempting to update existing client by CPF/CNPJ: {existing_id}")
                success = update_client(existing_id, nome, cpf_cnpj, tipo_pessoa, data, updated_at)
                print(f"[DEBUG] Update result: {success}")
                if success:
                    return jsonify({'success': True, 'message': 'Cliente atualizado com sucesso', 'database': 'supabase-rest'})
                return jsonify({'success': False, 'error': 'Falha ao atualizar no banco de dados Supabase'}), 500

            print(f"[DEBUG] Attempting to insert client: {nome} - {cpf_cnpj}")
            success = create_client(nome, cpf_cnpj, tipo_pessoa, str(request.user_id), data)
            print(f"[DEBUG] Insert result: {success}")

            if success:
                return jsonify({'success': True, 'message': 'Cliente salvo com sucesso', 'database': 'supabase-rest'})
            else:
                return jsonify({'success': False, 'error': 'Falha ao inserir no banco de dados Supabase'}), 500

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


@app.route('/api/clients/<int:client_id>', methods=['DELETE'])
@app.route('/api/manage-clients/<int:client_id>', methods=['DELETE'])
@token_required
def delete_client(client_id):
    """Delete a client by ID"""
    try:
        print(f"[DEBUG] Deleting client {client_id} by user {request.user_id}")
        
        # Check permissions - only admin or the user who created the client can delete
        can_delete_any = request.user_role == 'admin'
        if not can_delete_any:
            user = get_user_by_id(request.user_id)
            perms = json.loads(user['permissions']) if user and isinstance(user.get('permissions'), str) else (user.get('permissions') or {})
            can_delete_any = perms.get('canViewAllClients', False)
        
        result = delete_client(client_id, None if can_delete_any else str(request.user_id))
        
        if result:
            return jsonify({'success': True, 'message': 'Cliente excluído com sucesso'})
        else:
            return jsonify({'success': False, 'error': 'Cliente não encontrado ou sem permissão'}), 404
            
    except Exception as e:
        print(f"[ERROR] delete_client: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


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
        
        existing = check_duplicate_client(cpf_cnpj, client_id)
        
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
        users = get_all_users()
        for u in users:
             u['permissions'] = json.loads(u['permissions']) if u['permissions'] and isinstance(u['permissions'], str) else (u['permissions'] or {})
        return jsonify({'users': users})
    
    if request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        if not username or not password:
            return jsonify({'message': 'Missing fields'}), 400
        
        pw_hash = hash_password(password)
        create_user(username, pw_hash, data.get('nome'), 'user', data.get('permissions', {}), True)
        return jsonify({'success': True})

@app.route('/api/users/<int:user_id>', methods=['PUT', 'DELETE'])
@token_required
def user_ops(user_id):
    if request.user_role != 'admin':
        return jsonify({'message': 'Forbidden'}), 403
        
    if request.method == 'DELETE':
        delete_user(user_id)
        return jsonify({'success': True})
    
    if request.method == 'PUT':
        data = request.get_json()
        updates = {}
        if 'nome' in data: updates['nome'] = data['nome']
        if 'active' in data: updates['active'] = bool(data['active'])
        if 'permissions' in data: updates['permissions'] = data['permissions']
            
        if not updates: return jsonify({'message': 'No data'}), 400
        
        update_user(user_id, updates)
        return jsonify({'success': True})

@app.route('/api/generate_proposal', methods=['POST'])
def generate_proposal():
    """Generate PDF proposal from client and lot data"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        print(f"[DEBUG] Generating proposal with data keys: {list(data.keys())}")
        user_id, _ = get_optional_user_from_token()
        
        # Check if PDF generator is available
        if not generate_pdf_reportlab:
            return jsonify({'error': 'PDF generator not available'}), 500
        
        # Define paths
        base_dir = os.path.dirname(os.path.abspath(__file__))
        positions_path = os.path.join(base_dir, 'posicoes_campos.json')
        background_path = os.path.join(base_dir, 'PROPOSTA LIMPA.jpg')
        output_path = os.path.join(base_dir, 'proposta_output.pdf')
        
        # -- BEGIN MAPPING FOR PDF GENERATOR --
        try:
            if 'lot' in data and isinstance(data['lot'], dict):
                lot = data['lot']
                data.setdefault('lote', lot.get('LT'))
                data.setdefault('quadra', lot.get('QD'))
                data.setdefault('area', lot.get('M2'))
                data.setdefault('cidade_empreendimento', lot.get('Cidade', ''))
                data.setdefault('estado_empreendimento', lot.get('UF', ''))
            
            # Handle Empreendimento and City properly
            obra_name = data.get('obraName', '')
            
            # Known Obras from Frontend
            OBRAS = [
                {'codigo': '600', 'descricao': 'RESIDENCIAL JARDIM DO VALLE - DOM ELISEU', 'cidade': 'DOM ELISEU', 'uf': 'PA'},
                {'codigo': '601', 'descricao': 'RESIDENCIAL JARDIM AMERICA - CAPANEMA', 'cidade': 'CAPANEMA', 'uf': 'PA'},
                {'codigo': '602', 'descricao': 'RESIDENCIAL SALLES JARDIM - CASTANHAL', 'cidade': 'CASTANHAL', 'uf': 'PA'},
                {'codigo': '603', 'descricao': 'RESIDENCIAL JARDIM CASTANHAL - CASTANHAL', 'cidade': 'CASTANHAL', 'uf': 'PA'},
                {'codigo': '604', 'descricao': 'RESIDENCIAL IPITINGA - TOMÉ-AÇU', 'cidade': 'TOMÉ-AÇU', 'uf': 'PA'},
                {'codigo': '605', 'descricao': 'RESIDENCIAL VALLE DO IPITINGA - TOMÉ-AÇU', 'cidade': 'TOMÉ-AÇU', 'uf': 'PA'},
                {'codigo': '610', 'descricao': 'RESIDENCIAL JARDIM DO VALLE - TAILANDIA', 'cidade': 'TAILÂNDIA', 'uf': 'PA'},
                {'codigo': '616', 'descricao': 'RESIDENCIAL JARDIM DO VALLE - BARCARENA', 'cidade': 'BARCARENA', 'uf': 'PA'},
                {'codigo': '618', 'descricao': 'RESIDENCIAL JARDIM DO VALLE II - TAILANDIA', 'cidade': 'TAILÂNDIA', 'uf': 'PA'},
                {'codigo': '620', 'descricao': 'RESIDENCIAL JARDIM VALLE DO URAIM - PARAGOMINAS', 'cidade': 'PARAGOMINAS', 'uf': 'PA'},
                {'codigo': '621', 'descricao': 'RESIDENCIAL PARQUE DO VALLE - RONDON', 'cidade': 'RONDON DO PARÁ', 'uf': 'PA'},
                {'codigo': '623', 'descricao': 'RESIDENCIAL JARDIM CASTANHAL III - CASTANHAL', 'cidade': 'CASTANHAL', 'uf': 'PA'},
                {'codigo': '624', 'descricao': 'RESIDENCIAL VALLE DO IPITINGA II - TOMÉ-AÇU', 'cidade': 'TOMÉ-AÇU', 'uf': 'PA'},
                {'codigo': '625', 'descricao': 'RESIDENCIAL VALLE DO IPÊS - TOMÉ AÇU', 'cidade': 'TOMÉ-AÇU', 'uf': 'PA'}
            ]
            
            obra_info = next((o for o in OBRAS if o['descricao'].upper() == obra_name.upper()), None)
            
            if obra_info:
                # Se achou no dict, usamos o nome base (antes do " - CIDADE") para o Empreendimento, se houver
                nome_base = obra_info['descricao'].split(' - ')[0] if ' - ' in obra_info['descricao'] else obra_info['descricao']
                data['empreendimento'] = nome_base
                data['cidade_empreendimento'] = obra_info['cidade']
                data['estado_empreendimento'] = obra_info['uf']
                data['cidade_proposta_final'] = f"{obra_info['cidade']}/{obra_info['uf']}"
            else:
                data.setdefault('empreendimento', obra_name)
                # Fallback: tentar quebrar pelo traço
                if ' - ' in obra_name:
                    partes = obra_name.rsplit(' - ', 1)
                    data['empreendimento'] = partes[0].strip()
                    data.setdefault('cidade_empreendimento', partes[1].strip() if not data.get('cidade_empreendimento') else data['cidade_empreendimento'])
                    data.setdefault('cidade_proposta_final', partes[1].strip() if not data.get('cidade_proposta_final') else data['cidade_proposta_final'])
            
            def format_currency(val):
                try:
                    if not val: return ""
                    v = float(val)
                    return f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
                except:
                    return str(val)

            if 'lotValue' in data: data.setdefault('valor_inicial', format_currency(data['lotValue']))
            if 'downPaymentTotal' in data: data.setdefault('valor_sinal', format_currency(data['downPaymentTotal']))
            if 'remainingBalance' in data: data.setdefault('valor_saldo_parcelar', format_currency(data['remainingBalance']))

            # ENTRADA: Ocultar dados se for zerada ou desabilitada
            entrada_enabled = data.get('entradaEnabled', False)
            entrada_val = 0
            if 'entradaValue' in data:
                try: entrada_val = float(data['entradaValue'])
                except: pass
                
            if not entrada_enabled or entrada_val <= 0:
                for k in ['valor_total_entrada', 'entrada_qtd_parcelas', 'entrada_valor_parcela', 'entrada_dia', 'entrada_mes', 'entrada_ano', 'entrada_periodicidade']:
                    data[k] = ""
            else:
                data['valor_total_entrada'] = format_currency(entrada_val)

            if 'balanceInstallments' in data:
                try:
                    installments = int(data['balanceInstallments'])
                    data.setdefault('saldo_qtd_parcelas', str(installments).zfill(2))
                    if 'remainingBalance' in data:
                        rem_bal = float(data['remainingBalance'])
                        val_parc = (rem_bal / installments) if installments > 0 else 0
                        data.setdefault('saldo_valor_parcela', format_currency(val_parc))
                    data.setdefault('saldo_periodicidade', 'MENSAL')
                    
                    if installments == 1:
                        tipo = "FIXA"
                    elif installments <= 36:
                        tipo = "FIXAS"
                    elif installments <= 72:
                        tipo = "CORRIGIDAS"
                    else:
                        tipo = "REAJUSTÁVEIS"
                        
                    data.setdefault('saldo_tipo_parcela', tipo)
                except:
                    pass

            if 'proposta_data' in data and '-' in data['proposta_data']:
                parts = data['proposta_data'].split('-')
                if len(parts) == 3:
                    ano, mes, dia = parts
                    meses = ["", "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"]
                    idx_mes = int(mes)
                    nome_mes = meses[idx_mes] if 1 <= idx_mes <= 12 else mes
                    data['dia_proposta_final'] = dia
                    data['mes_proposta_final'] = nome_mes.upper()
                    data['ano_proposta_final'] = ano[-2:]
        except Exception as e:
            print(f"[WARN] Error mapping PDF fields: {e}")
        # -- END MAPPING --
        
        # Store formatted proposal history
        if user_id:
            try:
                store_proposal(data, user_id)
            except Exception as e:
                print(f"[WARN] Failed to store proposal history: {e}")
        else:
            print("[WARN] No user_id provided for proposal. Skipping history retention.")

        # Generate PDF
        generate_pdf_reportlab(data, background_path, positions_path, output_path)
        
        # Check if file was created
        if not os.path.exists(output_path):
            return jsonify({'error': 'Failed to generate PDF'}), 500
        
        # Return the PDF file
        return send_file(
            output_path,
            mimetype='application/pdf',
            as_attachment=False,
            download_name='proposta.pdf'
        )
        
    except Exception as e:
        print(f"[ERROR] generate_proposal: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# --- BROKER PERFORMANCE INTEGRATION (Ported from FastAPI) ---

@app.route('/api/integracao/corretores', methods=['GET'])
def get_integracao_corretores():
    """
    Exportação completa dos Corretores via Flask.
    Tenta buscar do cache do Supabase primeiro se estiver em produção (Render).
    """
    empresa = request.args.get('empresa', 28, type=int)
    obra = request.args.get('obra', "70100")
    mes = request.args.get('mes') or datetime.datetime.now().strftime('%Y-%m')
    
    # Em produção (Render), sempre tentamos o cache primeiro pois não há acesso direto ao UAU SQL
    try:
        from modulo_api_corretores.cache_supabase import buscar_cache
        cached = buscar_cache(empresa, obra, mes)
        if cached:
            return jsonify({
                "total_corretores": len(cached['dados']),
                "dados": cached['dados'],
                "atualizado_em": cached['atualizado_em'],
                "is_cache": True
            })
    except Exception as e:
        print(f"[API] Erro ao buscar cache: {e}")

    return jsonify({"error": "Dados não disponíveis no cache e conexão direta com UAU indisponível nesta instância."}), 503

@app.route('/api/integracao/cache/corretores', methods=['GET'])
def get_integracao_cache():
    """Endpoint explícito para busca de cache."""
    empresa = request.args.get('empresa', 28, type=int)
    obra = request.args.get('obra', "70100")
    mes = request.args.get('mes') or datetime.datetime.now().strftime('%Y-%m')
    
    try:
        from modulo_api_corretores.cache_supabase import buscar_cache
        cached = buscar_cache(empresa, obra, mes)
        if cached:
            return jsonify(cached)
        return jsonify({"error": "Cache não encontrado"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/health')
def health_check():
    return jsonify({"status": "healthy", "python": sys.version, "monitor_active": monitor_thread.is_alive()})

@app.route('/api/alerts/recent', methods=['GET'])
@token_required
def get_alerts():
    """Fetch recent lot status alerts from the background monitor"""
    limit = int(request.args.get('limit', 10))
    alerts = get_recent_alerts(limit)
    return jsonify({"success": True, "alerts": alerts})

@app.route('/api/debug-env', methods=['GET'])
def debug_env():
    import os
    import requests
    env_vars = {k: "SET" if ("KEY" in k or "SECRET" in k or "PASSWORD" in k) else v 
                for k, v in os.environ.items() if k in ['SUPABASE_URL', 'VERCEL', 'RENDER', 'PYTHONVERSION']}
    
    supabase_url = os.environ.get('SUPABASE_URL', '').rstrip('/')
    supabase_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    proposals_health = "Not tested"
    
    if supabase_url and supabase_key:
        try:
            url = f"{supabase_url}/rest/v1/proposals?limit=1"
            headers = {
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type": "application/json"
            }
            resp = requests.get(url, headers=headers, timeout=5)
            proposals_health = {
                "status": resp.status_code,
                "text": resp.text
            }
        except Exception as e:
            proposals_health = str(e)

    return jsonify({"env": env_vars, "status": "alive", "proposals_health": proposals_health})

# --- BACKGROUND MONITORING (1s Frequency) ---

def monitor_lots_task():
    """
    Background Task that polls the company API every 1s to detect status changes.
    This runs 24/7 in the cloud (Render) as long as the service is kept awake.
    """
    print("[MONITOR] Starting Background Monitoring Thread...")
    
    # We will monitor all active obras
    OBRA_CODES = ['600', '601', '602', '603', '604', '605', '610', '616', '618', '620', '621', '623', '624', '625'] 
    
    last_status_cache = {} # In-memory cache for change detection
    
    # Pre-populate cache from last alerts to prevent duplicate notifications on restart
    try:
        # Give some time for DB environment to be fully ready
        time.sleep(5)
        recent_alerts = get_recent_alerts(50)
        if recent_alerts and isinstance(recent_alerts, list):
            for al in recent_alerts:
                l_id = al.get('lote_id')
                if l_id and l_id not in last_status_cache:
                    last_status_cache[l_id] = al.get('novo_status')
            print(f"[MONITOR] Pre-cached {len(last_status_cache)} lot statuses from Supabase.")
    except Exception as e:
        print(f"[MONITOR] Failed to pre-cache alerts: {e}")
    
    while True:
        try:
            for code in OBRA_CODES:
                # 1. Fetch current status from company API
                # We use the same fetch_consulta logic but simplified for the thread
                headers = {
                    'User-Agent': 'VallePrime-Cloud-Monitor/2.0',
                    'Accept': 'application/json'
                }
                
                # Note: We use the internal fetch_consulta logic but skip the Flask jsonify component
                target_url = f"http://177.221.240.85:8000/api/consulta/{code}/"
                
                try:
                    r = requests.get(target_url, headers=headers, timeout=5)
                    if r.status_code == 200:
                        data = r.json()
                        lot_list = data.get('data', [])
                        
                        for lot in lot_list:
                            lot_id = f"{code}-Q{lot.get('QD')}-L{lot.get('LT')}"
                            current_status = lot.get('ST')
                            
                            # Detection of change
                            if lot_id in last_status_cache:
                                if last_status_cache[lot_id] != current_status:
                                    msg = f"Lote {lot.get('LT')} (Q{lot.get('QD')}) alterado para {current_status}"
                                    print(f"✨ [ALERT] {code}: {msg}")
                                    
                                    # Persist to Supabase
                                    try:
                                        create_alert(code, lot_id, last_status_cache[lot_id], current_status, msg)
                                    except:
                                        pass # Ignore DB alert errors in thread
                                    
                            last_status_cache[lot_id] = current_status
                except Exception as e:
                    # Silently ignore transient network errors in the thread
                    pass
                
                # Internal sleep between codes to avoid burst
                time.sleep(0.5) 
                
            # Main loop sleep
            time.sleep(1)
            
        except Exception as e:
            print(f"[MONITOR ERROR] {e}")
            time.sleep(10) # Wait before retry on fatal error

# Start the thread on app initialization
try:
    monitor_thread = threading.Thread(target=monitor_lots_task, daemon=True)
    monitor_thread.start()
    print("[STARTUP] Background Monitoring Thread launched.")
except Exception as e:
    print(f"[STARTUP] Failed to start monitor thread: {e}")

# Check Supabase connectivity on startup
try:
    print("[STARTUP] Checking Supabase connectivity...")
    check_supabase_connection()
except Exception as e:
    print(f"[STARTUP] Supabase check failed: {e}")

@app.route('/api/health')
def health_check():
    """Route for monitoring and Keep-Alive. monitor_thread must be alive."""
    try:
        return jsonify({
            "status": "healthy",
            "python": sys.version,
            "monitor_active": monitor_thread.is_alive() if 'monitor_thread' in globals() else False,
            "time": datetime.datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/alerts/recent', methods=['GET'])
@token_required
def get_alerts():
    """Fetch recent lot status alerts from the background monitor cache/database."""
    limit = int(request.args.get('limit', 10))
    alerts = get_recent_alerts(limit)
    return jsonify({
        "success": True,
        "alerts": alerts,
        "monitor_status": "alive" if 'monitor_thread' in globals() and monitor_thread.is_alive() else "down"
    })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
