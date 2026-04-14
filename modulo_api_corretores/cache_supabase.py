"""
cache_supabase.py
Módulo para salvar e recuperar dados dos corretores no Supabase como cache offline.
Quando o servidor local (UAU SQL) está ativo, salva os dados. 
Quando está offline, o frontend pode buscar os dados do cache.

ESTRATÉGIA DE CHUNKING:
  Cada corretor é salvo como uma linha separada no Supabase para evitar
  payloads gigantes que causam 504/522 no gateway.
  cache_key = "{empresa}-{obra}-{mes}-c{corretor_id}"
  Na leitura, busca todas as linhas com o prefixo "{empresa}-{obra}-{mes}-c"
  e reagrupa numa lista única.
"""
import os
import json
import time
import requests
from datetime import datetime

# Credentials vêm das variáveis de ambiente
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

def _upsert_single(url, payload, cache_key):
    """Tenta upsert de um único registro com retry."""
    max_retries = 2
    for attempt in range(1, max_retries + 1):
        try:
            r = requests.post(url, headers=_headers(), json=payload, timeout=30)
            if r.status_code in (200, 201):
                return True
            else:
                print(f"[CACHE] Erro {r.status_code} para {cache_key}: {r.text[:120]}")
                if attempt < max_retries:
                    time.sleep(2)
                else:
                    return False
        except requests.exceptions.Timeout:
            if attempt < max_retries:
                print(f"[CACHE] Timeout tentativa {attempt}/{max_retries} para {cache_key}")
                time.sleep(3)
            else:
                print(f"[CACHE] Timeout final para {cache_key}")
                return False
        except Exception as e:
            print(f"[CACHE] Exceção para {cache_key}: {e}")
            return False
    return False

def salvar_cache(empresa: int, obra: str, mes: str, dados: list):
    """
    Salva os dados dos corretores no Supabase, UM CORRETOR POR LINHA.
    Isso garante que cada requisição POST seja pequena (~50-200KB) 
    ao invés de um mega-payload de 10MB+ que causa 504/522.
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
        
        payload = {
            "cache_key": cache_key,
            "empresa": empresa,
            "obra": obra,
            "mes": mes,
            "dados_json": json.dumps([corretor], ensure_ascii=False, default=str),
            "atualizado_em": agora
        }

        if _upsert_single(url, payload, cache_key):
            sucessos += 1
        else:
            falhas += 1
        
        # Pequeno delay entre requests para não sobrecarregar
        time.sleep(0.15)

    total = len(dados)
    print(f"[CACHE] Obra {empresa}-{obra}: {sucessos}/{total} corretores salvos ({falhas} falhas)")
    return falhas == 0

def buscar_cache(empresa: int, obra: str, mes: str):
    """
    Busca dados do cache no Supabase.
    Busca todas as linhas que começam com o prefixo empresa-obra-mes-c
    e reagrupa numa lista única de corretores.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
    try:
        prefix = f"{empresa}-{obra}-{mes}-c"
        url = f"{SUPABASE_URL}/rest/v1/{CACHE_TABLE}?cache_key=like.{prefix}*&select=dados_json,atualizado_em&order=atualizado_em.desc&limit=200"
        headers = {
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}',
        }
        r = requests.get(url, headers=headers, timeout=15)
        if r.status_code == 200:
            rows = r.json()
            if rows:
                todos_corretores = []
                for row in rows:
                    chunk = json.loads(row['dados_json'])
                    todos_corretores.extend(chunk)
                
                # Pega o timestamp mais recente
                atualizado_em = rows[0]['atualizado_em']
                
                return {
                    'dados': todos_corretores,
                    'atualizado_em': atualizado_em,
                    'is_cache': True
                }
        
        # Fallback: tenta buscar no formato antigo (cache_key sem -c suffix)
        old_key = f"{empresa}-{obra}-{mes}"
        url_old = f"{SUPABASE_URL}/rest/v1/{CACHE_TABLE}?cache_key=eq.{old_key}&select=dados_json,atualizado_em&limit=1"
        r2 = requests.get(url_old, headers=headers, timeout=10)
        if r2.status_code == 200:
            rows2 = r2.json()
            if rows2:
                row = rows2[0]
                return {
                    'dados': json.loads(row['dados_json']),
                    'atualizado_em': row['atualizado_em'],
                    'is_cache': True
                }
        
        return None
    except Exception as e:
        print(f"[CACHE] Exceção ao buscar: {e}")
        return None
