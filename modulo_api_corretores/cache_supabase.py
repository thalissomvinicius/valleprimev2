"""
cache_supabase.py
Módulo para salvar e recuperar dados dos corretores no Supabase como cache offline.

ESTRATÉGIA FINAL:
  - Uma única linha por obra (como o formato original que funcionava)
  - JSON comprimido com zlib+base64 (reduz 85-90%)
  - Teste de conectividade antes de enviar
"""
import os
import json
import time
import zlib
import base64
import requests
from datetime import datetime

SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_ANON_KEY')
CACHE_TABLE = 'cache_corretores'

def _headers():
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
    }

def _compress(data):
    """Comprime JSON para base64+zlib."""
    json_str = json.dumps(data, ensure_ascii=False, default=str)
    compressed = zlib.compress(json_str.encode('utf-8'), level=9)
    return base64.b64encode(compressed).decode('ascii')

def _decompress(b64_str):
    """Descomprime de base64+zlib para objeto Python."""
    compressed = base64.b64decode(b64_str)
    json_str = zlib.decompress(compressed).decode('utf-8')
    return json.loads(json_str)

def _try_decompress(raw_str):
    """Tenta descomprimir. Se falhar, assume JSON puro (formato antigo)."""
    try:
        return _decompress(raw_str)
    except Exception:
        return json.loads(raw_str)

def testar_conexao():
    """Testa se o Supabase está acessível. Retorna True/False."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[CACHE] Supabase não configurado.")
        return False
    try:
        headers = {
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}',
        }
        # Faz um SELECT simples e rápido
        url = f"{SUPABASE_URL}/rest/v1/{CACHE_TABLE}?select=cache_key&limit=1"
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code == 200:
            print("[CACHE] ✅ Conexão com Supabase OK")
            return True
        else:
            print(f"[CACHE] ❌ Supabase respondeu com status {r.status_code}")
            return False
    except requests.exceptions.Timeout:
        print("[CACHE] ❌ Supabase não respondeu (timeout). Verifique a rede.")
        return False
    except Exception as e:
        print(f"[CACHE] ❌ Erro de conexão: {e}")
        return False

def salvar_cache(empresa: int, obra: str, mes: str, dados: list):
    """
    Salva dados comprimidos no Supabase.
    UMA ÚNICA LINHA por obra (formato original) com compressão zlib.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[CACHE] Supabase não configurado — cache ignorado.")
        return False

    cache_key = f"{empresa}-{obra}-{mes}"
    
    # Comprimir os dados
    compressed_data = _compress(dados)
    json_raw = json.dumps(dados, ensure_ascii=False, default=str)
    
    ratio = len(compressed_data) / len(json_raw) * 100 if json_raw else 0
    print(f"[CACHE] {cache_key}: JSON={len(json_raw)//1024}KB -> Comprimido={len(compressed_data)//1024}KB ({ratio:.0f}%)")
    
    payload = {
        "cache_key": cache_key,
        "empresa": empresa,
        "obra": obra,
        "mes": mes,
        "dados_json": compressed_data,
        "atualizado_em": datetime.now().isoformat()
    }

    url = f"{SUPABASE_URL}/rest/v1/{CACHE_TABLE}?on_conflict=cache_key"

    for attempt in range(1, 4):
        try:
            r = requests.post(url, headers=_headers(), json=payload, timeout=45)
            if r.status_code in (200, 201):
                print(f"[CACHE] ✅ Dados salvos para {cache_key}")
                return True
            else:
                print(f"[CACHE] Erro {r.status_code} para {cache_key}: {r.text[:150]}")
                if r.status_code in (413, 400):
                    # Payload too large - não adianta tentar de novo
                    print(f"[CACHE] Payload muito grande mesmo comprimido. Considere reduzir dados.")
                    return False
                if attempt < 3:
                    time.sleep(attempt * 3)
        except requests.exceptions.Timeout:
            wait = attempt * 5
            print(f"[CACHE] ⏱️ Timeout tentativa {attempt}/3 para {cache_key}. Esperando {wait}s...")
            time.sleep(wait)
        except Exception as e:
            print(f"[CACHE] Exceção: {e}")
            return False

    print(f"[CACHE] ❌ Falha definitiva para {cache_key}")
    return False


def buscar_cache(empresa: int, obra: str, mes: str):
    """
    Busca dados do cache. Suporta formato comprimido e JSON puro.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
    
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
    }
    
    try:
        cache_key = f"{empresa}-{obra}-{mes}"
        url = f"{SUPABASE_URL}/rest/v1/{CACHE_TABLE}?cache_key=eq.{cache_key}&select=dados_json,atualizado_em&limit=1"
        r = requests.get(url, headers=headers, timeout=15)
        if r.status_code == 200:
            rows = r.json()
            if rows:
                row = rows[0]
                return {
                    'dados': _try_decompress(row['dados_json']),
                    'atualizado_em': row['atualizado_em'],
                    'is_cache': True
                }
        return None
    except Exception as e:
        print(f"[CACHE] Exceção ao buscar: {e}")
        return None
