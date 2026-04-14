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
import zlib
import base64

def _try_decompress_cache(raw_str):
    """Tenta descomprimir base64+zlib. Se falhar, assume JSON puro (formato antigo)."""
    try:
        compressed = base64.b64decode(raw_str)
        json_str = zlib.decompress(compressed).decode('utf-8')
        return json.loads(json_str)
    except Exception:
        return json.loads(raw_str)

# Importar gerador de PDF
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from generate_proposal_reportlab import generate_pdf_reportlab
except ImportError as e:
    print(f"[WARN] Could not import generate_pdf_reportlab: {e}")
    generate_pdf_reportlab = None

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=False)

# Explicit OPTIONS handler for every route (CORS preflight)
@app.route('/', defaults={'path': ''}, methods=['OPTIONS'])
@app.route('/<path:path>', methods=['OPTIONS'])
def options_handler(path):
    """Handle all CORS preflight requests explicitly."""
    response = app.make_default_options_response()
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Max-Age'] = '3600'
    return response

@app.after_request
def after_request_func(response):
    """Inject CORS headers into EVERY response (including errors)."""
    origin = request.headers.get('Origin', '*')
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

@app.errorhandler(Exception)
def handle_exception(e):
    """Captura qualquer erro interno e retorna JSON + CORS para não quebrar o navegador."""
    error_msg = str(e)
    if hasattr(e, 'description'): error_msg = e.description
    print(f"[FATAL_ERR] {error_msg}")
    return jsonify({
        "success": False,
        "message": "Erro interno do servidor",
        "error": error_msg,
        "type": type(e).__name__
    }), 500

@app.route('/api/health', methods=['GET'])
def api_health():
    return jsonify({"status": "ok", "timestamp": datetime.datetime.now().isoformat()})

SECRET_KEY = os.environ.get('SECRET_KEY', 'dev_secret_key_valle_prime_v2')

# Supabase is the sole data source (late import helper)
def get_db():
    import database
    return database

# Late-binding database function proxies
def get_user_by_id(*args, **kwargs): return get_db().get_user_by_id(*args, **kwargs)
def get_user_by_username(*args, **kwargs): return get_db().get_user_by_username(*args, **kwargs)
def get_all_users(*args, **kwargs): return get_db().get_all_users(*args, **kwargs)
def create_user(*args, **kwargs): return get_db().create_user(*args, **kwargs)
def update_user(*args, **kwargs): return get_db().update_user(*args, **kwargs)
def delete_user(*args, **kwargs): return get_db().delete_user(*args, **kwargs)
def count_users(*args, **kwargs): return get_db().count_users(*args, **kwargs)
def get_clients(*args, **kwargs): return get_db().get_clients(*args, **kwargs)
def _db_check_duplicate_client(*args, **kwargs): return get_db().check_duplicate_client(*args, **kwargs)
def get_client_by_id(*args, **kwargs): return get_db().get_client_by_id(*args, **kwargs)
def create_client(*args, **kwargs): return get_db().create_client(*args, **kwargs)
def update_client(*args, **kwargs): return get_db().update_client(*args, **kwargs)
def _db_delete_client(*args, **kwargs): return get_db().delete_client(*args, **kwargs)
def count_clients(*args, **kwargs): return get_db().count_clients(*args, **kwargs)
def get_recent_clients(*args, **kwargs): return get_db().get_recent_clients(*args, **kwargs)
def get_proposals(*args, **kwargs): return get_db().get_proposals(*args, **kwargs)
def get_proposal_by_id(*args, **kwargs): return get_db().get_proposal_by_id(*args, **kwargs)
def count_proposals(*args, **kwargs): return get_db().count_proposals(*args, **kwargs)
def create_proposal(*args, **kwargs): return get_db().create_proposal(*args, **kwargs)
def update_proposal(*args, **kwargs): return get_db().update_proposal(*args, **kwargs)
def delete_proposal(*args, **kwargs): return get_db().delete_proposal(*args, **kwargs)
def create_alert(*args, **kwargs): return get_db().create_alert(*args, **kwargs)
def get_recent_alerts(*args, **kwargs): return get_db().get_recent_alerts(*args, **kwargs)

