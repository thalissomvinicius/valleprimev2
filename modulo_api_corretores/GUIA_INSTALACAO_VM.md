# 🚀 Guia de Instalação - VMware Horizon (24/7)

## 📋 PRÉ-REQUISITOS

- ✅ Acesso ao VMware Horizon com usuário TCRUZ
- ✅ Acesso ao banco UAU (SQL Server) na VM
- ✅ Python 3.8+ instalado na VM
- ✅ Credenciais do Supabase (para cache)

---

## 🛠️ INSTALAÇÃO PASSO A PASSO

### **1. Conectar à VM Horizon**

1. Acesse o VMware Horizon Client
2. Faça login com seu usuário (TCRUZ)
3. Abra a área de trabalho remota

### **2. Preparar Pasta do Projeto**

```powershell
# Abra PowerShell na VM
cd C:\
mkdir VallePrimeAPI
cd VallePrimeAPI
```

### **3. Copiar Arquivos do Projeto**

Copie estes arquivos da sua máquina local para `C:\VallePrimeAPI\` na VM:

**Arquivos obrigatórios:**
```
modulo_api_corretores/
├── main_vm.py                          # ⭐ Servidor principal
├── integracao_corretores.py            # Lógica de integração
├── database_uau.py                     # Conexão com UAU
├── cache_supabase.py                   # Cache na nuvem
├── pre_carregar_cache.py               # Pré-carregamento
├── instalar_servico_windows.ps1        # ⭐ Instalador de serviço
└── .env                                # ⭐ Configurações
```

**Opcional (para túnel público):**
```
cloudflared.exe                         # Cloudflare Tunnel
```

### **4. Criar Ambiente Virtual**

```powershell
cd C:\VallePrimeAPI

# Criar venv
python -m venv .venv

# Ativar
.\.venv\Scripts\activate

# Instalar dependências
pip install fastapi uvicorn pyodbc python-dotenv requests schedule
```

### **5. Configurar Arquivo .env**

Crie o arquivo `C:\VallePrimeAPI\.env`:

```env
# ========================================
# BANCO UAU (SQL Server na VM)
# ========================================
UAU_SERVER=localhost\SQLEXPRESS
UAU_DATABASE=UAU_PRODUCAO
UAU_USER=seu_usuario_uau
UAU_PASSWORD=sua_senha_uau

# ========================================
# SUPABASE (Cache na Nuvem)
# ========================================
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role

# ========================================
# CONFIGURAÇÕES DA API
# ========================================
API_PORT=8001
AMBIENTE=producao

# ========================================
# OPCIONAL: Configurações de Log
# ========================================
LOG_LEVEL=INFO
```

### **6. Testar Conexão com UAU**

```powershell
# Ainda com venv ativado
python

# No console Python:
>>> from database_uau import get_uau_connection
>>> conn = get_uau_connection()
>>> print("✅ Conexão OK!" if conn else "❌ Erro na conexão")
>>> exit()
```

### **7. Testar API Manualmente (Primeiro Teste)**

```powershell
# Executar servidor manualmente para testar
python main_vm.py
```

Você deve ver:
```
==========================================
  VALLEPRIME API 24/7 - VMware Horizon
==========================================
  ✅ SISTEMA INICIADO COM SUCESSO!
==========================================
  API Local: http://localhost:8001
  Docs: http://localhost:8001/docs
==========================================
```

**Teste no navegador da VM:**
- Abra: `http://localhost:8001/health`
- Deve retornar: `{"status": "healthy", ...}`

**Se funcionou, pressione Ctrl+C para parar e prossiga para instalação como serviço.**

### **8. Instalar como Serviço Windows (24/7)**

```powershell
# Executar como Administrador
cd C:\VallePrimeAPI
powershell -ExecutionPolicy Bypass -File instalar_servico_windows.ps1 -Instalar
```

O script vai:
1. ✅ Baixar NSSM (gerenciador de serviços)
2. ✅ Instalar o serviço "VallePrimeAPI"
3. ✅ Configurar inicialização automática
4. ✅ Iniciar o serviço imediatamente

### **9. Verificar Status do Serviço**

```powershell
# Ver status
powershell -ExecutionPolicy Bypass -File instalar_servico_windows.ps1 -Status

# Ou via Services do Windows
services.msc
# Procure por "VallePrime API - Corretores 24/7"
```

### **10. Baixar Cloudflare Tunnel (Opcional)**

Se quiser expor a API publicamente:

```powershell
cd C:\VallePrimeAPI

# Baixar cloudflared
Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "cloudflared.exe"

# Reiniciar serviço para ativar túnel
powershell -ExecutionPolicy Bypass -File instalar_servico_windows.ps1 -Reiniciar
```

