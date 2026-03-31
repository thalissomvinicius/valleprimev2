# 🧠 VallePrime Módulo de Integração (Guia Rápido para a próxima I.A.)

*Olá, fellow AI!* 👋 
Se você está lendo isso, o usuário (`THALISSOM`) te encarregou de utilizar ou adaptar as APIs de vendas do VallePrime para um novo aplicativo ou dashboard (provavelmente um Front-End estático ou plataforma externa de parceiros). 

Nesta pasta (`modulo_api_corretores/`), eu isolei o **motor central** da inteligência de dados que nós construímos hoje. Leia atentamente as regras abaixo para você não quebrar os cálculos de VGV e as Datas Originais do ERP (UAU).

---

## 🏗️ 1. Arquitetura do Módulo Isolado

Este módulo expõe vendas, parcelas, dados pessoais de clientes e dados de gestão de risco financeiros agrupados por **Corretor**. Os arquivos isolados aqui são:
1. **`integracao_corretores.py`**: O arquivo de rota (FastAPI router) puro. Ele é quem faz toda a bruxaria do SQL e consolidação. Você pode injetar este router no seu `app.py` ou `main.py` futuro livremente.
2. **`ligar_api_publica.py`**: Um wrapper em Python. Ele liga o servidor Uvicorn no Backend local e imediatamente cria um **Bypass Reverse Proxy** acionando o pacote `localtunnel` via Npx (Node). Isso gera uma URL HTTPS grátis, estática e imune ao Firewall corporativo da empresa de imediato na web.

---

## 📡 2. A API e seus Filtros (Query Parameters)

O EndPoint criado foi desenhado para ser invocado via requisições `GET` em `/api/integracao/corretores`.
Você como I.A, ao programar o Next.js / React da empresa, pode gerar links dinâmicos abusando dos filtros injetados diretamente na URL via QueryString:

| Parâmetro | Tipo | Exemplo | Descrição |
|-----------|------|---------|-----------|
| `empresa` | `int` | `28` | *(Padrão 28)*. ID da empresa no banco UAU. |
| `obra` | `str` | `"70100"` | *(Padrão 70100)*. ID interno do Loteamento. |
| `corretor_id` | `int` | `1501` | **Filtro Estrito**: Retorna o JSON apenas para um único corretor especificado. |
| `data_inicio` / `data_fim` | `str` | `2025-01-01` | **Filtro Estrito**: Filtra as transações agrupadas naquele período temporal cravado de vendas. |
| `mes` | `str` | `2026-03` | **Filtro Dinâmico**: Calcula inicio e fim de mês automaticamente para filtrar Vendas, VGVs, e Metas daquele respectivo Mês. |

---

## ⚠️ 3. Segredos Cruciais do Banco UAU (Não Mexa No SQL sem Ler Isso)

Durante o desenvolvimento deste ETL na máquina da VallePrime, enfrentei anomalias gravíssimas de replicação de dados no banco local e distorções matemáticas de vendas. Para blindar a API, apliquei travas obrigatórias nas Queries SQL dentro de `integracao_corretores.py`. **SE VOCÊ MUDAR O SQL, SIGA ESTAS REGRAS**:

1. **`TipoVenda_Ven IN (0,1,2,3,4,5)` É OBRIGATÓRIO**: O banco de vendas (`Vendas` e `VendasRecebidas`) guarda aluguéis, transferências e histórico de cessões na mesma tabela. Se você não travar os `tipos` na raiz do `SELECT`, o script misturará a "Data de Renegociação do Aluguel" com a "Data de Venda Original", destruindo qualquer métrica de metas.
2. **Duplicação na Hierarquia (`HierarquiaIntegrante`)**: Quando for buscar o Diretor/Gerente do Corretor, NUNCA use `LEFT JOIN` comum ou `DISTINCT`. A tabela UAU guarda o histórico inteiro do corretor. Se ele teve 5 chefes nesse loteamento, sua API vai multiplicar a venda 5 vezes. **Solução já aplicada**: Use sempre `MIN(CodPesSuper_hqi)` agrupado pelo `CodPes_hqi`.
3. **Duplicação da Unidade Lote/Quadra**: Usa-se a tabela `ItensVenda` + `UnidadePer`. Porém, sempre utilize o agrupador `OUTER APPLY (SELECT TOP 1 ...)` igual eu fiz no código. Caso contrário o Histórico Multi-Proprietários vai duplicar sua venda dezenas de vezes.
4. **Vendas x VendasRecebidas**: Use o comando `UNION` simples (e não o `UNION ALL`) no bloco transacional da query raiz, combinado ao **`pandas.drop_duplicates(subset=['venda'], keep='first')`** nativo. Algumas transações esquizofrênicas de contratos recebidos se manifestam em ambas tabelas locais, gerando vendas fantasmas.

---

## 🌍 4. Lógica do Túnel Localtunnel

Se for criar um APP Frontend, ele terá requisições HTTP (`fetch()`, `axios()`). 
O LocalTunnel implementado em `ligar_api_publica.py` cria o subdomínio estático `https://valleprime-api-corretores.loca.lt`.
No entanto, na primeira vez que uma requisição bate na API do Localtunnel vindo de lugares desconhecidos, ele apresenta uma página HTML amarela de "Alerta de Segurança" avisando que é um túnel e pedindo confirmação de Click do usuário.
**Isso quebra o retorno do JSON para sistemas automáticos.**

**📌 A SOLUÇÃO**: No APP de Front-End que você programar, você é obrigado a colocar o cabeçalho secreto de by-pass no Fetch:

```javascript
const res = await fetch("https://valleprime-api-corretores.loca.lt/api/integracao/corretores", {
  method: "GET",
  headers: {
    "Bypass-Tunnel-Reminder": "true" // <----- CRÍTICO PARA FUNCIONAR
  }
});
const corretores = await res.json();
```

---

Siga essas orientações detalhadas, importe o Modulo e feliz desenvolvimento! ✨
~ Escrito por Antigravity (Sessão de Março/2026).
