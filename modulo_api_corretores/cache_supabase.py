"""
cache_supabase.py
Módulo para salvar e recuperar dados dos corretores no Supabase como cache offline.
Quando o servidor local (UAU SQL) está ativo, salva os dados. 
Quando está offline, o frontend pode buscar os dados do cache.
"""
import os
import json
import requests
from datetime import datetime

# Credentials vêm das variáveis de ambiente do Railway (mesmo ambiente do backend principal)
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

def salvar_cache(empresa: int, obra: str, mes: str, dados: list):
    """
    Salva (upsert) os dados dos corretores no Supabase.
    Usa empresa+obra+mes como chave única.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[CACHE] Supabase não configurado — cache ignorado.")
        return False

    try:
        cache_key = f"{empresa}-{obra}-{mes}"
        payload = {
            "cache_key": cache_key,
            "empresa": empresa,
            "obra": obra,
            "mes": mes,
            "dados_json": json.dumps(dados, ensure_ascii=False, default=str),
            "atualizado_em": datetime.now().isoformat()
        }
        url = f"{SUPABASE_URL}/rest/v1/{CACHE_TABLE}"
        r = requests.post(url, headers=_headers(), json=payload, timeout=10)
        if r.status_code in (200, 201):
            print(f"[CACHE] Dados salvos no Supabase para {cache_key}")
            return True
        else:
            print(f"[CACHE] Erro ao salvar: {r.status_code} — {r.text[:200]}")
            return False
    except Exception as e:
        print(f"[CACHE] Exceção ao salvar: {e}")
        return False

def buscar_cache(empresa: int, obra: str, mes: str):
    """
    Busca dados do cache no Supabase.
    Retorna dict com 'dados' e 'atualizado_em', ou None se não encontrado.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
    try:
        cache_key = f"{empresa}-{obra}-{mes}"
        url = f"{SUPABASE_URL}/rest/v1/{CACHE_TABLE}?cache_key=eq.{cache_key}&select=dados_json,atualizado_em&limit=1"
        headers = {
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}',
        }
        r = requests.get(url, headers=headers, timeout=5)
        if r.status_code == 200:
            rows = r.json()
            if rows:
                row = rows[0]
                return {
                    'dados': json.loads(row['dados_json']),
                    'atualizado_em': row['atualizado_em'],
                    'is_cache': True
                }
        return None
    except Exception as e:
        print(f"[CACHE] Exceção ao buscar: {e}")
        return None
