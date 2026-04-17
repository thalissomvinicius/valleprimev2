<div align="center">
  <img src="https://img.shields.io/badge/REACT-20232a?style=for-the-badge&logo=react&logoColor=61DAFB" />
  <img src="https://img.shields.io/badge/VITE-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/VERCEL-000000?style=for-the-badge&logo=vercel&logoColor=white" />
</div>

<h1 align="center">Valle Prime - DispoSystem 🏙️</h1>

<div align="center">
  <p><strong>Sistema de Gestão e Disponibilidade de Lotes em Tempo Real</strong></p>
  <p>Uma solução moderna para corretores e imobiliárias visualizarem, simularem e gerenciarem vendas.</p>
  <br />
</div>

---

### 🚀 Sobre o Projeto

O **Valle Prime DispoSystem** foi desenvolvido para solucionar um problema crítico no mercado imobiliário: a falta de informações atualizadas em tempo real para corretores em campo. Com ele, a equipe de vendas tem acesso instantâneo ao status de cada lote (Disponível, Vendido, Reservado), tabela de preços atualizada e simulador de pagamentos.

### ✨ Funcionalidades Principais

*   📊 **Dashboard de Disponibilidade**: Tabela interativa com status codificado por cores (🟢 Disponível, 🔴 Vendido, 🟡 Reservado).
*   💰 **Simulador Financeiro (Modal Inteligente)**:
    *   Cálculo automático de entrada mínima.
    *   Simulação de parcelas em diferentes planos (Fixas, Reajustáveis).
    *   Aplicação de descontos dinâmicos.
*   📱 **Mobile-First**: Design 100% responsivo para uso em celulares durante visitas aos lotes.
*   📄 **Geração de Propostas**:
    *   Exportação para PDF com um clique.
    *   Envio formatado direto para o WhatsApp do cliente.
*   ⚡ **Alta Performance**: Otimizado com Vite para carregamento instantâneo.

---

### 🛠️ Tech Stack & Arquitetura

*   **Frontend Core**: React 19, Vite.
*   **Estilização**: CSS Modules (Design System próprio "Premium UI").
*   **Gerenciamento de Estado**: Context API (Auth & Data).
*   **Ferramentas**: `jspdf` (Relatórios), `lucide-react` (Ícones), `Vercel Analytics` (Métricas).
*   **Integração**: Consumo de API REST com tratamento de CORS via Proxy reverso na Vercel.

---

### 📸 Prévias

*(Você pode adicionar prints das telas aqui depois)*

---

### 🔧 Instalação e Uso Local

**Pré-requisitos:** Node.js, Python 3 e `pip install -r requirements.txt` (na pasta do projeto).

Abra **dois terminais** na pasta do projeto:

**Terminal 1 – API (Flask na porta 5000):**
```bash
npm run start:api
```
*(Ou: `python api/index.py`)*

**Terminal 2 – Frontend (Vite na porta 5173):**
```bash
npm install
npm run dev
```

Acesse **http://localhost:5173**. O frontend usa o proxy do Vite e envia as chamadas `/api` para o Flask em `localhost:5000`.  
Login inicial: Entre em contato com a diretoria para obter o usuário Administrador padrão.

---

<div align="center">
  <p>Desenvolvido com 💙 por <strong>Vinicius Dev</strong></p>
  <a href="https://linkedin.com/in/thalissomvinicius">
    <img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn" />
  </a>
</div>