from use_cases.auth_logic import AuthUseCase
from use_cases.proposal_logic import ProposalUseCase
from use_cases.client_logic import ClientUseCase
from background_tasks import start_monitor_thread

auth_service = AuthUseCase(SECRET_KEY)
hash_password = auth_service.hash_password
verify_password = auth_service.verify_password

proposal_service = ProposalUseCase()
client_service = ClientUseCase()

# Global config for monitor
OBRA_CODES = ['600', '601', '602', '603', '604', '605', '610', '616', '618', '620', '621', '623', '624', '625'] 
monitor_thread = start_monitor_thread(OBRA_CODES, get_recent_alerts, create_alert)


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
            data = auth_service.verify_token(token)
            request.user_id = data['user_id']
            request.user_role = data.get('role')
        except ValueError as e:
            return jsonify({'message': str(e)}), 401
        return f(*args, **kwargs)
    return decorated

@app.route('/')
def index():
    return jsonify({
        "status": "online",
        "message": "VallePrime API 2.0 (Stable)",
        "docs": "/api/health"
    })

@app.route('/api/hello')
def hello():
    # v8.6 Full REST mapping with DELETE support
    return jsonify({"status": "ok", "message": "Full system restored (v8.6-master-sync)", "time": datetime.datetime.now().isoformat()})

def check_supabase_connection():
    """Verify Supabase connectivity and ensure default admin exists"""
    try:
        from database import SupabaseConfig
        if not SupabaseConfig.URL or not SupabaseConfig.KEY:
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
        from database import SupabaseConfig
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
                "active": bool(SupabaseConfig.URL and SupabaseConfig.KEY),
                "url": SupabaseConfig.URL
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
        payload = auth_service.verify_token(token)
        return payload.get('user_id'), payload.get('role')
    except:
        return None, None

extract_proposal_meta = proposal_service.extract_proposal_meta

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
    
    try:
        result = auth_service.execute_login(
            username=username,
            password=password,
            get_user_fn=get_user_by_username,
            count_users_fn=count_users,
            create_user_fn=create_user
        )
        return jsonify(result)
    except ValueError as e:
        return jsonify({'message': str(e)}), 401
    except Exception as e:
        print(f"[LOGIN_GET ERROR] {e}")
        return jsonify({'message': 'Internal Login Error', 'error': str(e)}), 500

