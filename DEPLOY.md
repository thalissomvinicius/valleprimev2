# VallePrime V2 - Guia de Implantação 24/7 (100% Grátis)

Este sistema migrou do Railway (Pago) para uma arquitetura híbrida **Render (Cloud) + Local Sync Agent (Seu PC)**, garantindo custo zero e monitoramento de alta frequência (1s).

## 1. Arquitetura do Sistema
- **Backend (Nuvem)**: Hospedado no **Render** (Free). Gerencia Clientes, Propostas (PDF) e Autenticação.
- **Banco de Dados**: **Supabase** (Free). Armazena todos os dados persistentes e cache do corretor.
- **Sync Agent (Local)**: Script Python rodando no seu computador (com acesso ao UAU). Sincroniza dados e monitora lotes a cada 1 segundo.
- **Frontend**: **Cloudflare Pages** (Free). Interface do usuário sempre online.

## 2. Preparação do Servidor Local (Ponte UAU)
Para que o sistema monitore as vendas e atualize o dashboard em tempo real, mantenha o script local ligado:

1.  Certifique-se de que o **Python 3.10+** está instalado.
2.  Instale as dependências: `pip install -r requirements.txt`.
3.  **Execução**:
    ```bash
    python LIGAR_VALLEPRIME_LOCAL.py
    ```
    *Este script iniciará a API de Ponte Local e o Monitor de 1s (UAU -> Supabase).*

## 3. Implantação na Nuvem (Render)
1.  Crie uma conta no [Render.com](https://render.com).
2.  Conecte seu repositório do GitHub.
3.  O Render detectará o arquivo `render.yaml` automaticamente.
4.  **Variáveis de Ambiente Necessárias (Dashboard do Render):**
    - `SUPABASE_URL`: Sua URL do Supabase.
    - `SUPABASE_SERVICE_ROLE_KEY`: Sua chave privada do Supabase.
    - `SECRET_KEY`: Uma senha forte aleatória para os tokens JWT.

## 4. Banco de Dados (Supabase)
Se você ainda não configurou as tabelas, execute este SQL no editor do Supabase:

```sql
-- Clientes
CREATE TABLE IF NOT EXISTS clients (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  cpf_cnpj TEXT NOT NULL,
  tipo_pessoa TEXT NOT NULL DEFAULT 'PF',
  created_by TEXT,
  data TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usuários
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nome TEXT,
  role TEXT DEFAULT 'user',
  permissions TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cache de Lotes/Corretores
CREATE TABLE IF NOT EXISTS cache_corretores (
  id BIGSERIAL PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  empresa INTEGER,
  obra TEXT,
  mes TEXT,
  dados_json TEXT,
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);
```

## 5. Frontend (Cloudflare Pages)
O frontend já está configurado para apontar para o Render (`valleprimev2-api.onrender.com`).
1.  Conecte o diretório `site-disponibilidade` ao Cloudflare Pages.
2.  Build Command: `npm run build`
3.  Output: `dist`

## 6. Monitoramento e Alertas
- Os logs de alertas de vendas (monitor de 1s) são salvos localmente em `alerts_history.csv` e sincronizados com o dashboard.
- Alertas críticos aparecem no console do `LIGAR_VALLEPRIME_LOCAL.py`.
