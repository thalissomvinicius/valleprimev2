"""
Script de sincronização em Segundo Plano (PUSH MODEL).
Roda no servidor/PC local que possui acesso direto ao SQL Server do UAU.
A cada 30 minutos, varre os dados das 18 obras, empacota e envia via REST API para o Supabase.
O site VallePrime vai sempre ler do Supabase, evitando quedas ou timeouts.
"""
import os
import sys
import time
import logging
from datetime import datetime, timedelta
import schedule

# Garantir que consegue importar módulos na mesma pasta
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))
except ImportError:
    pass

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

# Importar lógica já testada
try:
    from integracao_corretores import fetch_dados_corretores
    from cache_supabase import salvar_cache, testar_conexao
    from database_uau import get_db_connection
except ImportError as e:
    print(f"Erro ao importar módulos locais: {e}")
    sys.exit(1)

# Configuração de Log
LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")
if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(LOG_DIR, f"sync_{datetime.now().strftime('%Y%m')}.log"), encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Lista completa de 18 obras baseada no backend/UAU
OBRAS_COMPLETA = [
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
    {"empresa": 983,"obra": "70100", "nome": "Paragominas Uraim"},
    {"empresa": 6,  "obra": "70500", "nome": "Rondon Parque do Valle"},
    {"empresa": 29, "obra": "70100", "nome": "Valle dos Ipes Tomé-Açu"},
]

def gerar_meses_recentes(quantidade=3):
    """Gera os últimos N meses no formato YYYY-MM para enviar os históricos recentes."""
    meses = []
    hoje = datetime.now()
    for i in range(quantidade):
        data = hoje - timedelta(days=30 * i)
        meses.append(data.strftime('%Y-%m'))
    return meses

def executar_sincronizacao():
    logger.info("=" * 60)
    logger.info("INICIANDO CICLO DE SINCRONIZAÇÃO (PULL UAU -> PUSH SUPABASE)")
    logger.info("=" * 60)

    try:
        conn = get_db_connection()
        if not conn:
            logger.error("Falha ao conectar no UAU SQL Server. Tentaremos no próximo ciclo.")
            return
    except Exception as e:
        logger.error(f"Erro de conexão UAU: {e}")
        return

    # Testar conexão com Supabase antes de processar todas as obras
    if not testar_conexao():
        logger.error("Supabase inacessível. Pulando este ciclo. Tentaremos em 5 minutos.")
        try: conn.close()
        except: pass
        return

    meses = ['all']  # Trazendo o pacote completo de vendas por empreendimento, sem cortar o histórico
    sucessos = 0
    falhas = 0
    start_time = time.time()

    total_ops = len(OBRAS_COMPLETA) * len(meses)
    atual = 0

    for obra_config in OBRAS_COMPLETA:
        empresa = obra_config['empresa']
        obra = obra_config['obra']
        nome = obra_config['nome']

        logger.info(f"Processando Obra: {nome} ({empresa}-{obra})")

        for mes in meses:
            atual += 1
            try:
                # 1. PULL - SQL Server (Trará tudo ignorando as datas, pois mes='all')
                dados = fetch_dados_corretores(
                    conn=conn,
                    empresa=empresa,
                    obra=obra,
                    mes=mes
                )

                # 2. PUSH - Supabase
                if dados is None: dados = []

                if salvar_cache(empresa, obra, mes, dados):
                    sucessos += 1
                    logger.info(f"[{atual}/{total_ops}] PUSH ok | Historico COMPLETO | {len(dados)} corretores")
                else:
                    falhas += 1
                    logger.warning(f"[{atual}/{total_ops}] PUSH falhou | {mes}")

            except Exception as e:
                logger.error(f"Erro ao processar {nome}: {e}")
                falhas += 1
            
            time.sleep(0.5)

    try:
        conn.close()
    except:
        pass

    end_time = time.time()
    logger.info("=" * 60)
    logger.info(f"FIM DO CICLO | Tempo: {end_time - start_time:.1f}s | Sucessos: {sucessos} | Falhas: {falhas}")
    logger.info("=" * 60)


if __name__ == "__main__":
    logger.info("Serviço de Sincronização Iniciado.")
    logger.info("A sincronização vai rodar imediatamente e depois a cada 5 minutos.")
    
    # Executa a primeira vez logo ao abrir
    executar_sincronizacao()

    # Agenda a cada 5 minutos
    schedule.every(5).minutes.do(executar_sincronizacao)

    while True:
        schedule.run_pending()
        time.sleep(1)
