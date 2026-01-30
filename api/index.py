from flask import Flask, request, send_file
from flask_cors import CORS
import os
import datetime
import traceback
import sqlite3
import json
import sys

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

def get_db():
    """Helper to get database connection and ensure schema exists"""
    try:
        db_dir = os.path.dirname(DB_PATH)
        if not os.path.exists(db_dir):
            os.makedirs(db_dir, exist_ok=True)
            
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute('''
            CREATE TABLE IF NOT EXISTS clients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                cpf_cnpj TEXT UNIQUE NOT NULL,
                data TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        return conn
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
        
    return {
        "status": "ok",
        "vercel": os.environ.get('VERCEL') == '1',
        "python": sys.version,
        "base_dir": BASE_DIR,
        "db_path": DB_PATH,
        "files_in_api": os.listdir(BASE_DIR) if os.path.exists(BASE_DIR) else [],
        "reportlab": rl_info,
        "timestamp": datetime.datetime.now().isoformat()
    }, 200

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
                conn = get_db()
                existing = conn.execute("SELECT id FROM clients WHERE cpf_cnpj = ?", (cpf,)).fetchone()
                client_json = json.dumps(req)
                now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                if existing:
                    conn.execute("UPDATE clients SET nome = ?, data = ?, updated_at = ? WHERE id = ?", (name, client_json, now, existing['id']))
                else:
                    conn.execute("INSERT INTO clients (nome, cpf_cnpj, data, updated_at) VALUES (?, ?, ?, ?)", (name, cpf, client_json, now))
                conn.commit()
                conn.close()
        except:
            pass # Non-critical failure

        return send_file(output_file, as_attachment=True, download_name=f"Proposta_Q{str(lot.get('QD', ''))}_L{str(lot.get('LT', ''))}.pdf")

    except Exception as e:
        return {"error": str(e), "traceback": traceback.format_exc()}, 500

@app.route('/api/clients', methods=['GET'])
def get_clients():
    try:
        search = request.args.get('q', '').strip()
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 50))
        offset = (page - 1) * limit

        conn = get_db()
        where = ""
        params = []
        if search:
            where = "WHERE (nome LIKE ? OR cpf_cnpj LIKE ?)"
            params = [f"%{search}%", f"%{search}%"]
            
        total = conn.execute(f"SELECT COUNT(*) as total FROM clients {where}", params).fetchone()['total']
        rows = conn.execute(f"SELECT * FROM clients {where} ORDER BY nome ASC LIMIT ? OFFSET ?", params + [limit, offset]).fetchall()
        
        clients = []
        for row in rows:
            clients.append({"id": row["id"], "nome": row["nome"], "cpf_cnpj": row["cpf_cnpj"], "data": json.loads(row["data"]), "updated_at": row["updated_at"]})
        conn.close()
        return {"success": True, "clients": clients, "total_count": total, "page": page, "limit": limit}
    except Exception as e:
        return {"success": False, "error": str(e)}, 500

@app.route('/api/clients/check-duplicate', methods=['GET'])
def check_duplicate():
    try:
        cpf = request.args.get('cpf_cnpj', '').strip()
        cid = request.args.get('client_id')
        if not cpf: return {'exists': False}
        
        conn = get_db()
        if cid:
            row = conn.execute("SELECT id, nome FROM clients WHERE cpf_cnpj = ? AND id != ?", (cpf, cid)).fetchone()
        else:
            row = conn.execute("SELECT id, nome FROM clients WHERE cpf_cnpj = ?", (cpf,)).fetchone()
        conn.close()
        
        if row:
            return {'exists': True, 'client': {'id': row['id'], 'nome_proponente': row['nome']}}
        return {'exists': False}
    except Exception as e:
        return {'error': str(e)}, 500

@app.route('/api/consulta/<int:numprod_psc>', methods=['GET'])
def consulta(numprod_psc):
    return {"success": True, "data": {"message": "Availability service"}}, 200

# Vercel requires the app variable
app = app
