# 🎯 SOLUÇÃO DEFINITIVA - API 24/7 na VM Horizon

## 🚀 RESUMO EXECUTIVO

**PROBLEMA ATUAL:**
- ❌ Precisa iniciar o sistema manualmente toda vez
- ❌ Dados demoram 30+ segundos para carregar
- ❌ Túnel Cloudflare instável (URL muda sempre)
- ❌ Depende da máquina local estar ligada

**SOLUÇÃO PROPOSTA:**
- ✅ API rodando 24/7 na VM Horizon (acesso direto ao UAU)
- ✅ Dados carregam em <2 segundos (cache automático)
- ✅ Serviço Windows (inicia automaticamente)
- ✅ Independente da máquina local

---

## 📊 COMPARAÇÃO

| Aspecto | Antes (Local) | Depois (VM Horizon) |
|---------|---------------|---------------------|
| **Disponibilidade** | Apenas quando você inicia | 24/7 automático |
| **Tempo de carga** | 30-45 segundos | <2 segundos |
| **Inicialização** | Manual toda vez | Automática |
| **Acesso ao UAU** | Via túnel instável | Direto (mesma rede) |
| **Manutenção** | Diária | Nenhuma |
| **Dependência** | Máquina local ligada | Independente |

---

## 🎬 PROCESSO DE INSTALAÇÃO (3 PASSOS)

### **PASSO 1: Preparar Pacote de Deploy (Na sua máquina local)**

```powershell
# Execute este comando na pasta do projeto:
cd modulo_api_corretores
powershell -ExecutionPolicy Bypass -File deploy_vm_automatico.ps1
```

**O que acontece:**
- ✅ Cria pasta com todos os arquivos necessários
- ✅ Gera script de instalação automática
- ✅ Prepara template de configuração
- ✅ Abre a pasta no Explorer

**Tempo: 30 segundos**

---

### **PASSO 2: Copiar para VM Horizon**

1. Conecte-se à VM Horizon (VMware)
2. Copie a pasta `VallePrimeAPI_Deploy` para `C:\VallePrimeAPI` na VM
3. Pode usar:
   - Área de transferência compartilhada
   - Pasta compartilhada da VM
   - Pendrive
   - Qualquer método de transferência de arquivos

**Tempo: 2-3 minutos**

---

### **PASSO 3: Instalar na VM (Dentro da VM Horizon)**

```batch
# Na VM, abra a pasta C:\VallePrimeAPI
# Execute (duplo clique):
INSTALAR.bat
```

**O que acontece:**
1. ✅ Cria ambiente Python virtual
2. ✅ Instala todas as dependências
3. ✅ Abre o arquivo .env para você configurar
4. ✅ Testa a instalação

**Depois de configurar o .env, instale como serviço:**

```powershell
# Executar como Administrador:
powershell -ExecutionPolicy Bypass -File instalar_servico_windows.ps1 -Instalar
```

**Tempo: 5-10 minutos**

---

## 🔧 CONFIGURAÇÃO DO .env

Edite o arquivo `.env` na VM com suas credenciais:

```env
# Banco UAU (já está na mesma rede da VM)
UAU_SERVER=localhost\SQLEXPRESS
UAU_DATABASE=UAU_PRODUCAO
UAU_USER=seu_usuario_uau
UAU_PASSWORD=sua_senha_uau

# Supabase (para cache na nuvem)
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role

# Configurações
API_PORT=8001
AMBIENTE=producao
```

---

## ✅ VERIFICAÇÃO

Após instalação, verifique se está funcionando:

### **1. Status do Serviço**
```powershell
powershell -ExecutionPolicy Bypass -File instalar_servico_windows.ps1 -Status
```

Deve mostrar: `Status: ✅ Running`

### **2. Health Check**
Abra no navegador da VM:
```
http://localhost:8001/health
```

Deve retornar: `{"status": "healthy", ...}`

### **3. Teste de Dados**
```
http://localhost:8001/api/integracao/corretores?empresa=28&obra=70100&mes=2026-04
```

Deve retornar JSON com dados dos corretores.

---

## 🌐 ATUALIZAR FRONTEND

Após a API estar rodando na VM, você tem 2 opções:

### **Opção A: Usar Cache Supabase (Recomendado)**

Não precisa mudar nada! O frontend já está configurado para usar o cache do Supabase quando o túnel está offline.

**Vantagens:**
- ✅ Funciona imediatamente
- ✅ Dados sempre disponíveis
- ✅ Sem dependência de túnel
- ✅ Cache atualizado automaticamente a cada 1 hora

