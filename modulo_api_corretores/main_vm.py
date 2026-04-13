"""
VallePrime API - Servidor 24/7 para VMware Horizon
Mantém API ativa com acesso direto ao banco UAU
Sincroniza cache automaticamente com Supabase
"""
import os
import sys
import time
import threading
import subprocess
import logging
from datetime import datetime
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / '.env')
except ImportError:
    pass

# Força o encoding do console para utf-8 no Windows para evitar crash com emojis
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

# Configuração de logging
LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_DIR / f"api_{datetime.now().strftime('%Y%m%d')}.log", encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

# Configurações
API_PORT = int(os.getenv('API_PORT', 8001))
CLOUDFLARE_METRICS_PORT = 4567
SCRIPT_DIR = Path(__file__).parent
CLOUDFLARED_PATH = SCRIPT_DIR.parent / "cloudflared.exe"

class APIManager:
    """Gerenciador da API FastAPI"""
    
    def __init__(self):
        self.process = None
        self.running = False
    
    def start(self):
        """Inicia o servidor FastAPI"""
        logger.info("🚀 Iniciando API FastAPI...")
        
        try:
            # Cria arquivo main.py temporário se não existir
            main_file = SCRIPT_DIR / "main_api.py"
            if not main_file.exists():
                self._create_main_api()
            
            self.process = subprocess.Popen(
                [
                    sys.executable, "-m", "uvicorn",
                    "main_api:app",
                    "--host", "0.0.0.0",
                    "--port", str(API_PORT),
                    "--log-level", "info"
                ],
                cwd=SCRIPT_DIR,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1
            )
            
            self.running = True
            logger.info(f"✅ API iniciada na porta {API_PORT}")
            
            # Thread para ler logs
            threading.Thread(target=self._read_logs, daemon=True).start()
            
        except Exception as e:
            logger.error(f"❌ Erro ao iniciar API: {e}")
            self.running = False
    
    def _create_main_api(self):
        """Cria arquivo main_api.py com a configuração da API"""
        content = '''"""API FastAPI para integração de corretores"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from integracao_corretores import router as corretores_router

app = FastAPI(
    title="VallePrime API - Corretores",
    description="API de integração com banco UAU para dados de corretores",
    version="2.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rotas
app.include_router(corretores_router, prefix="/api/integracao")

@app.get("/health")
async def health_check():
    """Health check da API"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "service": "valleprime-api"
    }

@app.get("/")
async def root():
    """Rota raiz"""
    return {
        "message": "VallePrime API - Corretores",
        "docs": "/docs",
        "health": "/health"
    }

from datetime import datetime
'''
        main_file = SCRIPT_DIR / "main_api.py"
        main_file.write_text(content, encoding='utf-8')
        logger.info("📝 Arquivo main_api.py criado")
    
    def _read_logs(self):
        """Lê e registra logs da API"""
        if not self.process:
            return
        
        for line in iter(self.process.stdout.readline, ''):
            if line.strip():
                logger.info(f"[API] {line.strip()}")
    
    def stop(self):
        """Para o servidor"""
        if self.process:
            logger.info("🛑 Parando API...")
            self.process.terminate()
            self.process.wait(timeout=5)
            self.running = False
            logger.info("✅ API parada")

