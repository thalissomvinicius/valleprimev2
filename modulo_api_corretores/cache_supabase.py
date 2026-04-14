"""
cache_supabase.py
Módulo para salvar e recuperar dados dos corretores no Supabase como cache offline.

ESTRATÉGIA:
  - Comprime o JSON com zlib (reduz ~85-90% do tamanho)
  - Codifica em base64 para armazenar como texto no Supabase
  - Cada corretor é salvo individualmente para manter payloads pequenos
  - Na leitura, busca pelo prefixo e descomprime
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
    """Comprime dados para JSON compactado em base64."""
    json_str = json.dumps(data, ensure_ascii=False, default=str)
    compressed = zlib.compress(json_str.encode('utf-8'), level=9)
    return base64.b64encode(compressed).decode('ascii')

def _decompress(b64_str):
    """Descomprime de base64+zlib de volta para objeto Python."""
    compressed = base64.b64decode(b64_str)
    json_str = zlib.decompress(compressed).decode('utf-8')
    return json.loads(json_str)

def salvar_cache(empresa: int, obra: str, mes: str, dados: list):
    """
    Salva os dados comprimidos no Supabase, 1 corretor por linha.
    Compressão zlib reduz payload de ~2MB para ~200KB por corretor.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[CACHE] Supabase não configurado — cache ignorado.")
        return False

    url = f"{SUPABASE_URL}/rest/v1/{CACHE_TABLE}?on_conflict=cache_key"
    agora = datetime.now().isoformat()
    
    sucessos = 0
    falhas = 0

    for corretor in dados:
        corretor_id = corretor.get('codigo_corretor', 0)
        cache_key = f"{empresa}-{obra}-{mes}-c{corretor_id}"
        
        # Comprimir o JSON do corretor
        compressed_data = _compress([corretor])
        
        payload = {
            "cache_key": cache_key,
            "empresa": empresa,
            "obra": obra,
            "mes": mes,
            "dados_json": compressed_data,
            "atualizado_em": agora
        }

        ok = False
        for attempt in range(1, 3):
            try:
                r = requests.post(url, headers=_headers(), json=payload, timeout=20)
                if r.status_code in (200, 201):
                    ok = True
                    break
                else:
                    print(f"[CACHE] Erro {r.status_code} para {cache_key}")
                    break
            except requests.exceptions.Timeout:
                if attempt < 2:
                    time.sleep(2)
                else:
                    print(f"[CACHE] Timeout final para {cache_key}")
            except Exception as e:
                print(f"[CACHE] Erro: {e}")
                break

        if ok:
            sucessos += 1
        else:
            falhas += 1
        
        time.sleep(0.1)

    total = len(dados)
    print(f"[CACHE] Obra {empresa}-{obra}: {sucessos}/{total} corretores salvos ({falhas} falhas)")
    return falhas == 0


def _try_decompress(raw_str):
    """Tenta descomprimir. Se falhar, assume JSON puro (formato antigo)."""
    try:
        return _decompress(raw_str)
    except Exception:
        # Formato antigo: JSON puro sem compressão
        return json.loads(raw_str)


def buscar_cache(empresa: int, obra: str, mes: str):
    """
    Busca dados do cache. Suporta formato comprimido e antigo (JSON puro).
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
    
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
    }
    
    try:
        # 1. Novo formato chunked (1 linha por corretor)
        prefix = f"{empresa}-{obra}-{mes}-c"
        url_new = f"{SUPABASE_URL}/rest/v1/{CACHE_TABLE}?cache_key=like.{prefix}*&select=dados_json,atualizado_em&order=atualizado_em.desc&limit=200"
        r = requests.get(url_new, headers=headers, timeout=15)
        
        if r.status_code == 200:
            rows = r.json()
            if rows:
                todos = []
                for row in rows:
                    chunk = _try_decompress(row['dados_json'])
                    todos.extend(chunk)
                return {
                    'dados': todos,
                    'atualizado_em': rows[0]['atualizado_em'],
                    'is_cache': True
                }

        # 2. Fallback: formato antigo (1 mega-row por obra)
        old_key = f"{empresa}-{obra}-{mes}"
        url_old = f"{SUPABASE_URL}/rest/v1/{CACHE_TABLE}?cache_key=eq.{old_key}&select=dados_json,atualizado_em&limit=1"
        r2 = requests.get(url_old, headers=headers, timeout=10)
        if r2.status_code == 200:
            rows2 = r2.json()
            if rows2:
                return {
                    'dados': _try_decompress(rows2[0]['dados_json']),
                    'atualizado_em': rows2[0]['atualizado_em'],
                    'is_cache': True
                }
        
        return None
    except Exception as e:
        print(f"[CACHE] Exceção ao buscar: {e}")
        return None
