import sys
import os

# Set stdout to unbuffered to see results immediately
sys.stdout.reconfigure(line_buffering=True)

print("1. Início do Script de Diagnóstico")
try:
    BASE_DIR = os.getcwd()
    print(f"2. Diretório Atual: {BASE_DIR}")
    
    # Simular o sys.path do main.py
    sys.path.append(os.path.join(BASE_DIR, 'api'))
    sys.path.append(os.path.join(BASE_DIR, 'modulo_api_corretores'))
    print("3. sys.path atualizado")
    
    print("4. Tentando importar o módulo 'database'...")
    import database
    print("5. Módulo 'database' importado com sucesso!")
    
    print("6. Tentando importar o módulo 'integracao_corretores'...")
    import integracao_corretores
    print("7. Módulo 'integracao_corretores' importado com sucesso!")
    
    print("8. Verificando o router...")
    from integracao_corretores import router
    print(f"9. Router encontrado: {router}")
    
except Exception as e:
    import traceback
    print(f"\n❌ ERRO DETECTADO: {e}")
    traceback.print_exc()
    sys.exit(1)

print("\n✨ Diagnóstico concluído sem erros de importação!")
