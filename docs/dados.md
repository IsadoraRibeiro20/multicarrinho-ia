# Dados fictícios

Arquivo: `data/stores.json`. 5 lojas de Curitiba e 37 itens, todos inventados para o protótipo.

## Loja

| Campo | Tipo | Exemplo | Descrição |
|---|---|---|---|
| `id` | string | `"sushi-cwb"` | Identificador único. |
| `nome` | string | `"Sushi CWB"` | Nome exibido. |
| `culinaria` | string | `"Japonesa"` | Rótulo da culinária. |
| `cats` | string[] | `["japonesa", "mar"]` | Categorias para filtro: `mar`, `japonesa`, `pizza`, `burger`, `massa`. |
| `taxa` | number | `5.99` | Taxa de entrega em reais. |
| `tempo` | [number, number] | `[40, 50]` | Faixa de tempo de entrega em minutos. |
| `nota` | number | `4.8` | Avaliação de 0 a 5. |
| `itens` | Item[] | | Cardápio. |

## Item

| Campo | Tipo | Exemplo | Descrição |
|---|---|---|---|
| `id` | string | `"sc4"` | Único em todo o catálogo. |
| `nome` | string | `"Combinado 20 peças"` | Nome exibido. |
| `desc` | string | `"Seleção do chef para dois"` | Descrição curta. |
| `preco` | number | `54.9` | Preço em reais. |
| `serve` | number | `2` | Quantas pessoas o item alimenta. |
| `tipo` | string | `"prato"` | `prato`, `acomp`, `bebida` ou `doce`. |
| `tags` | string[] | `["japonesa", "mar"]` | Usadas pelo motor local para casar o pedido. |

## Lojas

| id | Culinária | Taxa | Tempo | Itens |
|---|---|---|---|---|
| `burger-x` | Lanches | R$ 6,99 | 30–40 min | 8 |
| `sushi-cwb` | Japonesa | R$ 5,99 | 40–50 min | 8 |
| `pizza-boa` | Pizzaria | R$ 4,99 | 35–45 min | 6 |
| `mar-aberto` | Frutos do mar e poke | R$ 7,99 | 30–40 min | 8 |
| `cantina-nonna` | Massas | R$ 6,49 | 45–55 min | 7 |

Para adicionar uma loja, inclua um objeto no array respeitando os campos acima e rode `npm test`: o teste confere se os ids continuam únicos.
