# Agentes

## Agente Montador (implementado)

**Objetivo:** transformar um pedido em linguagem natural em até 3 montagens, cada uma numa loja diferente, dentro do orçamento e com comida suficiente.

**Onde:** `server/agent/montador.js`, instruções em `server/agent/prompt.js`.

**Como funciona:** usa o Tool Runner do SDK da Anthropic (`client.beta.messages.toolRunner`). O SDK chama o modelo, executa as ferramentas pedidas e devolve o resultado até o agente terminar (no máximo 8 rodadas).

### Ferramentas

| Ferramenta | Entrada | Saída | Por que existe |
|---|---|---|---|
| `buscar_lojas` | `categoria?` | lojas com taxa, tempo e nota | O agente descobre onde procurar sem receber o catálogo inteiro. |
| `ver_cardapio` | `loja_id` | itens com preço, tipo e porções | Escolher só itens que existem. |
| `calcular_pedido` | `loja_id`, `itens[]` | subtotal, taxa, total, pessoas servidas, itens inválidos | Conferir orçamento e porções com cálculo feito em código. |

### Proteções

- **Saída validada:** `shared/normalize.js` descarta qualquer loja ou item fora do catálogo.
- **Preço sempre do código:** a interface recalcula o total com `shared/catalog.js`.
- **Entrada limitada:** mensagem até 500 caracteres; histórico com as 6 últimas mensagens.
- **Uso limitado:** 20 pedidos por IP a cada 10 minutos (configurável).
- **Recusas:** `fallbacks: "default"` faz a API tentar um modelo de reserva; se ainda assim houver recusa, o servidor responde `recusado` e a interface usa o motor local.
- **Chave protegida:** só existe no servidor.

### Configuração do modelo

| Parâmetro | Valor | Motivo |
|---|---|---|
| `model` | `claude-opus-5-5` (ou `CLAUDE_MODEL`) | Padrão recomendado; pode ser trocado por variável de ambiente. |
| `output_config.effort` | `medium` | Tarefa curta de escolha e conferência. |
| `max_tokens` | 16000 | Margem para o raciocínio e o JSON final. |
| `max_iterations` | 8 | Limita o número de rodadas de ferramentas. |

### Exemplo de execução

1. Pedido: "sushi pra dois até R$ 90".
2. `buscar_lojas({categoria: "japonesa"})` → Sushi CWB.
3. `ver_cardapio({loja_id: "sushi-cwb"})` → 8 itens.
4. `calcular_pedido({loja_id: "sushi-cwb", itens: [{id: "sc4", qtd: 1}]})` → total R$ 60,89, serve 2.
5. Resposta final em JSON → validada → exibida com preço recalculado.

## Próximos agentes (propostos)

| Agente | Área | O que faria |
|---|---|---|
| **Comparador** | Produto | Explica a diferença entre cardápios salvos ("a opção B custa R$ 5 a mais, mas inclui sobremesa e chega 10 min antes"). |
| **Analista de conversão** | Comercial | Lê eventos de uso (cardápios criados, trocas de loja, pedidos) e aponta em que passo as pessoas desistem. |
| **Parceiro** | Comercial | Sugere ao restaurante combos que aparecem muito nas comparações e perdem por preço. |

## Avaliação

O motor local (`shared/local-engine.js`) funciona como linha de base. Para medir o agente, a ideia é um conjunto de pedidos de teste com critérios verificáveis: itens existem, orçamento respeitado, porções suficientes, lojas coerentes com o pedido.
