<div align="center">
  <img src="https://img.shields.io/badge/REACT-20232a?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/VITE-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/VERCEL-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel" />
  <img src="https://img.shields.io/badge/SUPABASE-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
</div>

<h1 align="center">Valle Prime - DispoSystem 🏙️</h1>

<div align="center">
  <p><strong>Plataforma Corporativa de Gestão e Disponibilidade de Lotes em Tempo Real</strong></p>
  <p>Solução definitiva e de alta performance desenvolvida para imobiliárias e construtoras.</p>
  <br />
</div>

---

### 🚀 Visão Geral do Sistema

O **Valle Prime DispoSystem** foi arquitetado sob medida para solucionar o *delay* de informações no mercado imobiliário. Esta plataforma entrega dados atualizados em milissegundos para a ponta de vendas (corretores), garantindo que a equipe em campo opere com total sincronia com a base de dados interna da construtora (Banco UAU).

### ✨ Arquitetura e Funcionalidades

*   📊 **Mapa de Disponibilidade Real-Time**: Interface fluida com *color-coding* preciso (🟢 Livre, 🔴 Vendido, 🟡 Reservado).
*   💰 **Motor de Simulação Financeira**:
    *   Algoritmos dinâmicos de cálculo de entrada e coeficiente de financiamento.
    *   Suporte a planos lineares e reajustáveis.
    *   Integração direta com envio automatizado de propostas via WhatsApp.
*   📈 **Dashboard de Performance Híbrido**:
    *   Acompanhamento de VGV, taxa de inadimplência e metas.
    *   Túnel seguro em FastAPI que extrai diretamente do SQL Server interno (UAU) para o Frontend.
*   🤖 **ValleBot - Assistente de Atendimento**:
    *   Robô flutuante integrado ao sistema para auxílio operacional em tempo real à equipe de corretores, reduzindo gargalos de suporte técnico.
*   📄 **Geração de Documentos Inteligente**:
    *   Geração de Extratos de Vendas, Relatórios de Inadimplência e Propostas em PDF parametrizados com a marca Valle Prime.
*   🛡️ **Painel de Controle e Autorização**:
    *   ACL (*Access Control List*) avançado para gerenciar Permissões por Grupo e Visibilidade de Empreendimentos individuais (Cloudflare/Supabase).

---

### 🛠️ Tech Stack Estrutural

*   **Frontend Core**: React 19, Hooks (useMemo, useCallback), Context API.
*   **Build & Bundler**: Vite (Otimização Server-Side, Code Splitting).
*   **Engine de Estilos**: CSS Modular e Design System responsivo *"Premium UI"*.
*   **Database & Auth**: Supabase (PostgreSQL), JWT, Middlewares de Segurança.
*   **API & Túnel de Dados Locais**: FastAPI (Python), Cloudflare Tunnels (Zero Trust).
*   **Distribuição / Hospedagem**: Vercel Edge Network.

---

### 🔧 Instalação e Execução de Ambiente

**Componentes necessários:** Node.js (v18+).

**Iniciando a aplicação (Frontend):**
```bash
# Clone o repositório e instale dependências
$ npm install

# Execute o servidor local com hot-reload (Vite)
$ npm run dev
```

> **Aviso de Acesso:**
> Esta é uma aplicação corporativa fechada. O acesso à interface de produção (`/dashboard`) ou funções de API (`/api/consulta/*`) dependem da autorização prévia por JWT e chaves simétricas.
> 
> *Credenciais de Teste / Login Default:* Entre em contato com a Diretoria Administrativa (Vinicius Dev) para solicitar suas chaves de homologação.

---

<div align="center">
  <p>Engenharia de Software por <strong>Vinicius Dev</strong></p>
  <a href="https://linkedin.com/in/thalissomvinicius">
    <img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn" />
  </a>
</div>
