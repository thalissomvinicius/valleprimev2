"""
cache_supabase.py
Módulo para salvar e recuperar dados dos corretores.
AGORA envia diretamente para a API do Render (in-memory) em vez do Supabase.

Fluxo:
  1. Sync local comprime dados com zlib+base64
  2. POST para Render API /api/integracao/sync/push
  3. Render armazena na memória
  4. Frontend lê via GET /api/integracao/cache/corretores (mesmo endpoint de antes)
"""
import os
import json
import time
import zlib
import base64
import requests
from datetime import datetime

# URL da API Render
RENDER_API_URL = os.environ.get('RENDER_API_URL', 'https://valleprimev2.onrender.com')
SYNC_SECRET = os.environ.get('SYNC_SECRET', 'valleprime-sync-2026')

def _compress(data):
    """Comprime JSON para base64+zlib."""
    json_str = json.dumps(data, ensure_ascii=False, default=str)
    compressed = zlib.compress(json_str.encode('utf-8'), level=9)
    return base64.b64encode(compressed).decode('ascii')

def testar_conexao():
    """Testa se a API Render está acessível."""
    try:
        r = requests.get(f"{RENDER_API_URL}/api/health", timeout=15)
        if r.status_code == 200:
            print("[SYNC] ✅ Conexão com API Render OK")
            return True
        else:
            print(f"[SYNC] ⚠️ API Render respondeu com status {r.status_code}")
            # Ainda retorna True pois o servidor respondeu
            return True
    except requests.exceptions.Timeout:
        print("[SYNC] ❌ API Render não respondeu (timeout). Pode estar hibernando, tentando acordar...")
        # Tenta uma segunda vez (Render free tier pode estar dormindo)
        try:
            r = requests.get(f"{RENDER_API_URL}/api/health", timeout=30)
            if r.status_code == 200:
                print("[SYNC] ✅ API Render acordou!")
                return True
        except:
            pass
        print("[SYNC] ❌ API Render inacessível.")
        return False
    except Exception as e:
        print(f"[SYNC] ❌ Erro de conexão: {e}")
        return False

def salvar_cache(empresa: int, obra: str, mes: str, dados: list):
    """
    Envia dados comprimidos diretamente para a API do Render.
    O Render armazena na memória - zero dependência de Supabase.
    """
    cache_key = f"{empresa}-{obra}-{mes}"
    
    # Comprimir os dados
    json_raw = json.dumps(dados, ensure_ascii=False, default=str)
    compressed_data = _compress(dados)
    
    ratio = len(compressed_data) / max(len(json_raw), 1) * 100
    print(f"[SYNC] {cache_key}: JSON={len(json_raw)//1024}KB -> Comprimido={len(compressed_data)//1024}KB ({ratio:.0f}%)")
    
    payload = {
        "cache_key": cache_key,
        "dados_compressed": compressed_data,
        "atualizado_em": datetime.now().isoformat(),
        "total_corretores": len(dados)
    }

    headers = {
        'Content-Type': 'application/json',
        'X-Sync-Secret': SYNC_SECRET
    }

    url = f"{RENDER_API_URL}/api/integracao/sync/push"

    for attempt in range(1, 4):
        try:
            r = requests.post(url, headers=headers, json=payload, timeout=45)
            if r.status_code == 200:
                resp = r.json()
                print(f"[SYNC] ✅ Push OK para {cache_key} ({resp.get('corretores_count', 0)} corretores)")
                return True
            elif r.status_code == 401:
                print(f"[SYNC] ❌ Secret inválido. Verifique SYNC_SECRET.")
                return False
            else:
                print(f"[SYNC] Erro {r.status_code}: {r.text[:150]}")
                if attempt < 3:
                    time.sleep(attempt * 3)
        except requests.exceptions.Timeout:
            wait = attempt * 5
            print(f"[SYNC] ⏱️ Timeout tentativa {attempt}/3. Esperando {wait}s...")
            time.sleep(wait)
        except Exception as e:
            print(f"[SYNC] Exceção: {e}")
            return False

    print(f"[SYNC] ❌ Falha definitiva para {cache_key}")
    return False


def buscar_cache(empresa: int, obra: str, mes: str):
    """Busca dados via API Render (usado quando o FastAPI local está ativo como fallback)."""
    try:
        cache_key = f"{empresa}-{obra}-{mes}"
        url = f"{RENDER_API_URL}/api/integracao/cache/corretores?empresa={empresa}&obra={obra}&mes={mes}"
        r = requests.get(url, timeout=15)
        if r.status_code == 200:
            resp = r.json()
            return {
                'dados': resp.get('dados', []),
                'atualizado_em': resp.get('atualizado_em'),
                'is_cache': True
            }
        return None
    except Exception as e:
        print(f"[CACHE] Exceção ao buscar: {e}")
        return None
