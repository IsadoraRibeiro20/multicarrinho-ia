# Multicarrinho: guia para agentes de código

Protótipo de delivery com comparação de cardápios e um agente de IA que monta pedidos. Leia `docs/arquitetura.md` antes de mudar a estrutura.

## Comandos

- `npm run dev`: Vite (5173) + Express (3001) com recarga.
- `npm test`: testes em `tests/` com `node:test`. Rode depois de qualquer mudança em `shared/`, `server/` ou `data/`.
- `npm run build`: build do front-end em `dist/`.

## Regras do projeto

- Preço, taxa e total são sempre calculados por `shared/catalog.js`. Nunca exiba um valor vindo da IA.
- Toda resposta do agente passa por `shared/normalize.js` antes de chegar à interface.
- A interface precisa funcionar sem `ANTHROPIC_API_KEY`: o motor local é o caminho de reserva.
- O carrinho aceita uma loja por vez. Comparação acontece em Cardápios.
- Textos da interface e da documentação em português do Brasil.
- Não coloque a chave da API em código, testes ou commits. Ela vem de `.env`.

## Onde mexer

- Novo dado de loja: `data/stores.json` (formato em `docs/dados.md`).
- Comportamento do agente: `server/agent/prompt.js` e `server/agent/tools.js`.
- Telas: `src/main.js` (funções `render*`) e `src/styles.css` (tokens no `:root`).