---

## 🔍 VERIFICAÇÃO E TESTES

### **Teste 1: Health Check Local**
```powershell
curl http://localhost:8001/health
```

### **Teste 2: Endpoint de Corretores**
```powershell
curl "http://localhost:8001/api/integracao/corretores?empresa=28&obra=70100&mes=2026-04"
```

### **Teste 3: Verificar Logs**
```powershell
# Ver logs do serviço
Get-Content C:\VallePrimeAPI\logs\service_stdout.log -Tail 50

# Ver logs da aplicação
Get-Content C:\VallePrimeAPI\logs\api_*.log -Tail 50
```

### **Teste 4: Verificar Cache Supabase**
- Acesse o Supabase Dashboard
- Vá em Table Editor → `cache_corretores`
- Deve ter registros sendo criados/atualizados

---

## 🌐 ATUALIZAR FRONTEND

Após a API estar rodando na VM, atualize o frontend:

**Arquivo: `src/services/api.js`**

```javascript
// Se você configurou o Cloudflare Tunnel, use a URL pública:
const CORRETORES_TUNNEL_URL = 'https://sua-url-fixa.trycloudflare.com';

// OU se for usar apenas via cache Supabase (recomendado):
// Mantenha como está e o sistema usará o cache automaticamente
```

---

## 🔧 GERENCIAMENTO DO SERVIÇO

### **Ver Status**
```powershell
powershell -ExecutionPolicy Bypass -File instalar_servico_windows.ps1 -Status
```

### **Reiniciar**
```powershell
powershell -ExecutionPolicy Bypass -File instalar_servico_windows.ps1 -Reiniciar
```

### **Desinstalar**
```powershell
powershell -ExecutionPolicy Bypass -File instalar_servico_windows.ps1 -Desinstalar
```

### **Ver Logs em Tempo Real**
```powershell
Get-Content C:\VallePrimeAPI\logs\service_stdout.log -Wait
```

---

## 📊 MONITORAMENTO

### **Endpoints de Monitoramento**

- `GET /health` - Status geral da API
- `GET /docs` - Documentação interativa (Swagger)
- `GET /api/integracao/corretores` - Dados dos corretores

### **Logs**

Todos os logs ficam em: `C:\VallePrimeAPI\logs\`

- `service_stdout.log` - Saída padrão do serviço
- `service_stderr.log` - Erros do serviço
- `api_YYYYMMDD.log` - Logs diários da aplicação

### **Alertas**

O sistema registra:
- ✅ Inicializações bem-sucedidas
- ⚠️ Falhas de conexão com UAU
- ⚠️ Falhas ao salvar cache no Supabase
- ❌ Erros críticos

---

## 🚨 TROUBLESHOOTING

### **Serviço não inicia**
1. Verifique logs: `C:\VallePrimeAPI\logs\service_stderr.log`
2. Teste manualmente: `python main_vm.py`
3. Verifique credenciais no `.env`

### **Erro de conexão com UAU**
1. Verifique se SQL Server está rodando na VM
2. Teste conexão: `sqlcmd -S localhost\SQLEXPRESS -U usuario -P senha`
3. Verifique firewall local

### **Cache não atualiza no Supabase**
1. Verifique credenciais do Supabase no `.env`
2. Teste manualmente: `python pre_carregar_cache.py`
3. Verifique logs de erro

### **Túnel Cloudflare não funciona**
1. Verifique se `cloudflared.exe` existe
2. Teste manualmente: `.\cloudflared.exe tunnel --url http://localhost:8001`
3. O túnel é opcional - o sistema funciona sem ele via cache

---

## ✅ CHECKLIST FINAL

- [ ] VM Horizon acessível
- [ ] Python instalado na VM
- [ ] Arquivos copiados para `C:\VallePrimeAPI\`
- [ ] Arquivo `.env` configurado
- [ ] Ambiente virtual criado
- [ ] Dependências instaladas
- [ ] Teste manual funcionando
- [ ] Serviço Windows instalado
- [ ] Serviço rodando (Status: Running)
- [ ] Health check respondendo
- [ ] Endpoint de corretores funcionando
- [ ] Cache sendo salvo no Supabase
- [ ] Logs sendo gerados corretamente

---

## 🎉 RESULTADO FINAL

Após a instalação completa:

✅ API rodando 24/7 na VM Horizon
✅ Acesso direto ao banco UAU (sem túnel instável)
✅ Cache automático no Supabase a cada 1 hora
✅ Inicialização automática com o Windows
✅ Logs completos para monitoramento
✅ Frontend carrega dados em <2 segundos
✅ Sistema funciona mesmo se a VM reiniciar

**Você nunca mais precisa iniciar o sistema manualmente!** 🚀
