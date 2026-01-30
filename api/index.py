from flask import Flask, request, send_file
from flask_cors import CORS
import os
import datetime
import traceback
import sqlite3
import json
import sys
import requests

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
        try:
            import pg8000.dbapi
            # Parse URL (minimal)
            import urllib.parse
            import ssl
            u = urllib.parse.urlparse(db_url)
            ssl_context = ssl.create_default_context()
            # Create connection with DBAPI
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
            print(f"POSTGRES CONNECTION ERROR: {e}")
            pass
            
    # Fallback/Local SQLite
    # Ensure directory exists for SQLite
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
            cpf_cnpj TEXT UNIQUE NOT NULL,
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
                cpf_cnpj TEXT UNIQUE NOT NULL,
    except Exception as e:
        print(f"DATABASE ERROR: {e}")
        raise e

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
            if name and cpf:
                existing = query_db("SELECT id FROM clients WHERE cpf_cnpj = ?", (cpf,), one=True)
                client_json = json.dumps(req)
                now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                if existing:
                    query_db("UPDATE clients SET nome = ?, data = ?, updated_at = ? WHERE id = ?", (name, client_json, now, existing['id']), commit=True)
                else:
                    query_db("INSERT INTO clients (nome, cpf_cnpj, data, updated_at) VALUES (?, ?, ?, ?)", (name, cpf, client_json, now), commit=True)
        except Exception as e:
            print(f"AUTO-SAVE ERROR: {e}")


        return send_file(output_file, as_attachment=True, download_name=f"Proposta_Q{str(lot.get('QD', ''))}_L{str(lot.get('LT', ''))}.pdf")

    except Exception as e:
        return {"error": str(e), "traceback": traceback.format_exc()}, 500

# Old get_clients replaced by centralized clients() route

@app.route('/api/clients/check-duplicate', methods=['GET'])
def check_duplicate():
    try:
        cpf = request.args.get('cpf_cnpj', '').strip()
        cid = request.args.get('client_id')
        if not cpf: return {'exists': False}
        
        if cid:
            row = query_db("SELECT id, nome FROM clients WHERE cpf_cnpj = ? AND id != ?", (cpf, cid), one=True)
        else:
            row = query_db("SELECT id, nome FROM clients WHERE cpf_cnpj = ?", (cpf,), one=True)
        
        if row:
            return {'exists': True, 'client': {'id': row['id'], 'nome_proponente': row['nome']}}
        return {'exists': False}
    except Exception as e:
        return {'error': str(e)}, 500

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


@app.route('/api/clients', methods=['GET', 'POST'])
def clients():
    try:
        if request.method == 'GET':
            rows = query_db("SELECT * FROM clients ORDER BY updated_at DESC")
            # Handle list output from query_db which returns dicts directly
            clients_list = rows if rows else []
            # We don't need to convert row objects since query_db returns dicts
            return {"clients": clients_list}, 200
            
        if request.method == 'POST':
            req = request.json
            name = req.get('nome', '')
            cpf = req.get('cpf_cnpj', '')
            data_json = json.dumps(req.get('data', {}))
            now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            if not name or not cpf:
                return {"error": "Name and CPF required"}, 400
                
            existing = query_db("SELECT id FROM clients WHERE cpf_cnpj = ?", (cpf,), one=True)
            
            if existing:
                query_db("UPDATE clients SET nome = ?, data = ?, updated_at = ? WHERE id = ?", (name, data_json, now, existing['id']), commit=True)
            else:
                query_db("INSERT INTO clients (nome, cpf_cnpj, data, updated_at) VALUES (?, ?, ?, ?)", (name, cpf, data_json, now), commit=True)
                
            return {"success": True}, 200
            
    except Exception as e:
        return {"error": str(e)}, 500

# Vercel requires the app variable
app = app

# Trigger Deploy: DB Switch
