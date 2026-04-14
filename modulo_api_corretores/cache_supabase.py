"""
cache_supabase.py - Módulo de sincronização VallePrime v3.0 (Definitivo)

Arquitetura:
  PC Local (SQL UAU) → comprime array de corretores (gzip+base64) → POST para Render API
  Render API → descomprime → salva JSON puro em /tmp → serve ao frontend

Contrato:
  - O sync envia APENAS o array de corretores comprimido
  - O servidor monta o envelope {"dados": [...], "atualizado_em": "...", "is_cache": false}
  - O frontend lê esse envelope via GET
"""
import os
import json
import time
import gzip
import base64
import requests
from datetime import datetime

# ═══════════════════════════════════════════
# CONFIGURAÇÃO
# ═══════════════════════════════════════════
RENDER_API_URL = os.environ.get('RENDER_API_URL', 'https://valleprimev2.onrender.com')
SYNC_SECRET = os.environ.get('SYNC_SECRET', 'valleprime-sync-2026')


def _compress_array(dados_list):
    """
    Recebe a lista Python de corretores, serializa para JSON,
    comprime com gzip e codifica em base64.
    Retorna: string base64 ASCII.
    """
    json_bytes = json.dumps(dados_list, ensure_ascii=False, default=str).encode('utf-8')
    compressed = gzip.compress(json_bytes, compresslevel=6)
    return base64.b64encode(compressed).decode('ascii')


def testar_conexao():
    """Testa se a API Render está acessível."""
    for tentativa in range(1, 3):
        try:
            r = requests.get(f"{RENDER_API_URL}/api/health", timeout=20)
            if r.status_code == 200:
                print("[SYNC] ✅ Conexão com API Render OK")
                return True
            print(f"[SYNC] ⚠️ API Render status {r.status_code}")
            return True  # Servidor respondeu, está vivo
        except requests.exceptions.Timeout:
            if tentativa == 1:
                print("[SYNC] ⏳ Render pode estar hibernando, tentando acordar...")
                time.sleep(5)
                continue
            print("[SYNC] ❌ API Render inacessível (timeout).")
            return False
        except Exception as e:
            print(f"[SYNC] ❌ Erro de conexão: {e}")
            return False
    return False


def salvar_cache(empresa, obra, mes, dados):
    """
    Comprime o array de corretores e envia para o Render.
    O Render descomprime e salva o JSON puro no disco.
    """
    cache_key = f"{empresa}-{obra}-{mes}"
    atualizado_em = datetime.now().isoformat()

    # Comprime apenas o array de dados (não o envelope)
    json_raw = json.dumps(dados, ensure_ascii=False, default=str)
    dados_b64 = _compress_array(dados)

    ratio = len(dados_b64) / max(len(json_raw), 1) * 100
    print(f"[SYNC] {cache_key}: JSON={len(json_raw)//1024}KB → Comprimido={len(dados_b64)//1024}KB ({ratio:.0f}%)")

    payload = {
        "cache_key": cache_key,
        "dados_compressed": dados_b64,
        "atualizado_em": atualizado_em,
        "total_corretores": len(dados)
    }

    headers = {
        'Content-Type': 'application/json',
        'X-Sync-Secret': SYNC_SECRET
    }

    url = f"{RENDER_API_URL}/api/integracao/sync/push"

    for attempt in range(1, 4):
        try:
            r = requests.post(url, headers=headers, json=payload, timeout=60)
            if r.status_code == 200:
                resp = r.json()
                print(f"[SYNC] ✅ Push OK para {cache_key} ({resp.get('corretores_count', 0)} corretores)")
                return True
            elif r.status_code == 401:
                print("[SYNC] ❌ Secret inválido. Verifique SYNC_SECRET no .env")
                return False
            else:
                print(f"[SYNC] Erro {r.status_code}: {r.text[:200]}")
                if attempt < 3:
                    time.sleep(attempt * 3)
        except requests.exceptions.Timeout:
            print(f"[SYNC] ⏱️ Timeout tentativa {attempt}/3. Aguardando...")
            time.sleep(attempt * 5)
        except Exception as e:
            print(f"[SYNC] Exceção: {e}")
            return False

    print(f"[SYNC] ❌ Falha definitiva para {cache_key}")
    return False


def buscar_cache(empresa, obra, mes):
    """Busca dados via Render API (fallback para uso local)."""
    try:
        url = f"{RENDER_API_URL}/api/integracao/cache/corretores?empresa={empresa}&obra={obra}&mes={mes}"
        r = requests.get(url, timeout=15)
        if r.status_code == 200:
            return r.json()
        return None
    except Exception as e:
        print(f"[CACHE] Exceção ao buscar: {e}")
        return None
