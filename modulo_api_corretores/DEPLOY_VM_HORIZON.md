# 🚀 Deploy 24/7 no VMware Horizon

## 🎯 SOLUÇÃO DEFINITIVA
Rodar a API de corretores **dentro da VM Horizon** que tem acesso direto ao banco UAU.

## ✅ VANTAGENS
- ✅ Acesso direto ao banco UAU (sem túnel instável)
- ✅ API ativa 24/7 (VM sempre ligada)
- ✅ Sem necessidade de iniciar manualmente
- ✅ Dados sempre atualizados em tempo real
- ✅ Cache automático no Supabase como backup

---

## 📋 ARQUITETURA

```
┌─────────────────────────────────────────────────────────┐
│  VMware Horizon (Nuvem - 24/7)                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  1. API FastAPI (porta 8001)                      │  │
│  │     - Acesso direto ao SQL Server UAU             │  │
│  │     - Endpoint: /api/integracao/corretores        │  │
│  │                                                    │  │
│  │  2. Monitor de Sincronização (1s)                 │  │
│  │     - Detecta mudanças no UAU                     │  │
│  │     - Salva cache no Supabase                     │  │
│  │                                                    │  │
│  │  3. Cloudflare Tunnel (Permanente)                │  │
│  │     - URL fixa: valleprime-api.trycloudflare.com  │  │
│  │     - Expõe API para internet                     │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Frontend (Cloudflare Pages)                            │
│  - Consome API via URL fixa                             │
│  - Fallback para cache Supabase                         │
└─────────────────────────────────────────────────────────┘
```

---

## 🛠️ INSTALAÇÃO NA VM HORIZON

### **Passo 1: Preparar Ambiente Python**

```powershell
# Conecte-se à VM Horizon via RDP
# Abra PowerShell como Administrador

# Criar pasta do projeto
cd C:\
mkdir VallePrimeAPI
cd VallePrimeAPI

# Criar ambiente virtual
python -m venv venv
.\venv\Scripts\activate

# Instalar dependências
pip install fastapi uvicorn pyodbc python-dotenv requests schedule
```

### **Passo 2: Baixar cloudflared.exe**

```powershell
# Baixar Cloudflare Tunnel
Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "cloudflared.exe"
```

### **Passo 3: Copiar Arquivos do Projeto**

Copie estes arquivos para `C:\VallePrimeAPI\`:
- `modulo_api_corretores/integracao_corretores.py`
- `modulo_api_corretores/database_uau.py`
- `modulo_api_corretores/cache_supabase.py`
- `modulo_api_corretores/monitor_uau_supabase.py`
- `.env` (com credenciais do Supabase e UAU)

### **Passo 4: Criar Arquivo Principal**

Vou criar o arquivo `main_vm.py` que roda tudo automaticamente.

---

## 🔧 CONFIGURAÇÃO

### **Arquivo .env na VM**

```env
# Banco UAU (SQL Server local da VM)
UAU_SERVER=localhost\\SQLEXPRESS
UAU_DATABASE=UAU_PRODUCAO
UAU_USER=seu_usuario
UAU_PASSWORD=sua_senha

# Supabase (Cache na nuvem)
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_chave_aqui

# Configuração da API
API_PORT=8001
AMBIENTE=producao
```

---

## 🚀 EXECUÇÃO AUTOMÁTICA

### **Opção 1: Serviço Windows (Recomendado)**

Cria um serviço que inicia automaticamente com o Windows.

### **Opção 2: Tarefa Agendada**

Executa ao fazer login na VM.

### **Opção 3: Startup Script**

Adiciona ao startup do Windows.

---

## 📊 MONITORAMENTO

A API terá endpoints de health check:
- `GET /health` - Status da API
- `GET /health/uau` - Status conexão UAU
- `GET /health/cache` - Status cache Supabase
- `GET /metrics` - Métricas de uso

---

## 🔐 SEGURANÇA

- ✅ API protegida por Cloudflare Tunnel (HTTPS automático)
- ✅ Sem exposição de portas públicas
- ✅ Credenciais em variáveis de ambiente
- ✅ Logs de acesso e auditoria

---

## 📝 PRÓXIMOS PASSOS

1. Configurar ambiente na VM Horizon
2. Testar conexão com banco UAU
3. Configurar Cloudflare Tunnel permanente
4. Criar serviço Windows
5. Atualizar frontend com URL fixa
6. Monitorar por 24h para validar estabilidade