class TunnelManager:
    """Gerenciador do Cloudflare Tunnel"""
    
    def __init__(self):
        self.process = None
        self.url = None
        self.running = False
    
    def start(self):
        """Inicia o túnel Cloudflare"""
        if not CLOUDFLARED_PATH.exists():
            logger.warning(f"⚠️  cloudflared.exe não encontrado em {CLOUDFLARED_PATH}")
            logger.warning("⚠️  Túnel não será iniciado. API acessível apenas localmente.")
            return
        
        logger.info("🌐 Iniciando Cloudflare Tunnel...")
        
        try:
            self.process = subprocess.Popen(
                [
                    str(CLOUDFLARED_PATH),
                    "tunnel",
                    "--metrics", f"127.0.0.1:{CLOUDFLARE_METRICS_PORT}",
                    "--url", f"http://127.0.0.1:{API_PORT}"
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            
            # Aguarda URL ser gerada
            time.sleep(3)
            self.url = self._get_tunnel_url()
            
            if self.url:
                self.running = True
                logger.info(f"✅ Túnel ativo: {self.url}")
                logger.info(f"📡 Endpoint: {self.url}/api/integracao/corretores")
            else:
                logger.warning("⚠️  Não foi possível obter URL do túnel")
                
        except Exception as e:
            logger.error(f"❌ Erro ao iniciar túnel: {e}")
    
    def _get_tunnel_url(self):
        """Obtém a URL do túnel via métricas"""
        import requests
        import re
        
        for _ in range(10):
            try:
                r = requests.get(f"http://127.0.0.1:{CLOUDFLARE_METRICS_PORT}/metrics", timeout=2)
                if r.status_code == 200:
                    match = re.search(r'(https://[a-zA-Z0-9-]+\.trycloudflare\.com)', r.text)
                    if match:
                        return match.group(1)
            except:
                pass
            time.sleep(1)
        return None
    
    def stop(self):
        """Para o túnel"""
        if self.process:
            logger.info("🛑 Parando túnel...")
            self.process.terminate()
            self.running = False
            logger.info("✅ Túnel parado")

class CacheMonitor:
    """Monitor de sincronização com Supabase"""
    
    def __init__(self):
        self.running = False
        self.thread = None
    
    def start(self):
        """Inicia monitoramento"""
        logger.info("📊 Iniciando monitor de cache...")
        self.running = True
        self.thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.thread.start()
        logger.info("✅ Monitor de cache ativo")
    
    def _monitor_loop(self):
        """Loop de monitoramento"""
        from pre_carregar_cache import pre_carregar_tudo
        
        while self.running:
            try:
                logger.info("🔄 Atualizando cache no Supabase...")
                pre_carregar_tudo()
                logger.info("✅ Cache atualizado com sucesso")
            except Exception as e:
                logger.error(f"❌ Erro ao atualizar cache: {e}")
            
            # Aguarda 1 hora (3600 segundos)
            for _ in range(3600):
                if not self.running:
                    break
                time.sleep(1)
    
    def stop(self):
        """Para o monitor"""
        logger.info("🛑 Parando monitor de cache...")
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        logger.info("✅ Monitor parado")

class SystemManager:
    """Gerenciador geral do sistema"""
    
    def __init__(self):
        self.api = APIManager()
        self.tunnel = TunnelManager()
        self.cache = CacheMonitor()
        self.running = False
    
    def start(self):
        """Inicia todos os componentes"""
        logger.info("="*60)
        logger.info("  VALLEPRIME API 24/7 - VMware Horizon")
        logger.info("="*60)
        logger.info(f"  Data/Hora: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
        logger.info(f"  Ambiente: {os.getenv('AMBIENTE', 'desenvolvimento')}")
        logger.info("="*60)
        
        try:
            # 1. Inicia API
            self.api.start()
            time.sleep(3)
            
            # 2. Inicia Túnel
            self.tunnel.start()
            time.sleep(2)
            
            # 3. Inicia Monitor de Cache
            self.cache.start()
            
            self.running = True
            
            logger.info("="*60)
            logger.info("  ✅ SISTEMA INICIADO COM SUCESSO!")
            logger.info("="*60)
            logger.info(f"  API Local: http://localhost:{API_PORT}")
            if self.tunnel.url:
                logger.info(f"  API Pública: {self.tunnel.url}")
            logger.info(f"  Docs: http://localhost:{API_PORT}/docs")
            logger.info(f"  Health: http://localhost:{API_PORT}/health")
            logger.info("="*60)
            logger.info("  Sistema rodando 24/7. Pressione Ctrl+C para parar.")
            logger.info("="*60)
            
        except Exception as e:
            logger.error(f"❌ Erro ao iniciar sistema: {e}")
            self.stop()
    
    def stop(self):
        """Para todos os componentes"""
        logger.info("\n🛑 Encerrando sistema...")
        self.running = False
        
        self.cache.stop()
        self.tunnel.stop()
        self.api.stop()
        
        logger.info("✅ Sistema encerrado")
    
    def run(self):
        """Executa o sistema"""
        self.start()
        
        try:
            # Mantém o processo vivo
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            logger.info("\n⚠️  Interrupção detectada (Ctrl+C)")
        finally:
            self.stop()

def main():
    """Função principal"""
    manager = SystemManager()
    manager.run()

if __name__ == "__main__":
    main()
