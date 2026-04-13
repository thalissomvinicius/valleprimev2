# 🎯 GUIA SUPER SIMPLES - Apenas Copiando Arquivos

## 📋 SITUAÇÃO
Você tem acesso apenas às **pastas compartilhadas** da VM Horizon (como se fosse uma pasta de rede).
Não tem acesso ao terminal, PowerShell ou instalação de serviços.

## ✅ SOLUÇÃO SIMPLIFICADA

Vamos criar um sistema que:
1. Você copia arquivos para a pasta da VM
2. Um script Python roda automaticamente quando você abre um arquivo
3. Mantém a API ativa enquanto a VM estiver ligada

---

## 🚀 PASSO A PASSO

### **PASSO 1: Preparar Arquivos na Sua Máquina Local**

Execute este comando na sua máquina:

```powershell
cd modulo_api_corretores
powershell -ExecutionPolicy Bypass -File deploy_vm_automatico.ps1
```

Isso vai criar uma pasta `VallePrimeAPI_Deploy` com todos os arquivos.

---

### **PASSO 2: Localizar a Pasta Compartilhada da VM**

No Windows Explorer, você deve ver algo como:

```
Este Computador
├── 📁 Disco Local (C:)
├── 📁 Documentos
└── 🌐 Rede
    └── 📁 VMHORIZON (ou nome da VM)
        └── 📁 Usuários
            └── 📁 TCRUZ
                └── 📁 Desktop  ← AQUI!
```

Ou pode ser em:
- `\\vmhorizon\c$\Users\TCRUZ\Desktop`
- `\\tsclient\C\Users\TCRUZ\Desktop` (se usar RDP)
- Ou qualquer pasta que você consegue acessar na VM

---

### **PASSO 3: Copiar Arquivos para a VM**

**3.1. Navegue até a pasta compartilhada da VM**

Exemplo: `\\vmhorizon\c$\Users\TCRUZ\Desktop`

**3.2. Crie uma nova pasta chamada `VallePrimeAPI`**

Clique com botão direito → Novo → Pasta → Nome: `VallePrimeAPI`

**3.3. Copie TODOS os arquivos da pasta `VallePrimeAPI_Deploy` para dentro desta nova pasta**

Arraste e solte ou Ctrl+C / Ctrl+V:

```
\\vmhorizon\c$\Users\TCRUZ\Desktop\VallePrimeAPI\
├── main_vm.py
├── integracao_corretores.py
├── database_uau.py
├── cache_supabase.py
├── pre_carregar_cache.py
├── .env.template
├── requirements.txt
├── INSTALAR.bat
├── README.txt
└── cloudflared.exe (opcional)
```

---

### **PASSO 4: Configurar o Arquivo .env**

**4.1. Na pasta da VM, renomeie `.env.template` para `.env`**

Clique com botão direito → Renomear → Mude para `.env`

**4.2. Abra o arquivo `.env` com Bloco de Notas**

Clique com botão direito → Abrir com → Bloco de Notas

**4.3. Edite as credenciais:**

```env
# Banco UAU (SQL Server na VM)
UAU_SERVER=localhost\SQLEXPRESS
UAU_DATABASE=UAU_PRODUCAO
UAU_USER=seu_usuario_uau_aqui
UAU_PASSWORD=sua_senha_uau_aqui

# Supabase (Cache na Nuvem)
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role_aqui

# Configurações
API_PORT=8001
AMBIENTE=producao
```

**4.4. Salve e feche** (Ctrl+S)

---

### **PASSO 5: Criar Script de Inicialização Automática**

Agora vamos criar um arquivo que você pode clicar para iniciar a API.

**5.1. Na pasta `VallePrimeAPI` da VM, crie um novo arquivo de texto**

Clique com botão direito → Novo → Documento de Texto

**5.2. Renomeie para `INICIAR_API.bat`**

⚠️ **IMPORTANTE:** Certifique-se de que a extensão é `.bat` e não `.bat.txt`

Para ver extensões: No Explorer → Exibir → Marque "Extensões de nomes de arquivos"

**5.3. Abra com Bloco de Notas e cole este conteúdo:**

```batch
@echo off
title VallePrime API 24/7
color 0A

echo.
echo ========================================
echo    VALLEPRIME API - INICIANDO
echo ========================================
echo.

cd /d "%~dp0"

echo [INFO] Verificando Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Python nao encontrado!
    echo        Instale Python 3.8+ na VM
    pause
    exit /b 1
)

echo [INFO] Verificando ambiente virtual...
if not exist ".venv" (
    echo [INFO] Criando ambiente virtual...
    python -m venv .venv
)

echo [INFO] Ativando ambiente virtual...
call .venv\Scripts\activate.bat

echo [INFO] Instalando/Atualizando dependencias...
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

echo [INFO] Verificando arquivo .env...
if not exist ".env" (
    echo [ERRO] Arquivo .env nao encontrado!
    echo        Renomeie .env.template para .env e configure
    pause
    exit /b 1
)

echo.
echo ========================================
echo    API INICIADA COM SUCESSO!
echo ========================================
echo.
echo    Acesse: http://localhost:8001/health
echo    Docs: http://localhost:8001/docs
echo.
echo    Mantenha esta janela aberta!
echo    Pressione Ctrl+C para parar.
echo.
echo ========================================
echo.

python main_vm.py

pause
```

