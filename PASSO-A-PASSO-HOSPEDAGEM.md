# Passo a passo – Como hospedar o Site Disponibilidade

Siga na ordem. Você vai usar **3 serviços**: Supabase (banco), Render (API), Cloudflare Pages (site).

---

## Parte A – Banco de dados (Supabase)

**Por quê primeiro:** a API no Render precisa da URL e da chave do Supabase para login e cadastro funcionarem e não perderem dados.

1. Acesse **https://supabase.com** e faça login (crie conta se precisar).
2. Clique em **New Project**.
   - Dê um nome (ex.: `valleprime-disp`).
   - Crie uma senha do banco e guarde.
   - Escolha a região e clique em **Create new project**.
3. Espere o projeto ficar pronto (alguns minutos).
4. No menu lateral, vá em **Settings** (ícone de engrenagem) → **API**.
5. Anote e guarde:
   - **Project URL** (ex.: `https://abcdefgh.supabase.co`) → será a variável **SUPABASE_URL**.
   - Em **Project API keys**, a chave **service_role** (secret) → será a variável **SUPABASE_SERVICE_ROLE_KEY**.
6. No menu lateral, abra **SQL Editor**.
7. Clique em **New query** e cole o SQL abaixo. Depois clique em **Run**.

```sql
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

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow service role" ON clients FOR ALL USING (true);
CREATE POLICY "Allow service role" ON users FOR ALL USING (true);
```

8. Confirme que não deu erro. Pronto, banco configurado.

---

## Parte B – API no Render

1. Acesse **https://render.com** e faça login (crie conta se precisar).
2. Conecte seu **GitHub** (ou GitLab): **Account Settings** → **Connect** no GitHub.
3. No **Dashboard**, clique em **New +** → **Web Service**.
4. Conecte o **repositório** onde está o projeto (a pasta com `api/`, `requirements.txt`, `src/`, etc.).
   - Se o projeto está dentro de uma pasta (ex.: `DISP`), no campo **Root Directory** coloque: `DISP`.
   - **Branch:** `main` (ou a que você usa).
5. Preencha:
   - **Name:** `valleprimev2-api` (ou outro nome).
   - **Region:** escolha a mais próxima (ex.: Oregon).
   - **Runtime:** **Python 3**.
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 4 api.index:app`
6. Clique em **Advanced** e vá em **Environment** (ou **Environment Variables**).
7. Adicione estas variáveis (uma por uma, **Add**):

   | Key | Value |
   |-----|--------|
   | `SECRET_KEY` | Clique em **Generate** para criar uma chave aleatória |
   | `SUPABASE_URL` | A **Project URL** que você anotou do Supabase (ex.: `https://xxxxx.supabase.co`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | A chave **service_role** que você anotou do Supabase |

8. Clique em **Create Web Service**.
9. Espere o primeiro deploy terminar (pode levar alguns minutos).
10. Quando aparecer **Live** (verde), copie a **URL do serviço** (ex.: `https://valleprimev2-api.onrender.com`).  
    **Guarde essa URL** – você vai usar no próximo passo (Cloudflare).

---

## Parte C – Site (frontend) no Cloudflare Pages

1. Acesse **https://dash.cloudflare.com** e faça login.
2. No menu lateral: **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Conecte o **GitHub** (ou GitLab) e autorize o Cloudflare.
4. Selecione o **mesmo repositório** do projeto.
5. Em **Configure build**:
   - **Project name:** ex. `valleprimev2`
   - **Production branch:** `main`
   - **Framework preset:** **None** (ou Vite, se aparecer)
   - **Build command:** `npm install && npm run build`
   - **Build output directory:** `dist`
   - Se o código está numa pasta (ex.: `DISP`), em **Root directory** coloque: `DISP`
6. (Opcional) Em **Environment variables**, não é obrigatório preencher nada se você usar o proxy no passo 7.
7. **Antes de dar Save and Deploy:**  
   No seu projeto, edite o arquivo **`public/_redirects`** e coloque a **URL do seu serviço no Render** (sem `https://`), por exemplo:
   - Se a URL do Render for `https://valleprimev2-api.onrender.com`, o conteúdo do arquivo deve ser:

   ```
   /api/* https://valleprimev2-api.onrender.com/api/:splat 200
   /* /index.html 200
   ```

   Troque `valleprimev2-api.onrender.com` pela URL real que você copiou no passo 10 da Parte B. Salve e faça commit + push no Git.
8. Volte no Cloudflare e clique em **Save and Deploy**.
9. Espere o build terminar. A URL do site será algo como: `https://valleprimev2.pages.dev` (ou o nome que você deu).

---

## Parte D – Testar

1. Abra a URL do site no Cloudflare Pages (ex.: `https://valleprimev2.pages.dev`).
2. Faça **login** com:
   - Usuário: `admin`  
   - Senha: `admin123`
3. Cadastre um cliente de teste.
4. Atualize a página (F5): o cliente deve continuar lá e o login deve permanecer.

Se algo der errado, confira a seção **Erros comuns** no arquivo **DEPLOY.md** no projeto.

---

## Resumo rápido

| Onde | O que fazer |
|------|-------------|
| **Supabase** | Criar projeto → Settings → API (anotar URL e service_role) → SQL Editor (rodar o SQL das tabelas) |
| **Render** | New Web Service → repo + branch → Build/Start como acima → Environment: SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY → anotar URL do serviço |
| **Cloudflare Pages** | Connect Git → mesmo repo → Build: `npm run build`, output: `dist` → Editar `public/_redirects` com a URL do Render → Deploy |

Pronto. Com isso o projeto fica hospedado e com login e cadastro funcionando em produção.
