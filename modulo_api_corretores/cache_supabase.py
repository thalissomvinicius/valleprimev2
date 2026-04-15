"""
cache_supabase.py - Módulo de sincronização VallePrime v4.0 (Storage Bucket)

Arquitetura:
  PC Local (SQL UAU) -> array de corretores -> Supabase Storage (Bucket 'cache')
  Frontend -> Download direto da URL pública do Supabase

Por que essa arquitetura?
  O Bucket não dorme como o Render, suporta até 50MB por arquivo (limite de graça do Supabase) 
  e tira a sobrecarga da sua API / backend. Os dados ficam lá permanentemente.
"""
import os
import json
import time
import requests
from datetime import datetime

# ═══════════════════════════════════════════
# CONFIGURAÇÃO SUPABASE
# ═══════════════════════════════════════════
SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_ANON_KEY', '')
BUCKET_NAME = 'cache'

def testar_conexao():
    """Testa se a API da Supabase está acessível e se não está vazia."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[SYNC] Error: Supabase credentials missing in .env")
        return False
        
    try:
        url = f"{SUPABASE_URL}/storage/v1/bucket"
        headers = {'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'}
        r = requests.get(url, headers=headers, timeout=15)
        
        if r.status_code == 200:
            print("[SYNC] Conexao com Supabase Storage OK!")
            return True
        else:
            print(f"[SYNC] Erro de conexao com Supabase: HTTP {r.status_code}")
            return False
            
    except Exception as e:
        print(f"[SYNC] Erro de conexao com Supabase: {e}")
        return False

def salvar_cache(empresa, obra, mes, dados):
    """
    Constrói o envelope JSON e sobrescreve o arquivo no Bucket 'cache' do Supabase.
    """
    cache_key = f"{empresa}-{obra}-{mes}"
    file_name = f"{cache_key}.json"
    atualizado_em = datetime.now().isoformat()

    # O envelope completo agora é montado aqui, pois não tem mais backend Render para isso
    envelope = {
        "total_corretores": len(dados),
        "dados": dados,
        "atualizado_em": atualizado_em,
        "is_cache": False
    }

    # Transforma o JSON em bytes diretamente (sem gzip/zlib, pois o Bucket suporta o tamanho cru)
    json_bytes = json.dumps(envelope, ensure_ascii=False, default=str).encode('utf-8')
    tamanho_mb = len(json_bytes) / (1024 * 1024)
    print(f"[SYNC] {cache_key}: Array contendo {len(dados)} corretores ({tamanho_mb:.2f} MB)")

    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{file_name}"
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json'
    }

    # Tentativas de upload (Usa PUT/POST conforme disponibilidade, usaremos POST via REST API supabase storage: /storage/v1/object/{bucketName}/{wildcard})
    # O Supabase Storage REST API: 
    # Para upload inicial genérico é POST para o caminho.
    # Mas se o arquivo já existir precisa usar PUT pra sobrescrever ou passar parametro de upsert
    headers['x-upsert'] = 'true' # Forçar overwrite

    for attempt in range(1, 4):
        try:
            r = requests.post(url, headers=headers, data=json_bytes, timeout=120)
            
            # Se for 200 (Criou) ou 400 avisando que já existe com upsert true pode retornar outro status as vezes
            if r.status_code in [200, 201]:
                print(f"[SYNC] Upload OK para {file_name}")
                return True
                
            print(f"[SYNC] Upload falhou ({r.status_code}): {r.text[:200]}")
            if attempt < 3:
                time.sleep(attempt * 5)
        except requests.exceptions.Timeout:
            print(f"[SYNC] Timeout na tentativa {attempt}/3. (Uploads grandes podem demorar). Aguardando...")
            time.sleep(attempt * 5)
        except Exception as e:
            print(f"[SYNC] Excecao: {e}")
            return False

    print(f"[SYNC] Falha definitiva no upload para {cache_key}")
    return False

def buscar_cache(empresa, obra, mes):
    """
    Apenas para manter compatibilidade no backend local FastAPI, se for precisar usar.
    """
    try:
        url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{empresa}-{obra}-{mes}.json"
        r = requests.get(url, timeout=15)
        if r.status_code == 200:
            return r.json()
        return None
    except Exception:
        return None
