from flask import Flask, request, send_file
from flask_cors import CORS
import os
import datetime
import traceback
import sqlite3
import json
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from generate_proposal_reportlab import generate_pdf_reportlab

import logging

# Configure logging - Use /tmp for Vercel serverless
LOG_FILE = '/tmp/server_log.txt' if os.path.exists('/tmp') else 'server_log.txt'
logging.basicConfig(filename=LOG_FILE, level=logging.DEBUG, 
                    format='%(asctime)s %(levelname)s: %(message)s')

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# BASE DIRECTORY: API folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Database stored in /tmp for Vercel serverless or current dir locally
DB_PATH = '/tmp/clients.db' if os.path.exists('/tmp') else os.path.join(BASE_DIR, 'clients.db')

def init_db():
    """Initialize SQLite database with clients table"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            cpf_cnpj TEXT UNIQUE NOT NULL,
            data TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

# Initialize database on startup
try:
    init_db()
except Exception as e:
    logging.error(f"Database initialization error: {e}")

def format_currency(val):
    """Format value as Brazilian currency (R$ format)"""
    if not val: return "0,00"
    try:
        if isinstance(val, str):
             clean = val.replace("R$", "").strip().replace(".", "").replace(",", ".")
             val = float(clean)
        return f"{float(val):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception as e:
        logging.error(f"Error formatting currency: {e}")
        return str(val)

@app.route('/api/generate_proposal', methods=['POST'])
def generate():
    """Generate PDF proposal document"""
    try:
        req = request.json
        logging.info(f"Received proposal request")
        
        lot = req.get('lot', {})
        
        def safe_float(v):
            if not v: return 0.0
            if isinstance(v, (int, float)): return float(v)
            try:
                return float(str(v).replace("R$", "").replace(".", "").replace(",", "."))
            except:
                return 0.0

        # Extract Financials
        lot_value = safe_float(req.get('lotValue', 0))
        down_payment_total = safe_float(req.get('downPaymentTotal', 0))
        balance_total = safe_float(req.get('remainingBalance', 0))
        
        # Installment Details
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
        
        # Date Logic
        proposta_data = req.get('proposta_data', None)
        if proposta_data:
            try:
                prop_year, prop_month, prop_day = proposta_data.split('-')
                cur_day = prop_day
                cur_month = prop_month
                cur_year_full = prop_year
                cur_year_short = prop_year[2:]
            except:
                now = datetime.datetime.now()
                cur_day = now.strftime("%d")
                cur_month = now.strftime("%m")
                cur_year_full = now.strftime("%Y")
                cur_year_short = now.strftime("%y")
        else:
            now = datetime.datetime.now()
            cur_day = now.strftime("%d")
            cur_month = now.strftime("%m")
            cur_year_full = now.strftime("%Y")
            cur_year_short = now.strftime("%y")
        
        # Parse obra name
        obra_name_full = req.get('obraName', 'VALLE')
        obra_parts = obra_name_full.split(' - ')
        obra_city = obra_parts[-1] if len(obra_parts) > 1 else "ANANINDEUA"
        obra_name = obra_parts[0].replace("RESIDENCIAL ", "") if len(obra_parts) > 1 else obra_name_full
        
        # Entrada handling
        entrada_value = safe_float(req.get('entradaValue', 0))
        entrada_enabled = req.get('entradaEnabled', False)
        
        # Saldo dates
        saldo_dia = req.get('saldo_dia', cur_day)
        saldo_mes = req.get('saldo_mes', cur_month)
        saldo_ano = req.get('saldo_ano', cur_year_full)
        
        has_entrada = False
        if bool(entrada_enabled) and entrada_value > 0.01:
            has_entrada = True
        
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
            "saldo_dia": saldo_dia,
            "saldo_mes": saldo_mes,
            "saldo_ano": saldo_ano,
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
        
        exclude_keys = ['lot', 'lotValue', 'downPaymentTotal', 'downPaymentInstallments', 'remainingBalance', 'balanceInstallments', 'obraName', 'entradaValue', 'entradaEnabled']
        has_segundo = bool(req.get('has_segundo', False))
        
        for key, value in req.items():
            if key in exclude_keys:
                continue
            
            is_segundo_field = ('_segundo' in key or 'segundo' in key.lower())
            is_entrada_field = ('entrada' in key.lower())
            
            if is_segundo_field and not has_segundo:
                continue
            if is_entrada_field and not has_entrada:
                if key not in data:
                    data[key] = ""
                continue
            
            if key not in data:
                if isinstance(value, bool):
                    data[key] = value
                else:
                    data[key] = str(value) if value is not None else ""

        # PJ Mapping
        if req.get('tipo_pessoa') == 'PJ':
            data['nacionalidade_proponente'] = '-'
            if req.get('inscricao_estadual_proponente'):
                data['rg_proponente'] = str(req.get('inscricao_estadual_proponente'))
            if req.get('data_fundacao_proponente'):
                data['data_nascimento_proponente'] = str(req.get('data_fundacao_proponente'))

        skip_sinal = req.get('skipSinal', False)
        if skip_sinal:
            data["valor_sinal"] = ""
            for k in list(data.keys()):
                if 'sinal' in k.lower():
                    data[k] = ""

        if not has_entrada:
            entrada_keys_to_clear = [
                "valor_total_entrada", "entrada_qtd_parcelas", "entrada_valor_parcela",
                "entrada_dia", "entrada_mes", "entrada_ano", "entrada_periodicidade",
                "entrada_tipo_parcela"
            ]
            for k in entrada_keys_to_clear:
                data[k] = ""
            for k in list(data.keys()):
                if 'entrada' in k.lower():
                    data[k] = ""
        
        # Find assets (look in api/ first, then parent directory)
        bg_path = os.path.join(BASE_DIR, "PROPOSTA LIMPA.jpg")
        if not os.path.exists(bg_path):
            bg_path = os.path.join(os.path.dirname(BASE_DIR), "backend", "PROPOSTA LIMPA.jpg")
        
        json_path = os.path.join(BASE_DIR, "posicoes_campos.json")
        if not os.path.exists(json_path):
            json_path = os.path.join(os.path.dirname(BASE_DIR), "backend", "posicoes_campos.json")
        
        output_file = os.path.join('/tmp' if os.path.exists('/tmp') else BASE_DIR, "temp_proposal.pdf")
        
        logging.info(f"Generating PDF at: {output_file}")
        logging.info(f"Using Assets: {bg_path}, {json_path}")

        if not os.path.exists(bg_path):
             logging.error(f"IMAGE NOT FOUND: {bg_path}")
             raise Exception(f"IMAGE NOT FOUND: {bg_path}")
        if not os.path.exists(json_path):
             logging.error(f"JSON NOT FOUND: {json_path}")
             raise Exception(f"JSON NOT FOUND: {json_path}")
        
        generate_pdf_reportlab(data, bg_path, json_path, output_file)
        
        if not os.path.exists(output_file):
             logging.error("PDF generation failed (file not created).")
             raise Exception("PDF generation failed (file not created).")

        logging.info("PDF generated successfully. Sending file.")
        
        # Upsert client into database
        try:
            client_name = req.get('nome_proponente', '').strip()
            client_cpf = req.get('cpf_cnpj_proponente', '').strip()
            
            if client_name and client_cpf:
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                cursor.execute("SELECT id FROM clients WHERE cpf_cnpj = ?", (client_cpf,))
                row = cursor.fetchone()
                
                client_data_json = json.dumps(req)
                now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                
                if row:
                    cursor.execute("UPDATE clients SET nome = ?, data = ?, updated_at = ? WHERE id = ?", 
                                 (client_name, client_data_json, now_str, row[0]))
                else:
                    cursor.execute("INSERT INTO clients (nome, cpf_cnpj, data, updated_at) VALUES (?, ?, ?, ?)",
                                 (client_name, client_cpf, client_data_json, now_str))
                conn.commit()
                conn.close()
        except Exception as e:
            logging.error(f"Database error during auto-save: {e}")

        return send_file(output_file, as_attachment=True, download_name=f"Proposta_Q{str(lot.get('QD', ''))}_L{str(lot.get('LT', ''))}.pdf")

    except Exception as e:
        logging.error(f"Error: {e}\n{traceback.format_exc()}")
        return {"error": str(e)}, 500

@app.route('/api/clients', methods=['GET'])
def get_clients():
    """Get clients list with pagination and filtering"""
    try:
        search_query = request.args.get('q', '').strip()
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 50))
        offset = (page - 1) * limit

        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        where_clause = []
        params = []
        
        if search_query:
            where_clause.append("(nome LIKE ? OR cpf_cnpj LIKE ?)")
            search_param = f"%{search_query}%"
            params.extend([search_param, search_param])
            
        client_type = request.args.get('type')
        if client_type:
            if client_type == 'pf':
                where_clause.append("LENGTH(cpf_cnpj) <= 14")
            elif client_type == 'pj':
                where_clause.append("LENGTH(cpf_cnpj) > 14")

        where_sql = "WHERE " + " AND ".join(where_clause) if where_clause else ""

        count_query = f"SELECT COUNT(*) as total FROM clients {where_sql}"
        cursor.execute(count_query, params)
        total_count = cursor.fetchone()["total"]

        query = f"SELECT * FROM clients {where_sql} ORDER BY nome ASC LIMIT ? OFFSET ?"
        cursor.execute(query, params + [limit, offset])
        rows = cursor.fetchall()
        
        clients = []
        for row in rows:
            clients.append({
                "id": row["id"],
                "nome": row["nome"],
                "cpf_cnpj": row["cpf_cnpj"],
                "data": json.loads(row["data"]),
                "updated_at": row["updated_at"]
            })
        conn.close()
        return {
            "success": True, 
            "clients": clients, 
            "total_count": total_count,
            "page": page,
            "limit": limit
        }
    except Exception as e:
        logging.error(f"Error fetching clients: {e}")
        return {"success": False, "error": str(e)}, 500

def upsert_contact(cursor, data):
    """Insert or update a contact in the database"""
    name = data.get('nome_proponente', '').strip()
    if data.get('tipo_pessoa') == 'PJ' and data.get('nome_proponente'):
        name = data.get('nome_proponente').strip()
    
    cpf_cnpj = data.get('cpf_cnpj_proponente', '').strip()
    
    if not name or not cpf_cnpj:
        return False
        
    client_data_json = json.dumps(data)
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    cursor.execute("SELECT id FROM clients WHERE cpf_cnpj = ?", (cpf_cnpj,))
    row = cursor.fetchone()
    
    if row:
        cursor.execute("UPDATE clients SET nome = ?, data = ?, updated_at = ? WHERE id = ?", 
                     (name, client_data_json, now_str, row[0]))
    else:
        cursor.execute("INSERT INTO clients (nome, cpf_cnpj, data, updated_at) VALUES (?, ?, ?, ?)",
                     (name, cpf_cnpj, client_data_json, now_str))
    return True

@app.route('/api/clients/check-duplicate', methods=['GET'])
def check_duplicate():
    """Check if CPF/CNPJ already exists"""
    try:
        cpf_cnpj = request.args.get('cpf_cnpj', '').strip()
        client_id = request.args.get('client_id')
        
        if not cpf_cnpj:
            return {'exists': False, 'client': None}
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        if client_id:
            cursor.execute(
                "SELECT id, nome, cpf_cnpj FROM clients WHERE cpf_cnpj = ? AND id != ?",
                (cpf_cnpj, client_id)
            )
        else:
            cursor.execute(
                "SELECT id, nome, cpf_cnpj FROM clients WHERE cpf_cnpj = ?",
                (cpf_cnpj,)
            )
        
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return {
                'exists': True,
                'client': {
                    'id': row[0],
                    'nome_proponente': row[1],
                    'cpf_cnpj': row[2]
                }
            }
        else:
            return {'exists': False, 'client': None}
            
    except Exception as e:
        logging.error(f"Error checking duplicate: {e}")
        return {'exists': False, 'client': None, 'error': str(e)}, 500

@app.route('/api/clients', methods=['POST'])
def save_client():
    """Save or update a client"""
    try:
        req = request.json
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        salvar_vinculo = req.get('salvar_vinculo_segundo', False)
        
        if not salvar_vinculo:
            titular_data = {k: v for k, v in req.items() if '_segundo' not in k and k not in ['has_segundo', 'tipo_segundo', 'salvar_vinculo_segundo', 'sexo_seg']}
            titular_data['has_segundo'] = False
            titular_data['tipo_conjuge'] = False
            titular_data['tipo_segundo_proponente'] = False
            titular_data['tipo_procurador'] = False
            upsert_contact(cursor, titular_data)
        else:
            upsert_contact(cursor, req)
        
        has_segundo = req.get('has_segundo')
        p2_name = req.get('nome_segundo') or req.get('razao_social_segundo')
        p2_cpf_cnpj = req.get('cpf_cnpj_segundo')
        
        if has_segundo and p2_name and p2_cpf_cnpj:
            p2_data = req.copy()
            
            mapping = {
                'nome_proponente': 'nome_segundo',
                'cpf_cnpj_proponente': 'cpf_cnpj_segundo',
                'rg_proponente': 'rg_segundo',
                'orgao_emissor_proponente': 'orgao_emissor_segundo',
                'data_nascimento_proponente': 'data_nascimento_segundo',
                'sexo': 'sexo_seg',
                'naturalidade_proponente': 'naturalidade_segundo',
                'uf_naturalidade_proponente': 'uf_naturalidade_segundo',
                'nacionalidade_proponente': 'nacionalidade_segundo',
                'estado_civil_proponente': 'estado_civil_segundo',
                'regime_casamento_proponente': 'regime_casamento_segundo',
                'profissao_proponente': 'profissao_segundo',
                'local_trabalho_proponente': 'local_trabalho_segundo',
                'email_proponente': 'email_segundo',
                'fone1_ddd_proponente': 'fone1_ddd_segundo',
                'fone1_numero_proponente': 'fone1_numero_segundo',
                'fone2_ddd_proponente': 'fone2_ddd_segundo',
                'fone2_numero_proponente': 'fone2_numero_segundo',
                'fone_comercial_ddd_proponente': 'fone_comercial_ddd_segundo',
                'fone_comercial_numero_proponente': 'fone_comercial_numero_segundo',
                'endereco_residencial_proponente': 'endereco_residencial_segundo',
                'numero_endereco_proponente': 'numero_endereco_segundo',
                'bairro_proponente': 'bairro_segundo',
                'cidade_proponente': 'cidade_segundo',
                'uf_endereco_proponente': 'uf_endereco_segundo',
                'cep_proponente': 'cep_segundo',
                'tipo_pessoa': 'tipo_pessoa_segundo'
            }
            
            for p1_key, p2_key in mapping.items():
                p2_data[p1_key] = req.get(p2_key)
                p2_data[p2_key] = req.get(p1_key)
            
            p2_data['has_segundo'] = False
            p2_data['tipo_conjuge'] = False
            p2_data['tipo_segundo_proponente'] = False
            p2_data['tipo_procurador'] = False
            
            if req.get('tipo_pessoa_segundo') == 'PJ':
                p2_data['nome_proponente'] = req.get('razao_social_segundo')
            
            upsert_contact(cursor, p2_data)
        
        conn.commit()
        conn.close()
        return {"success": True}
    except Exception as e:
        logging.error(f"Error saving client: {e}")
        return {"success": False, "error": str(e)}, 500

@app.route('/api/clients/<int:client_id>', methods=['DELETE'])
def delete_client(client_id):
    """Delete a client"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM clients WHERE id = ?", (client_id,))
        conn.commit()
        conn.close()
        return {"success": True}
    except Exception as e:
        logging.error(f"Error deleting client: {e}")
        return {"success": False, "error": str(e)}, 500

@app.route('/api/consulta/<int:numprod_psc>', methods=['GET'])
def consulta(numprod_psc):
    """Availability endpoint - placeholder"""
    return {"success": True, "data": {"message": "Availability service"}}, 200

# Export app for Vercel
handler = app
