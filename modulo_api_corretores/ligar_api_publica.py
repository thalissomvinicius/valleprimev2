import subprocess
import time
import sys
import re
import threading
import os
import requests

# Caminhos base absolutos
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(SCRIPT_DIR) # Vai para o diretorio raiz do projeto

def update_frontend_api(url):
    """Atualiza o frontend com a nova URL do tunel e faz deploy automatico."""
    print(f"\n[DEPLOY] Atualizando o frontend para usar: {url}")
    api_file = os.path.join(BASE_DIR, 'src', 'services', 'api.js')
    
    try:
        if not os.path.exists(api_file):
            print(f"[DEPLOY ERRO] Arquivo api.js nao encontrado em: {api_file}")
            return
            
        with open(api_file, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Troca qualquer URL de tunel anterior pela nova
        content = re.sub(r'https://valleprime-api-corretores\.loca\.lt', url, content)
        content = re.sub(r'https://[a-zA-Z0-9-]+\.lhr\.life', url, content)
        content = re.sub(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', url, content)
        
        with open(api_file, 'w', encoding='utf-8') as f:
            f.write(content)
            
        print("[DEPLOY] api.js atualizado!")
        
        print("[DEPLOY] Fazendo push para GitHub/Cloudflare Pages...")
        # Executa git na raiz do projeto
        subprocess.run(["git", "add", api_file], check=False, cwd=BASE_DIR)
        subprocess.run(["git", "commit", "-m", "fix: auto-update tunnel URL (cloudflare)"], check=False, cwd=BASE_DIR)
        subprocess.run(["git", "push"], check=False, cwd=BASE_DIR)
        print("[DEPLOY] Push concluido! Site atualizado em ~60s.")
        
    except Exception as e:
        print(f"[DEPLOY ERRO] {e}")

def run_cloudflare_tunnel():
    """Cria um tunel publico usando Cloudflare Quick Tunnel (gratuito, sem conta)."""
    print("[TUNEL] Criando tunel publico com Cloudflare (estavel e sem verificacao)...")
    
    # Busca cloudflared.exe na raiz do projeto
    cf_path = os.path.join(BASE_DIR, "cloudflared.exe")
    
    if not os.path.exists(cf_path):
        print(f"[TUNEL ERRO] cloudflared.exe nao encontrado em: {cf_path}")
        return

    # Inicia cloudflared e força a porta de metricas em 4567 para podermos ler a URL
    process = subprocess.Popen(
        [cf_path, "tunnel", "--metrics", "127.0.0.1:4567", "--url", "http://127.0.0.1:8001"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    
    print("[TUNEL] Aguardando o Cloudflare gerar a URL...")
    public_url = None
    
    # Tenta ler a metrica por 30 segundos
    for _ in range(30):
        time.sleep(1)
        try:
            r = requests.get("http://127.0.0.1:4567/metrics", timeout=2)
            if r.status_code == 200:
                match = re.search(r'(https://[a-zA-Z0-9-]+\.trycloudflare\.com)', r.text)
                if match:
                    public_url = match.group(1)
                    break
        except requests.exceptions.RequestException:
            continue
            
    if public_url:
        print("\n" + "="*60)
        print("  API PUBLICA NO AR VIA CLOUDFLARE TUNNEL!")
        print("="*60)
        print(f"\n  LINK DA API:  {public_url}")
        print(f"  TESTE:        {public_url}/api/integracao/corretores")
        print(f"  DOCS:         {public_url}/docs\n")
        print("="*60)
        print("  Para desligar, pressione CTRL+C\n")
        
        update_frontend_api(public_url)
    else:
        print("[TUNEL] Falha ao capturar a URL do Cloudflare. O processo morreu ou bloqueado por firewall.")

def main():
    print("="*60)
    print("  VallePrime API - Iniciando servidor local + tunel Cloudflare")
    print("="*60)
    
    # Define o diretorio do backend de forma absoluta
    backend_dir = os.path.join(BASE_DIR, "backend")
    
    server_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--app-dir", backend_dir, "--host", "127.0.0.1", "--port", "8001", "--reload"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )
    
    print("[API] Aguardando inicializacao do Uvicorn...")
    time.sleep(5)
    
    tunnel_thread = threading.Thread(target=run_cloudflare_tunnel, daemon=True)
    tunnel_thread.start()
    
    try:
        # Fica lendo logs do Uvicorn
        for line in iter(server_process.stdout.readline, ''):
            clean_line = line.strip()
            if clean_line:
                print(f"[API] {clean_line}")
    except KeyboardInterrupt:
        print("\n[FIM] Desligando API e tunel...")
        
        # Kill cloudflared explicitly
        subprocess.run(["Taskkill", "/IM", "cloudflared.exe", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        server_process.terminate()
        print("[FIM] Finalizado.")

if __name__ == "__main__":
    main()
