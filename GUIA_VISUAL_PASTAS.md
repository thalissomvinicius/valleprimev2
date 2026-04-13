# 📸 GUIA VISUAL - Passo a Passo com Imagens

## 🎯 OBJETIVO
Instalar a API na VM Horizon usando apenas o Explorer (copiando arquivos).

---

## 📋 PASSO 1: PREPARAR ARQUIVOS (Na sua máquina)

### 1.1. Abrir PowerShell na pasta do projeto

```
1. Abra o Explorer
2. Navegue até: C:\Users\...\site-disponibilidade\modulo_api_corretores
3. Na barra de endereço, digite: powershell
4. Pressione Enter
```

### 1.2. Executar comando de preparação

```powershell
powershell -ExecutionPolicy Bypass -File deploy_vm_automatico.ps1
```

### 1.3. Resultado

Uma pasta será aberta automaticamente:
```
C:\Users\...\AppData\Local\Temp\VallePrimeAPI_Deploy\
```

---

## 📋 PASSO 2: ACESSAR PASTA DA VM

### 2.1. Abrir Explorer

### 2.2. Navegar até a VM

Você vai ver algo assim no Explorer:

```
📁 Este Computador
├── 💾 Disco Local (C:)
├── 📄 Documentos
└── 🌐 Rede
    └── 📁 \\VMHORIZON\C$\Users\TCRUZ\Desktop
```

Ou pode ser:
- `\\tsclient\C\Users\TCRUZ\Desktop` (se usar Remote Desktop)
- Qualquer pasta que você consegue ver/editar na VM

### 2.3. Criar pasta VallePrimeAPI

```
1. Clique com botão direito na área vazia
2. Novo → Pasta
3. Nome: VallePrimeAPI
4. Pressione Enter
```

Resultado:
```
\\VMHORIZON\C$\Users\TCRUZ\Desktop\
└── 📁 VallePrimeAPI  ← NOVA PASTA
```

---

## 📋 PASSO 3: COPIAR ARQUIVOS

### 3.1. Abrir as duas pastas lado a lado

**Janela 1 (Esquerda):** Pasta temporária com arquivos preparados
```
C:\Users\...\AppData\Local\Temp\VallePrimeAPI_Deploy\
```

**Janela 2 (Direita):** Pasta na VM
```
\\VMHORIZON\C$\Users\TCRUZ\Desktop\VallePrimeAPI\
```

### 3.2. Selecionar TODOS os arquivos da janela 1

```
1. Clique na janela 1
2. Pressione Ctrl+A (selecionar tudo)
3. Pressione Ctrl+C (copiar)
```

### 3.3. Colar na janela 2

```
1. Clique na janela 2 (pasta da VM)
2. Pressione Ctrl+V (colar)
3. Aguarde a cópia terminar (pode demorar 1-2 minutos)
```

### 3.4. Resultado esperado

```
\\VMHORIZON\C$\Users\TCRUZ\Desktop\VallePrimeAPI\
├── 📄 .env.template
├── 📄 cache_supabase.py
├── 📄 database_uau.py
├── 📄 INSTALAR.bat
├── 📄 integracao_corretores.py
├── 📄 main_vm.py
├── 📄 pre_carregar_cache.py
├── 📄 README.txt
├── 📄 requirements.txt
└── 📁 logs (vazia)
```

---

## 📋 PASSO 4: CONFIGURAR .ENV

### 4.1. Renomear arquivo

```
1. Localize o arquivo: .env.template
2. Clique com botão direito
3. Renomear
4. Mude para: .env
5. Pressione Enter
```

⚠️ **ATENÇÃO:** O nome deve ser exatamente `.env` (com ponto no início)

### 4.2. Editar credenciais

```
1. Clique com botão direito no arquivo .env
2. Abrir com → Bloco de Notas
```

### 4.3. Preencher dados

Você verá algo assim:

```env
# ========================================
# BANCO UAU (SQL Server na VM)
# ========================================
UAU_SERVER=localhost\SQLEXPRESS
UAU_DATABASE=UAU_PRODUCAO
UAU_USER=seu_usuario_aqui          ← MUDE AQUI
UAU_PASSWORD=sua_senha_aqui        ← MUDE AQUI

# ========================================
# SUPABASE (Cache na Nuvem)
# ========================================
SUPABASE_URL=https://seu-projeto.supabase.co     ← MUDE AQUI
SUPABASE_SERVICE_ROLE_KEY=sua_chave_aqui         ← MUDE AQUI

# ========================================
# CONFIGURAÇÕES DA API
# ========================================
API_PORT=8001
AMBIENTE=producao
```

### 4.4. Salvar

```
1. Arquivo → Salvar (ou Ctrl+S)
2. Fechar o Bloco de Notas
```

---

## 📋 PASSO 5: CRIAR SCRIPT DE INICIALIZAÇÃO

### 5.1. Copiar o script pronto

Já existe um arquivo chamado `INSTALAR.bat` na pasta.

### 5.2. Criar atalho para facilitar (opcional)

```
1. Clique com botão direito em INSTALAR.bat
2. Enviar para → Área de trabalho (criar atalho)
```

Agora você tem um atalho na área de trabalho da VM!

---

## 📋 PASSO 6: INICIAR A API

### 6.1. Dar duplo clique

```
1. Vá na pasta: \\VMHORIZON\C$\Users\TCRUZ\Desktop\VallePrimeAPI\
2. Dê duplo clique em: INSTALAR.bat
```

### 6.2. O que vai acontecer