# ROTA ALTERNATIVA - para contornar problema de roteamento
@app.route('/api/login', methods=['POST'])
def login_alt():
    return login()

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    try:
        result = auth_service.execute_login(
            username=username,
            password=password,
            get_user_fn=get_user_by_username,
            count_users_fn=count_users,
            create_user_fn=create_user
        )
        return jsonify(result)
    except ValueError as e:
        return jsonify({'message': str(e)}), 401
    except Exception as e:
        print(f"[LOGIN ERROR] {e}")
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
        base_dir = os.path.dirname(os.path.abspath(__file__))

        # --- PRIORIDADE 1: Fallback local (instantâneo) ---
        fallback_path = os.path.join(base_dir, f'fallback_{numprod_psc}.json')
        if os.path.exists(fallback_path):
            try:
                with open(fallback_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    payload = enrich_payload(data)
                    if isinstance(payload, dict):
                        payload["success"] = True
                        payload["_cached"] = True
                        payload["_source"] = "local_fallback"
                    print(f"[CONSULTA] Serving fallback for obra {numprod_psc}")
                    return jsonify(payload)
            except Exception as fb_err:
                print(f"[WARN] Fallback load failed: {fb_err}")

        # --- PRIORIDADE 2: Servidor externo (falha rápida em 3s) ---
        connect_timeout = float(os.environ.get('CONSULTA_CONNECT_TIMEOUT', '3'))
        read_timeout = float(os.environ.get('CONSULTA_READ_TIMEOUT', '8'))
        retries = int(os.environ.get('CONSULTA_RETRIES', '1'))
        last_error = None

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
        }

        for attempt in range(retries + 1):
            try:
                # Usar o proxy Vercel antigo do cliente que ignora o bloqueio do IP local
                resp = requests.get(
                    f"https://valleprime.vercel.app/api/consulta/{numprod_psc}/",
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
            time.sleep(0.5 * (attempt + 1))

        # --- SEM FALLBACK E SEM SERVIDOR ---
        print(f"[CONSULTA] Obra {numprod_psc} indisponível: {last_error}")
        return jsonify({
            "success": False,
            "data": [],
            "error": f"Consulta indisponível para obra {numprod_psc}. Servidor externo offline e sem cache local.",
            "_last_error": str(last_error)
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
        client_type = request.args.get('type', 'PF').upper()
        created_by = request.args.get('created_by')
        
        clients = client_service.fetch_clients(
            user_id=request.user_id,
            user_role=request.user_role,
            client_type=client_type,
            requested_created_by=created_by,
            get_user_fn=get_user_by_id,
            get_clients_fn=get_clients
        )
        
        return jsonify({
            "success": True,
            "clients": clients or [],
            "total_count": len(clients) if clients else 0
        })

    if request.method == 'POST':
        try:
            data = request.get_json()
            result = client_service.save_client(
                user_id=request.user_id,
                user_role=request.user_role,
                data=data,
                get_user_fn=get_user_by_id,
                get_client_by_id_fn=get_client_by_id,
                get_clients_fn=get_clients,
                create_client_fn=create_client,
                update_client_fn=update_client
            )
            return jsonify(result)

        except (ValueError, KeyError) as e:
            return jsonify({'success': False, 'error': str(e)}), 400
        except PermissionError as e:
            return jsonify({'success': False, 'error': str(e)}), 403
        except Exception as e:
            print(f"[ERROR] manage_clients POST: {str(e)}")
            return jsonify({'success': False, 'error': 'Internal server error'}), 500


@app.route('/api/clients/<int:client_id>', methods=['DELETE'])
@app.route('/api/manage-clients/<int:client_id>', methods=['DELETE'])
@token_required
def delete_client_route(client_id):
    """Delete a client by ID"""
    try:
        success = client_service.delete_client(
            client_id=client_id,
            user_id=request.user_id,
            user_role=request.user_role,
            get_user_fn=get_user_by_id,
            delete_client_fn=_db_delete_client
        )
        
        if success:
            return jsonify({'success': True, 'message': 'Cliente excluído com sucesso'})
        else:
            return jsonify({'success': False, 'error': 'Cliente não encontrado ou sem permissão'}), 404
            
    except Exception as e:
        print(f"[ERROR] delete_client: {str(e)}")
        return jsonify({'success': False, 'error': 'Internal server error'}), 500


@app.route('/api/clients/check-duplicate', methods=['GET'])
@app.route('/api/manage-clients/check-duplicate', methods=['GET'])
@token_required
def check_duplicate_route():
    """Check if CPF/CNPJ already exists"""
    try:
        cpf_cnpj = request.args.get('cpf_cnpj', '').strip()
        tipo_pessoa = request.args.get('tipo_pessoa', 'PF')
        client_id_raw = request.args.get('client_id')
        
        if not cpf_cnpj:
            return jsonify({'exists': False})
        
        client_id = None
        if client_id_raw:
            import re
            match = re.search(r'\d+', str(client_id_raw))
            if match:
                client_id = int(match.group())
        
        existing = _db_check_duplicate_client(cpf_cnpj, client_id)
        
        if existing:
            return jsonify({'exists': True, 'client_name': existing['nome'], 'client_id': existing['id']})
        
        return jsonify({'exists': False})
        
    except Exception as e:
        print(f"[ERROR] check_duplicate_route: {str(e)}")
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
    """Generate PDF proposal from client and lot data via Clean UseCase"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        print(f"[DEBUG] Generating proposal with data keys: {list(data.keys())}")
        user_id, _ = get_optional_user_from_token()
        
        base_dir = os.path.dirname(os.path.abspath(__file__))
        positions_path = os.path.join(base_dir, 'posicoes_campos.json')
        background_path = os.path.join(base_dir, 'PROPOSTA LIMPA.jpg')
        output_path = os.path.join(base_dir, 'proposta_output.pdf')
        
        # Dependency Injection wrapper
        def store_fn(payload, uid):
            store_proposal(payload, uid)
            
        proposal_service.process_and_generate_proposal(
            data=data,
            user_id=user_id,
            store_proposal_fn=store_fn,
            generate_pdf_fn=generate_pdf_reportlab,
            background_path=background_path,
            positions_path=positions_path,
            output_path=output_path
        )
        
        return send_file(
            output_path,
            mimetype='application/pdf',
            as_attachment=False,
            download_name='proposta.pdf'
        )
        
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 500
    except Exception as e:
        print(f"[ERROR] generate_proposal: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# --- BROKER PERFORMANCE INTEGRATION ---


# --- BACKGROUND MONITORING (1s Frequency) ---

# Background monitor is started from background_tasks.py above.
# The monitor thread uses get_recent_alerts and create_alert passed as dependency logic.


# --- STARTUP CHECK ---
try:
    print("[STARTUP] Checking Supabase connectivity...")
    check_supabase_connection()
except Exception as e:
    print(f"[STARTUP] Supabase check failed: {e}")

# --- FINAL ROUTES (SINGLE DEFINITIONS ONLY) ---

@app.route('/api/health')
def health_check():
    """Route for monitoring and Keep-Alive. monitor_thread must be alive."""
    try:
        is_alive = monitor_thread.is_alive() if 'monitor_thread' in globals() else False
    except:
        is_alive = False
        
    return jsonify({
        "status": "healthy",
        "python": sys.version,
        "monitor_active": is_alive,
        "time": datetime.datetime.now().isoformat()
    })

@app.route('/api/alerts/recent', methods=['GET'])
@token_required
def get_alerts():
    """Fetch recent lot status alerts from the background monitor cache/database."""
    limit = int(request.args.get('limit', 10))
    try:
        alerts = get_recent_alerts(limit)
    except:
        alerts = []
        
    return jsonify({
        "success": True,
        "alerts": alerts,
        "monitor_status": "alive" if 'monitor_thread' in globals() and monitor_thread.is_alive() else "down"
    })

# ===========================
# INTEGRAÇÃO CORRETORES CACHE (IN-MEMORY)
# ===========================
# Armazena os dados na memória do Render. O sync local faz POST diretamente aqui.
# Sem Supabase, sem limites, sem timeout. Auto-recupera a cada 5min via sync.
# Usa o sistema de arquivos /tmp para compartilhar dados entre multi-workers Gunicorn.

SYNC_SECRET = os.environ.get('SYNC_SECRET', 'valleprime-sync-2026')

@app.route('/api/integracao/sync/push', methods=['POST'])
def push_cache_corretores():
    """
    Recebe dados comprimidos (zlib+base64) do sync local e armazena em memória.
    Protegido por um secret simples no header.
    """
    try:
        auth = request.headers.get('X-Sync-Secret', '')
        if auth != SYNC_SECRET:
            return jsonify({"error": "Não autorizado"}), 401

        body = request.get_json(force=True)
        cache_key = body.get('cache_key', '')
        dados_compressed = body.get('dados_compressed', '')
        atualizado_em = body.get('atualizado_em', '')

        if not cache_key or not dados_compressed:
            return jsonify({"error": "cache_key e dados_compressed são obrigatórios"}), 400

        # O Render roda com múltiplos "workers" (processos independentes). Se usarmos
        # memória RAM simples, o Worker A não enxerga os dados do Worker B.
        # A solução perfeita e grau: salvar no diretório temporário compartilhado pelo Render (/tmp)
        total_corretores = body.get('total_corretores', 0)
        
        file_path = f"/tmp/cache_corretores_{cache_key}.json"
        
        cache_data = {
            "dados_compressed": dados_compressed,
            "atualizado_em": atualizado_em
        }
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(cache_data, f)

        return jsonify({
            "success": True,
            "cache_key": cache_key,
            "corretores_count": total_corretores
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/integracao/cache/corretores', methods=['GET'])
def get_cache_corretores():
    """
    Lê da memória do Render. Fallback para Supabase se memória estiver vazia.
    """
    try:
        empresa = request.args.get('empresa', '28')
        obra = request.args.get('obra', '70100')
        mes = request.args.get('mes', 'all')
        corretor_id = request.args.get('corretor_id', None)
        cache_key = f"{empresa}-{obra}-{mes}"

        dados = []
        atualizado_em = None

        # 1. Lê do arquivo temporário (principal e compartilhado entre os workers)
        file_path = f"/tmp/cache_corretores_{cache_key}.json"
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    cached = json.load(f)
                
                # Descomprime sob demanda
                if 'dados_compressed' in cached:
                    dados = _try_decompress_cache(cached['dados_compressed'])
                elif 'dados' in cached:
                    dados = cached['dados']
                atualizado_em = cached.get('atualizado_em')
            except Exception as e:
                print(f"[CACHE ERR] Falha ao ler {file_path}: {e}")
                pass

        # 2. Fallback: Supabase (para dados antigos enquanto sync não roda)
        if not dados:
            supabase_url = os.environ.get('SUPABASE_URL', '').rstrip('/')
            supabase_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_ANON_KEY', '')
            if supabase_url and supabase_key:
                try:
                    headers_sb = {
                        'apikey': supabase_key,
                        'Authorization': f'Bearer {supabase_key}',
                    }
                    url = f"{supabase_url}/rest/v1/cache_corretores?cache_key=eq.{cache_key}&select=dados_json,atualizado_em&limit=1"
                    r = requests.get(url, headers=headers_sb, timeout=8)
                    if r.status_code == 200:
                        rows = r.json()
                        if rows:
                            dados = _try_decompress_cache(rows[0]['dados_json'])
                            atualizado_em = rows[0]['atualizado_em']
                except Exception:
                    pass  # Supabase indisponível, ignora

        if not dados:
            return jsonify({
                "success": False,
                "error": f"Nenhum cache para {cache_key}. Ligue o script local para sincronizar."
            }), 404

        # Filtra por corretor_id se especificado (para usuários não-admin)
        if corretor_id:
            try:
                corretor_id_int = int(corretor_id)
                dados = [d for d in dados if d.get('codigo_corretor') == corretor_id_int]
            except (ValueError, TypeError):
                pass

        return jsonify({
            "total_corretores": len(dados),
            "dados": dados,
            "atualizado_em": atualizado_em,
            "is_cache": False
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/integracao/config/obras', methods=['GET'])
def get_config_obras():
    """Retorna APENAS as obras que têm cache salvo no Supabase."""
    # Lista completa de 18 obras sincronizadas
    obras = [
        {"empresa": 13, "obra": "70100", "nome": "Dom Eliseu"},
        {"empresa": 12, "obra": "70100", "nome": "Capanema (Jardim America)"},
        {"empresa": 12, "obra": "70101", "nome": "Capanema II"},
        {"empresa": 9,  "obra": "70100", "nome": "Salles Jardim I"},
        {"empresa": 9,  "obra": "70101", "nome": "Salles Jardim II"},
        {"empresa": 9,  "obra": "70102", "nome": "Salles Jardim III"},
        {"empresa": 9,  "obra": "70103", "nome": "Salles Jardim IV"},
        {"empresa": 6,  "obra": "70100", "nome": "Jardim Castanhal I"},
        {"empresa": 6,  "obra": "70101", "nome": "Jardim Castanhal II"},
        {"empresa": 24, "obra": "70100", "nome": "Jardim Castanhal III"},
        {"empresa": 6,  "obra": "70400", "nome": "Valle do Ipitinga"},
        {"empresa": 28, "obra": "70100", "nome": "Valle do Ipitinga II"},
        {"empresa": 6,  "obra": "70300", "nome": "Tailandia I"},
        {"empresa": 22, "obra": "70100", "nome": "Tailandia II"},
        {"empresa": 15, "obra": "70100", "nome": "Barcarena"},
        {"empresa": 983, "obra": "70100", "nome": "Paragominas Uraim"},
        {"empresa": 6,  "obra": "70500", "nome": "Rondon Parque do Valle"},
        {"empresa": 29, "obra": "70100", "nome": "Valle dos Ipes Tomé-Açu"}
    ]
    return jsonify({"total": len(obras), "obras": obras, "is_cache": False})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
