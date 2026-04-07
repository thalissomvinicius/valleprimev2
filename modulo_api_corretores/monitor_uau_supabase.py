import os
import sys
import time
import json
import logging
import sqlite3
import pandas as pd
from datetime import datetime
import requests

# Adiciona pastas ao path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.join(BASE_DIR, 'api'))
sys.path.append(os.path.join(BASE_DIR, 'modulo_api_corretores'))

from database_uau import get_db_connection

# Configurações de Monitoramento
CHECK_INTERVAL = 1.0  # Frequência de 1 segundo
CSV_LOG_FILE = os.path.join(BASE_DIR, 'alerts_history.csv')
ALERT_LOG_FILE = os.path.join(BASE_DIR, 'monitor_alerts.log')

# Configurações do Supabase (para cache/dashboard)
SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_ANON_KEY')

# Configurar Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s]: %(message)s',
    handlers=[
        logging.FileHandler(ALERT_LOG_FILE),
        logging.StreamHandler(sys.stdout)
    ]
)

def log_to_csv(alert_data):
    """Salva o alerta em um CSV para controle de comissões/histórico."""
    df = pd.DataFrame([alert_data])
    file_exists = os.path.isfile(CSV_LOG_FILE)
    df.to_csv(CSV_LOG_FILE, mode='a', index=False, header=not file_exists, encoding='utf-8-sig')

def send_alert_notification(venda_id, corretor, lote_info, novo_status):
    """
    Envia notificações (Email/Push). 
    Placeholder para integração com SMTP ou serviços de e-mail.
    """
    msg = f"🚀 ALERTA DE VENDA: Lote {lote_info} alterado para {novo_status}. Corretor: {corretor}"
    logging.info(msg)
    
    # Aqui entraria a lógica de e-mail "Premium Styled" mencionada no histórico
    # Por agora, simulamos um log de sucesso
    return True

def fetch_current_lote_status(conn):
    """Busca o status atual de todos os lotes/vendas críticas no UAU."""
    query = """
    SELECT 
        v.Num_Ven as venda_id, 
        v.Status_Ven as status,
        v.Vendedor_Ven as corretor_id,
        p.nome_pes as corretor_nome,
        u.C1_unid as quadra,
        u.C2_unid as lote,
        v.Data_Ven as data_venda
    FROM Vendas v WITH(NOLOCK)
    INNER JOIN Pessoas p WITH(NOLOCK) ON v.Vendedor_Ven = p.cod_pes
    OUTER APPLY (
        SELECT TOP 1 un.C1_unid, un.C2_unid 
        FROM ItensVenda itv WITH(NOLOCK)
        INNER JOIN UnidadePer un WITH(NOLOCK) ON itv.Empresa_itv = un.Empresa_unid AND itv.Produto_Itv = un.Prod_unid AND itv.CodPerson_Itv = un.NumPer_unid
        WHERE v.Empresa_Ven = itv.Empresa_itv AND v.Obra_Ven = itv.Obra_Itv AND v.Num_Ven = itv.NumVend_Itv
    ) u
    WHERE v.Data_Ven >= CAST(GETDATE() AS DATE) -- Monitora apenas vendas de hoje para alta frequência
    ORDER BY v.Data_Ven DESC
    """
    try:
        return pd.read_sql(query, conn)
    except Exception as e:
        logging.error(f"Erro ao buscar status no UAU: {e}")
        return pd.DataFrame()

def run_monitor():
    logging.info("Starting VallePrime high-frequency lot monitor (1.0s loop)...")
    
    known_vendas = {}  # Cache em memória para detecção de mudanças rápidas
    
    while True:
        try:
            with get_db_connection() as conn:
                df = fetch_current_lote_status(conn)
                
                if not df.empty:
                    for _, row in df.iterrows():
                        vid = row['venda_id']
                        status = row['status']
                        
                        # Detecção de nova venda ou mudança de status
                        if vid not in known_vendas:
                            # Nova venda detectada hoje!
                            known_vendas[vid] = status
                            
                            alert = {
                                "timestamp": datetime.now().isoformat(),
                                "venda_id": vid,
                                "lote": f"Q{row['quadra']} L{row['lote']}",
                                "status": status,
                                "corretor": row['corretor_nome'],
                                "tipo_alerta": "NOVA_VENDA"
                            }
                            
                            logging.info(f"✨ NOVA VENDA DETECTADA: {alert['lote']} - {alert['corretor']}")
                            log_to_csv(alert)
                            send_alert_notification(vid, row['corretor_nome'], alert['lote'], status)
                            
                        elif known_vendas[vid] != status:
                            # Mudança de status detectada
                            old_status = known_vendas[vid]
                            known_vendas[vid] = status
                            
                            alert = {
                                "timestamp": datetime.now().isoformat(),
                                "venda_id": vid,
                                "lote": f"Q{row['quadra']} L{row['lote']}",
                                "status": status,
                                "corretor": row['corretor_nome'],
                                "tipo_alerta": "MUDANÇA_STATUS",
                                "status_anterior": old_status
                            }
                            
                            logging.warning(f"🔄 MUDANÇA DE STATUS: {alert['lote']} ({old_status} -> {status})")
                            log_to_csv(alert)
                            send_alert_notification(vid, row['corretor_nome'], alert['lote'], status)

            # Sleep de 1 segundo para manter a alta frequência sem fritar a CPU
            time.sleep(CHECK_INTERVAL)
            
        except Exception as e:
            logging.error(f"Erro crítico no loop de monitoramento: {e}")
            time.sleep(5)  # Espera um pouco mais se houver erro de conexão

if __name__ == "__main__":
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("AVISO: SUPABASE não configurado. O monitor rodará apenas localmente com CSV.")
        
    try:
        run_monitor()
    except KeyboardInterrupt:
        logging.info("Monitor finalizado pelo usuário.")