**5.4. Salve e feche**

---

### **PASSO 6: Iniciar a API**

**6.1. Na pasta da VM, dê duplo clique em `INICIAR_API.bat`**

Uma janela preta (prompt de comando) vai abrir e você verá:

```
========================================
   VALLEPRIME API - INICIANDO
========================================

[INFO] Verificando Python...
[INFO] Criando ambiente virtual...
[INFO] Instalando dependencias...

========================================
   API INICIADA COM SUCESSO!
========================================

   Acesse: http://localhost:8001/health
   
   Mantenha esta janela aberta!
========================================
```

**6.2. NÃO FECHE ESTA JANELA!**

Enquanto ela estiver aberta, a API está rodando.

---

### **PASSO 7: Testar se Está Funcionando**

**7.1. Abra o navegador na VM**

**7.2. Acesse:**
```
http://localhost:8001/health
```

Deve aparecer:
```json
{
  "status": "healthy",
  "timestamp": "2026-04-08T12:34:56",
  "service": "valleprime-api"
}
```

**7.3. Teste os dados dos corretores:**
```
http://localhost:8001/api/integracao/corretores?empresa=28&obra=70100&mes=2026-04
```

Deve retornar JSON com dados dos corretores.

---

## 🔄 MANTER A API RODANDO 24/7

### **Opção A: Deixar a Janela Aberta**

- Minimize a janela do `INICIAR_API.bat`
- Não feche ela
- A API fica rodando enquanto a janela estiver aberta

### **Opção B: Criar Atalho na Pasta de Inicialização**

Se você consegue acessar a pasta de inicialização da VM:

**1. Copie o arquivo `INICIAR_API.bat`**

**2. Cole na pasta de inicialização:**
```
\\vmhorizon\c$\Users\TCRUZ\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup
```

Ou navegue:
- Pressione Win+R na VM
- Digite: `shell:startup`
- Cole o atalho lá

**3. Agora a API inicia automaticamente quando a VM ligar!**

---

## 📊 ESTRUTURA FINAL DAS PASTAS

```
\\vmhorizon\c$\Users\TCRUZ\Desktop\VallePrimeAPI\
│
├── 📄 INICIAR_API.bat          ← CLIQUE AQUI PARA INICIAR
├── 📄 main_vm.py               (servidor principal)
├── 📄 integracao_corretores.py (lógica de integração)
├── 📄 database_uau.py          (conexão UAU)
├── 📄 cache_supabase.py        (cache nuvem)
├── 📄 pre_carregar_cache.py    (pré-cache)
├── 📄 .env                     (suas credenciais)
├── 📄 requirements.txt         (dependências)
├── 📄 README.txt               (referência)
│
├── 📁 .venv\                   (criado automaticamente)
│   └── Scripts\
│       └── python.exe
│
└── 📁 logs\                    (criado automaticamente)
    ├── service_stdout.log
    └── api_20260408.log
```

---

## 🎯 CHECKLIST RÁPIDO

- [ ] Copiei todos os arquivos para a pasta da VM
- [ ] Renomeei `.env.template` para `.env`
- [ ] Configurei credenciais no `.env`
- [ ] Criei o arquivo `INICIAR_API.bat`
- [ ] Dei duplo clique em `INICIAR_API.bat`
- [ ] Janela preta abriu e mostrou "API INICIADA"
- [ ] Testei `http://localhost:8001/health` no navegador
- [ ] Funcionou! ✅

---

## 🚨 PROBLEMAS COMUNS

### **"Python não encontrado"**
- Python precisa estar instalado na VM
- Peça ao TI para instalar Python 3.8+ na VM

### **"Erro ao conectar no UAU"**
- Verifique as credenciais no arquivo `.env`
- Confirme que o SQL Server está rodando na VM

### **"Arquivo .env não encontrado"**
- Certifique-se de renomear `.env.template` para `.env`
- Verifique se está na pasta correta

### **"Janela fecha sozinha"**
- Houve um erro
- Abra o arquivo `logs\service_stderr.log` para ver o erro

---

## 💡 DICAS

### **Para ver logs em tempo real:**
1. Abra a pasta `logs\`
2. Abra o arquivo mais recente com Bloco de Notas
3. Atualize (F5) para ver novos logs

### **Para parar a API:**
1. Vá na janela preta do `INICIAR_API.bat`
2. Pressione Ctrl+C
3. Ou simplesmente feche a janela

### **Para reiniciar:**
1. Feche a janela atual
2. Dê duplo clique em `INICIAR_API.bat` novamente

---

## 🎉 PRONTO!

Agora você tem:
- ✅ API rodando na VM com acesso direto ao UAU
- ✅ Inicialização com 1 clique
- ✅ Cache automático no Supabase
- ✅ Logs para debug
- ✅ Fácil de manter

**Tempo total: ~10 minutos** 🚀
