import subprocess
import time
import sys
import re
import threading

def run_localtunnel():
    print("🌐 Criando o Túnel Público com Localtunnel (bypass de firewall)...")
    
    # Inicia o Localtunnel usando Node.js com um subdomínio fixo
    lt_process = subprocess.Popen(
        ["npx", "--yes", "localtunnel", "--port", "8001", "--subdomain", "valleprime-api-corretores"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        shell=True
    )
    
    url_found = False
    
    # Lê as linhas do localtunnel até achar a URL gerada
    for line in iter(lt_process.stdout.readline, ''):
        line = line.strip()
        if "your url is:" in line.lower():
            # Extrai o link mágico
            match = re.search(r'(https://[^\s]+)', line)
            if match:
                public_url = match.group(1)
                
                print("\n" + "="*60)
                print("✅ SUCESSO! SUA API ESTÁ NO AR PELO LOCALTUNNEL!")
                print("="*60)
                print(f"\n🌍 LINK DA API BASE:   {public_url}")
                print(f"📖 PAGINA VISUAL:      {public_url}/docs")
                print("\n🔹 Link Direto de Exemplo (JSON API Integracao):")
                print(f"👉 {public_url}/api/integracao/corretores\n")
                print("="*60)
                print("Para desligar a API e apagar o link da internet, pressione CTRL+C")
                url_found = True
        elif not url_found and line:
            print(f"[LT Log] {line}")

def main():
    print("🚀 Iniciando a VallePrime API Localmente na porta 8000...")
    
    server_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--app-dir", "backend", "--host", "127.0.0.1", "--port", "8001", "--reload"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )
    
    print("⏳ Aguardando a inicialização do Servidor SQL e API...")
    time.sleep(4)
    
    # Chama o localtunnel em uma thread ou bloqueando para manter vivo
    tunnel_thread = threading.Thread(target=run_localtunnel, daemon=True)
    tunnel_thread.start()
    
    try:
        # Loop para manter a command line lendo os logs do Uvicorn e ficar vivo
        for line in iter(server_process.stdout.readline, ''):
            clean_line = line.strip()
            if clean_line:
                print(f"[API Logs] {clean_line}")
                
    except KeyboardInterrupt:
        print("\n⛔ Desligando a API e o Túnel...")
        server_process.terminate()
        print("Finalizado com segurança.")

if __name__ == "__main__":
    main()
