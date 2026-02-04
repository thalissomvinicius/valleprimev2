# Guia de hospedagem – Site Disponibilidade Valle Prime

Este projeto funciona com **backend (API)** e **frontend (React)** separados. Para evitar erros de login e cadastro em produção, siga este guia.

---

## Onde hospedar

| Parte      | Serviço recomendado   | Por quê |
|------------|------------------------|---------|
| **API**    | [Render](https://render.com) | Python/Flask, gratuito, suporta Gunicorn e variáveis de ambiente |
| **Frontend** | [Cloudflare Pages](https://pages.cloudflare.com) | React/Vite, gratuito, proxy para a API e deploy por Git |

---

## 1. Backend (API) no Render

### 1.1 Conta e repositório

1. Crie uma conta em [render.com](https://render.com).
2. Conecte seu repositório Git (GitHub/GitLab).  
   **Importante:** o código do projeto deve estar na **raiz** do repositório (ou use a pasta `DISP` como raiz do repo).
3. Em **Dashboard** → **New** → **Web Service**.
4. Selecione o repositório e a branch (ex.: `main`).

### 1.2 Configuração do serviço

- **Name:** `valleprimev2-api` (ou outro nome).
- **Region:** Oregon (US West) ou o mais próximo.
- **Root Directory:** deixe em branco se o projeto está na raiz; se o repo tem uma pasta `DISP`, use `DISP`.
- **Runtime:** Python 3.
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 4 api.index:app`
- **Plan:** Free.

### 1.3 Variáveis de ambiente (Environment)

Em **Environment** do serviço, adicione:

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `SECRET_KEY` | Sim | Chave para JWT. No Render: **Generate** para criar uma aleatória. |
| `SUPABASE_URL` | Sim* | URL do projeto Supabase (ex.: `https://xxxxx.supabase.co`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim* | Chave "service_role" do Supabase (Settings → API). |

\* **Login e cadastro em produção:** sem Supabase, o Render usa disco efêmero e **perde usuários e clientes** a cada deploy/reinício. Para persistência, use Supabase.

### 1.4 Deploy

Clique em **Create Web Service**. Anote a URL do serviço (ex.: `https://valleprimev2-api.onrender.com`).  
Use essa URL como base da API (ex.: `https://valleprimev2-api.onrender.com/api/...`).

---

## 2. Banco de dados (Supabase) – login e cadastro persistentes

### 2.1 Criar projeto

1. Acesse [supabase.com](https://supabase.com) e crie um projeto.
2. Em **Settings** → **API** anote:
   - **Project URL** → use em `SUPABASE_URL`
   - **service_role** (secret) → use em `SUPABASE_SERVICE_ROLE_KEY`

### 2.2 Criar tabelas

No Supabase, abra **SQL Editor** e execute:

```sql
-- Tabela de clientes
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

-- Tabela de usuários (login)
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

-- Habilitar RLS (opcional); a API usa service_role que ignora RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Política para a API (service_role bypassa; use se conectar com anon key em outro app)
CREATE POLICY "Allow service role" ON clients FOR ALL USING (true);
CREATE POLICY "Allow service role" ON users FOR ALL USING (true);
```

Depois disso, o backend passará a usar Supabase para usuários e clientes, e login/cadastro permanecem após deploys.

---

## 3. Frontend no Cloudflare Pages

### 3.1 Conectar repositório

1. Acesse [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Escolha o repositório e a branch (ex.: `main`).

### 3.2 Configuração do build

- **Project name:** ex. `valleprimev2`
- **Production branch:** `main`
- **Framework preset:** None (ou Vite, se aparecer).
- **Build command:** `npm install && npm run build`
- **Build output directory:** `dist`
- **Root directory:** deixe em branco se o projeto está na raiz; se o repo tem pasta `DISP`, use `DISP`.

### 3.3 Variáveis de ambiente (opcional)

- Se o frontend vai chamar a API **diretamente** (sem proxy), adicione:
  - **Variable name:** `VITE_API_BASE`
  - **Value:** `https://valleprimev2-api.onrender.com` (a URL do seu serviço no Render, **sem** barra no final).
- Se usar **proxy** (arquivo `_redirects` abaixo), pode deixar `VITE_API_BASE` em branco.

### 3.4 Proxy da API (recomendado)

Para que as chamadas `/api/*` do frontend passem pelo mesmo domínio e evitem CORS, use o arquivo **`public/_redirects`** com o conteúdo:

```
/api/*  https://VALLEPRIMEV2-API.onrender.com/api/:splat  200
/*     /index.html  200
```

Substitua `VALLEPRIMEV2-API.onrender.com` pela URL real do seu backend no Render (sem `https://`).  
Exemplo: se a API é `https://valleprimev2-api.onrender.com`, a linha fica:

```
/api/*  https://valleprimev2-api.onrender.com/api/:splat  200
/*     /index.html  200
```

Assim, o frontend usa apenas o domínio do Pages e o Cloudflare redireciona `/api/*` para o Render.

### 3.5 Deploy

Salve e faça o deploy. A URL do site será algo como `https://valleprimev2.pages.dev` (ou seu domínio customizado).

---

## 4. Resumo – checklist

- [ ] **Render:** Web Service criado, Build/Start conforme acima, variáveis `SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` definidas.
- [ ] **Supabase:** Projeto criado, tabelas `clients` e `users` criadas com o SQL acima, URL e `service_role` copiados para o Render.
- [ ] **Cloudflare Pages:** Build com `npm run build`, output `dist`, `public/_redirects` apontando para a URL do Render.
- [ ] **Teste:** Abrir o site no Pages, fazer login (ex.: `admin` / `admin123`) e cadastrar um cliente; conferir se continua após refresh e após novo deploy.

---

## 5. Erros comuns e soluções

| Erro | Causa provável | Solução |
|------|----------------|---------|
| Login não funciona em produção | API em outro domínio sem CORS ou proxy | Usar `_redirects` no Pages (proxy) ou configurar CORS no Flask; já está `origins: "*"` no código. |
| Cadastro de clientes some após deploy | Banco em disco efêmero no Render | Usar Supabase e preencher `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no Render. |
| 502 / timeout no Render | Plano free “dorme” após inatividade | Primeira requisição pode demorar; usuário pode tentar de novo. Considerar plano pago para sempre ativo. |
| Frontend chama API e dá CORS ou 404 | URL da API errada ou proxy incorreto | Conferir `VITE_API_BASE` (se usado) e conteúdo de `public/_redirects` com a URL correta do Render. |
| "Resposta HTML recebida" no frontend | `VITE_API_BASE` apontando para página de erro ou URL errada | Ajustar para a URL exata do serviço no Render (ex.: `https://valleprimev2-api.onrender.com`) ou deixar vazio e usar só o proxy. |

---

## 6. Desenvolvimento local

- **API:** na pasta do projeto, `pip install -r requirements.txt` e `python -m flask --app api.index run --port 5000` (ou `python api/index.py` se tiver `if __name__ == '__main__'`).
- **Frontend:** `npm install && npm run dev`. O Vite faz proxy de `/api` para `http://localhost:5000`.
- Para testar com “produção local”, defina `VITE_API_BASE=` (vazio) e use o proxy; ou defina a URL do Render para testar contra a API hospedada.

Com isso, o script fica organizado para hospedagem e sem erros de login e cadastro quando Supabase e variáveis estiverem configurados corretamente.