Uma janela preta vai abrir e você verá:

```
========================================
   VALLEPRIME API - INICIANDO
========================================

[INFO] Verificando Python...
[INFO] Criando ambiente virtual pela primeira vez...
       (Isso pode demorar 1-2 minutos)
[INFO] Ativando ambiente virtual...
[INFO] Instalando dependencias pela primeira vez...
       (Isso pode demorar 2-3 minutos)

========================================
   API INICIADA COM SUCESSO!
========================================

   Acesse: http://localhost:8001/health
   Docs: http://localhost:8001/docs

   IMPORTANTE: Mantenha esta janela aberta!
   A API funciona enquanto esta janela estiver aberta.

========================================

🚀 Iniciando API FastAPI...
✅ API iniciada na porta 8001
🌐 Iniciando Cloudflare Tunnel...
📊 Iniciando monitor de cache...
✅ Monitor de cache ativo

==========================================
  ✅ SISTEMA INICIADO COM SUCESSO!
==========================================
  API Local: http://localhost:8001
  Docs: http://localhost:8001/docs
  Health: http://localhost:8001/health
==========================================
  Sistema rodando 24/7. Pressione Ctrl+C para parar.
==========================================
```

### 6.3. NÃO FECHE ESTA JANELA!

Minimize ela, mas não feche. A API roda enquanto ela estiver aberta.

---

## 📋 PASSO 7: TESTAR

### 7.1. Abrir navegador na VM

### 7.2. Testar Health Check

Digite na barra de endereço:
```
http://localhost:8001/health
```

Deve aparecer:
```json
{
  "status": "healthy",
  "timestamp": "2026-04-08T12:34:56.789",
  "service": "valleprime-api"
}
```

### 7.3. Testar dados dos corretores

```
http://localhost:8001/api/integracao/corretores?empresa=28&obra=70100&mes=2026-04
```

Deve aparecer um JSON grande com dados dos corretores.

### 7.4. Ver documentação interativa

```
http://localhost:8001/docs
```

Abre uma interface bonita para testar a API.

---

## 📋 PASSO 8: MANTER RODANDO 24/7

### Opção A: Deixar janela aberta

- Minimize a janela preta
- Não feche ela
- A API fica rodando

### Opção B: Colocar na inicialização automática

Se você consegue acessar a pasta de inicialização:

```
1. Copie o arquivo INSTALAR.bat
2. Cole em: \\VMHORIZON\C$\Users\TCRUZ\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup
```

Agora a API inicia automaticamente quando a VM ligar!

---

## 🎯 ESTRUTURA FINAL

```
\\VMHORIZON\C$\Users\TCRUZ\Desktop\VallePrimeAPI\
│
├── 📄 INSTALAR.bat              ← CLIQUE AQUI PARA INICIAR
├── 📄 .env                      ← SUAS CREDENCIAIS
│
├── 📄 main_vm.py                (código Python)
├── 📄 integracao_corretores.py  (código Python)
├── 📄 database_uau.py           (código Python)
├── 📄 cache_supabase.py         (código Python)
├── 📄 pre_carregar_cache.py     (código Python)
│
├── 📄 requirements.txt          (lista de dependências)
├── 📄 README.txt                (referência rápida)
│
├── 📁 .venv\                    (ambiente Python - criado automaticamente)
│   └── Scripts\
│       └── python.exe
│
└── 📁 logs\                     (logs - criado automaticamente)
    ├── service_stdout.log
    ├── service_stderr.log
    └── api_20260408.log
```

---

## ✅ CHECKLIST FINAL

- [ ] Executei `deploy_vm_automatico.ps1` na minha máquina
- [ ] Localizei a pasta compartilhada da VM no Explorer
- [ ] Criei a pasta `VallePrimeAPI` na VM
- [ ] Copiei todos os arquivos para a pasta da VM
- [ ] Renomeei `.env.template` para `.env`
- [ ] Editei o `.env` com minhas credenciais
- [ ] Dei duplo clique em `INSTALAR.bat`
- [ ] Janela preta abriu e mostrou "API INICIADA"
- [ ] Testei `http://localhost:8001/health` no navegador da VM
- [ ] Funcionou! 🎉

---

## 🚨 SE DER ERRO

### "Python não encontrado"
- Python precisa estar instalado na VM
- Peça ao TI para instalar Python 3.8+

### "Erro ao conectar no UAU"
- Abra o arquivo `.env` e verifique as credenciais
- Confirme usuário e senha do banco UAU

### "Arquivo .env não encontrado"
- Certifique-se de ter renomeado `.env.template` para `.env`
- O nome deve ser exatamente `.env` (com ponto)

### "Janela fecha sozinha"
- Houve um erro
- Abra a pasta `logs\`
- Abra o arquivo `service_stderr.log` com Bloco de Notas
- Veja qual foi o erro

---

## 💡 DICAS EXTRAS

### Para ver logs:
```
1. Abra a pasta: logs\
2. Abra o arquivo mais recente com Bloco de Notas
3. Pressione F5 para atualizar
```

### Para parar a API:
```
1. Vá na janela preta
2. Pressione Ctrl+C
3. Ou feche a janela
```

### Para reiniciar:
```
1. Feche a janela atual
2. Dê duplo clique em INSTALAR.bat novamente
```

---

## 🎉 PRONTO!

Você agora tem uma API rodando 24/7 na VM com apenas alguns cliques! 🚀

**Tempo total: ~10 minutos**
**Dificuldade: Muito Fácil** ⭐⭐☆☆☆
