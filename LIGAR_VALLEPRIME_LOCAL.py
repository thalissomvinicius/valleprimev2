import subprocess
import time
import sys
import re
import threading
import os
import requests
import signal

# Caminhos base absolutos
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(SCRIPT_DIR) # Vai para o diretorio raiz do projeto

def run_monitor_agent():
    """Inicia o agente de monitoramento de 1s (UAU -> Supabase)."""
    print("[MONITOR] Iniciando Agente de Monitoramento (Sincronização 1s)...")
    monitor_path = os.path.join(SCRIPT_DIR, "monitor_uau_supabase.py")
    
    # Rodar como processo separado para não travar o principal
    monitor_proc = subprocess.Popen(
        [sys.executable, monitor_path],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        universal_newlines=True
    )
    
    for line in iter(monitor_proc.stdout.readline, ''):
        if "[INFO]" in line or "✨" in line or "🚀" in line:
            print(f"  {line.strip()}")
    
def run_cloudflare_tunnel():
    """Cria um tunel publico usando Cloudflare Quick Tunnel (Opcional)."""
    print("[TUNEL] Verificando cloudflared.exe...")
    cf_path = os.path.join(BASE_DIR, "cloudflared.exe")
    
    if not os.path.exists(cf_path):
        print(f"[TUNEL] cloudflared.exe não encontrado em {cf_path}. Ignorando túnel público.")
        return

    print("[TUNEL] Criando canal público temporário...")
    process = subprocess.Popen(
        [cf_path, "tunnel", "--metrics", "127.0.0.1:4567", "--url", "http://127.0.0.1:8001"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    
    public_url = None
    for _ in range(15):
        time.sleep(1)
        try:
            r = requests.get("http://127.0.0.1:4567/metrics", timeout=2)
            if r.status_code == 200:
                match = re.search(r'(https://[a-zA-Z0-9-]+\.trycloudflare\.com)', r.text)
                if match:
                    public_url = match.group(1)
                    break
        except: continue
            
    if public_url:
        print("\n" + "!"*60)
        print("  SISTEMA DISPONÍVEL POUBLICAMENTE (LIVE BRIDGE)")
        print(f"  URL: {public_url}")
        print("!"*60 + "\n")
    else:
        print("[TUNEL] Não foi possível gerar URL pública. O sistema funcionará apenas via Sync Agent (Supabase).")

def main():
    print("\n" + "="*60)
    print("      VALLEPRIME V2 - CENTRAL DE SINCRONIZAÇÃO LOCAL")
    print("="*60)
    print("  Status: Migrando de Railway para Render + Supabase (Free)")
    print("  Ação: Iniciando Ponte UAU <-> Cloud 24/7\n")

    # 1. Iniciar API FastAPI (Bridge Local)
    backend_dir = os.path.join(BASE_DIR, "backend")
    server_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--app-dir", backend_dir, "--host", "127.0.0.1", "--port", "8001"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    print("[API] Servidor Bridge Local iniciado na porta 8001.")

    # 2. Iniciar Túnel (Opcional/Temporário)
    tunnel_thread = threading.Thread(target=run_cloudflare_tunnel, daemon=True)
    tunnel_thread.start()

    # 3. Iniciar Agente de Monitoramento (CORE)
    monitor_thread = threading.Thread(target=run_monitor_agent, daemon=True)
    monitor_thread.start()

    print("\n[OK] Tudo funcionando! Mantenha esta janela aberta para:")
    print("     - Monitoramento de lotes (1s)")
    print("     - Sincronização UAU -> Dashboard (Render)")
    print("     - Alertas de vendas em tempo real\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n\n[SAINDO] Encerrando processos...")
        server_process.terminate()
        # Matar cloudflared se existir
        if os.name == 'nt':
            subprocess.run(["Taskkill", "/IM", "cloudflared.exe", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("[FIM] VallePrime Local Bridge desligado.")

if __name__ == "__main__":
    main()
