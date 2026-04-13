"""
Pre-carregador de Cache Inteligente
Executa consultas ao UAU e salva no Supabase ANTES do usuário acessar
Reduz tempo de carregamento de 30s para <2s
"""
import sys
import os
from datetime import datetime, timedelta

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))
except ImportError:
    pass

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

# Adiciona o path do módulo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from integracao_corretores import fetch_dados_corretores
from cache_supabase import salvar_cache
from database_uau import get_db_connection

# Lista de obras prioritárias para pré-cache
OBRAS_PRIORITARIAS = [
    {'empresa': 28, 'obra': '70100', 'nome': 'Valle do Ipitinga II'},
    {'empresa': 6, 'obra': '70100', 'nome': 'Jardim Castanhal'},
    {'empresa': 9, 'obra': '70100', 'nome': 'Salles Jardim'},
    {'empresa': 12, 'obra': '70100', 'nome': 'Jardim América'},
]

def gerar_meses_recentes(quantidade=3):
    """Gera os últimos N meses no formato YYYY-MM"""
    meses = []
    hoje = datetime.now()
    for i in range(quantidade):
        data = hoje - timedelta(days=30 * i)
        meses.append(data.strftime('%Y-%m'))
    return meses

def pre_carregar_tudo():
    """Carrega dados de todas as obras prioritárias dos últimos 3 meses"""
    print("\n" + "="*60)
    print("  PRÉ-CARREGAMENTO DE CACHE INTELIGENTE")
    print("="*60 + "\n")
    
    meses = gerar_meses_recentes(3)
    total_operacoes = len(OBRAS_PRIORITARIAS) * len(meses)
    operacao_atual = 0
    
    conn = get_db_connection()
    if not conn:
        print("❌ Erro: Não foi possível conectar ao banco UAU")
        return False
    
    print(f"📊 Carregando {total_operacoes} combinações (obras x meses)...\n")
    
    sucessos = 0
    falhas = 0
    
    for obra_config in OBRAS_PRIORITARIAS:
        empresa = obra_config['empresa']
        obra = obra_config['obra']
        nome = obra_config['nome']
        
        print(f"🏗️  {nome} (Empresa {empresa}, Obra {obra})")
        
        for mes in meses:
            operacao_atual += 1
            try:
                print(f"   [{operacao_atual}/{total_operacoes}] Processando {mes}...", end=" ")
                
                # Busca dados do UAU
                dados = fetch_dados_corretores(
                    conn=conn,
                    empresa=empresa,
                    obra=obra,
                    mes=mes
                )
                
                if dados and len(dados) > 0:
                    # Salva no Supabase
                    if salvar_cache(empresa, obra, mes, dados):
                        print(f"✅ {len(dados)} corretores salvos")
                        sucessos += 1
                    else:
                        print("⚠️  Falha ao salvar cache")
                        falhas += 1
                else:
                    print("⚠️  Sem dados")
                    falhas += 1
                    
            except Exception as e:
                print(f"❌ Erro completo: {str(e)}")
                import traceback
                traceback.print_exc()
                falhas += 1
        
        print()  # Linha em branco entre obras
    
    conn.close()
    
    print("\n" + "="*60)
    print(f"  RESULTADO: {sucessos} sucessos | {falhas} falhas")
    print("="*60 + "\n")
    
    return sucessos > 0

if __name__ == "__main__":
    import time
    inicio = time.time()
    
    sucesso = pre_carregar_tudo()
    
    tempo_total = time.time() - inicio
    print(f"⏱️  Tempo total: {tempo_total:.1f}s")
    
    if sucesso:
        print("\n✨ Cache pré-carregado! O dashboard agora carregará instantaneamente.")
    else:
        print("\n⚠️  Houve problemas no pré-carregamento. Verifique a conexão com o UAU.")
    
    input("\nPressione ENTER para sair...")