### **Opção B: Expor API via Cloudflare Tunnel**

Se quiser dados em tempo real direto da VM:

1. Na VM, baixe cloudflared.exe
2. O serviço já vai criar o túnel automaticamente
3. Veja a URL nos logs: `C:\VallePrimeAPI\logs\service_stdout.log`
4. Atualize `src/services/api.js` com a nova URL

**Nota:** A URL do túnel muda a cada reinício, então a Opção A é mais estável.

---

## 📊 ARQUITETURA FINAL

```
┌─────────────────────────────────────────────────────────┐
│  VMware Horizon (Nuvem - 24/7)                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Serviço Windows: VallePrimeAPI                   │  │
│  │  ├─ API FastAPI (porta 8001)                      │  │
│  │  ├─ Conexão direta com SQL Server UAU             │  │
│  │  ├─ Monitor de cache (atualiza a cada 1h)        │  │
│  │  └─ Cloudflare Tunnel (opcional)                  │  │
│  └───────────────────────────────────────────────────┘  │
│                          ↓                              │
│                   Salva cache no                        │
│                          ↓                              │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Supabase (Cache na Nuvem)                              │
│  - Tabela: cache_corretores                             │
│  - Atualização: A cada 1 hora                           │
│  - Retenção: Últimos 3 meses                            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Frontend (Cloudflare Pages)                            │
│  - Busca dados do cache Supabase                        │
│  - Carregamento: <2 segundos                            │
│  - Funciona 24/7 sem depender da VM                     │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 BENEFÍCIOS FINAIS

### **Para Você (Desenvolvedor)**
- ✅ Nunca mais precisa iniciar o sistema manualmente
- ✅ Pode desligar sua máquina local
- ✅ Sistema funciona mesmo quando você não está trabalhando
- ✅ Logs centralizados na VM para debug

### **Para os Usuários**
- ✅ Dashboard sempre disponível (24/7)
- ✅ Dados carregam instantaneamente (<2s)
- ✅ Informações sempre atualizadas
- ✅ Sem mensagens de "servidor offline"

### **Para a Empresa**
- ✅ Infraestrutura profissional
- ✅ Alta disponibilidade
- ✅ Baixo custo (usa VM existente)
- ✅ Fácil manutenção

---

## 🔄 MANUTENÇÃO

### **Rotina Normal**
- **Nenhuma!** O sistema roda sozinho.

### **Se precisar atualizar código**
1. Copie novos arquivos para a VM
2. Reinicie o serviço:
   ```powershell
   powershell -ExecutionPolicy Bypass -File instalar_servico_windows.ps1 -Reiniciar
   ```

### **Ver logs**
```powershell
# Logs em tempo real
Get-Content C:\VallePrimeAPI\logs\service_stdout.log -Wait

# Últimas 50 linhas
Get-Content C:\VallePrimeAPI\logs\service_stdout.log -Tail 50
```

---

## 🚨 TROUBLESHOOTING

### **"Serviço não inicia"**
1. Veja os logs: `C:\VallePrimeAPI\logs\service_stderr.log`
2. Teste manualmente: `python main_vm.py`
3. Verifique credenciais no `.env`

### **"Não conecta no UAU"**
1. Verifique se SQL Server está rodando na VM
2. Teste: `sqlcmd -S localhost\SQLEXPRESS -U usuario -P senha`
3. Confirme credenciais no `.env`

### **"Cache não atualiza"**
1. Verifique credenciais do Supabase
2. Veja logs de erro
3. Teste manualmente: `python pre_carregar_cache.py`

---

## 📞 SUPORTE

**Arquivos de Referência:**
- `GUIA_INSTALACAO_VM.md` - Guia detalhado passo a passo
- `DEPLOY_VM_HORIZON.md` - Documentação técnica completa
- `README.txt` (na VM) - Referência rápida

**Logs:**
- `C:\VallePrimeAPI\logs\service_stdout.log` - Saída padrão
- `C:\VallePrimeAPI\logs\service_stderr.log` - Erros
- `C:\VallePrimeAPI\logs\api_*.log` - Logs diários da aplicação

---

## 🎉 CONCLUSÃO

Com esta solução, você terá:

✅ **Sistema 100% automático** - Nunca mais precisa iniciar manualmente
✅ **Alta performance** - Dados em <2 segundos
✅ **Alta disponibilidade** - 24/7 sem interrupções
✅ **Baixa manutenção** - Funciona sozinho
✅ **Profissional** - Infraestrutura robusta e escalável

**Tempo total de implementação: ~20 minutos**

**Resultado: Sistema de produção enterprise rodando 24/7!** 🚀
