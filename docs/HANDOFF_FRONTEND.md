# CartazMarket — passagem do backend para o agente do front

Este documento descreve o backend disponível para o frontend do piloto, os contratos das rotas e os pontos que ainda dependem de dados reais ou decisões da loja. Não contém credenciais. O contrato OpenAPI está em `apps/api/docs/openapi.yaml` e o guia do projeto em `README.md`.

## Objetivo do piloto

Permitir que uma loja importe o catálogo e os preços por CSV, agende promoções, prepare cartazes com o preço registrado, acompanhe a impressão e receba avisos quando cartazes impressos vencerem. O ERP continua sendo a fonte oficial; a API não escreve nele.

## Ambiente local

- API: `http://127.0.0.1:3000`
- Frontend Vite local permitido por padrão no CORS: `http://localhost:5173` e `http://127.0.0.1:5173`.
- Para outra origem, configurar `CORS_ORIGINS` no `.env` como lista separada por vírgulas. Em produção, usar somente a origem real do frontend.
- PostgreSQL local pelo Docker Compose; migrations em `apps/api/migrations`.
- Comandos na raiz: `corepack pnpm install`, `corepack pnpm db:migrate`, `corepack pnpm dev`.
- O token de sessão é do Supabase Auth. Enviar `Authorization: Bearer <access_token>` nas rotas `/v1`.
- A API confere se o usuário autenticado pertence à organização da loja. Não colocar chave Supabase secreta no frontend.

## Fluxo sugerido de telas

1. Entrar com Supabase Auth.
2. Consultar `GET /v1/me` e selecionar uma loja autorizada. Hoje `/v1/me` retorna organizações, não a lista de lojas; a associação loja/organização usada no piloto é configurada no banco.
3. Pesquisar produtos pelo nome e consultar preço atual.
4. Criar uma promoção, ou escolher uma promoção existente.
5. Gerar um cartaz para o produto e conferir a prévia.
6. Imprimir um cartaz ou um lote no navegador; registrar a impressão depois que a pessoa confirmar o resultado.
7. Acompanhar promoções, histórico, alertas e cartazes pendentes de retirada.

## Rotas disponíveis

Todas as rotas `/v1` abaixo exigem o token Bearer e `storeId` de uma loja autorizada ao usuário.

| Método e rota | Uso no frontend |
| --- | --- |
| `GET /health` | Verificar se o processo da API está ativo. |
| `GET /ready` | Verificar se API e PostgreSQL estão acessíveis. |
| `GET /v1/me` | Identidade autenticada e organizações do usuário. |
| `POST /v1/stores/{storeId}/imports/products` | Importar CSV (`Content-Type: text/csv`); exige `owner` ou `manager`. Limite 8 MiB / 50 mil produtos. |
| `GET /v1/stores/{storeId}/products?q=&limit=50&offset=0` | Buscar catálogo e preços atuais. `q` é opcional; limite máximo 100. |
| `GET /v1/stores/{storeId}/imports?status=&limit=50&offset=0` | Histórico de importações. |
| `GET /v1/stores/{storeId}/price-changes?productId=&from=&to=&limit=50&offset=0` | Histórico de alteração de preço; datas ISO com fuso. |
| `GET /v1/stores/{storeId}/promotions?status=&limit=50&offset=0` | Listar promoções; status `scheduled`, `active`, `expired` ou `cancelled`. |
| `POST /v1/stores/{storeId}/promotions` | Criar promoção; exige `owner`/`manager`. Corpo: `productId`, `promotionalAmount` decimal em texto, `startsAt` e `endsAt` ISO com fuso. |
| `POST /v1/stores/{storeId}/promotions/{promotionId}/cancel` | Cancelar promoção; exige `owner`/`manager`. Cartazes impressos ficam pendentes de retirada. |
| `GET /v1/stores/{storeId}/labels?status=&removalDueOnly=&limit=50&offset=0` | Listar cartazes e situação de impressão/retirada. |
| `POST /v1/stores/{storeId}/labels` | Preparar cartaz com `productId`; pode receber `promotionId` para uma promoção futura. Retorna snapshot dos valores. |
| `GET /v1/stores/{storeId}/labels/{labelId}/print?widthMm=100&heightMm=70` | Retorna HTML de impressão, com tamanho configurável de 40 a 300 mm. Só para cartaz `ready_to_print`. |
| `GET /v1/stores/{storeId}/labels/print-batch?labelIds=id1,id2&widthMm=100&heightMm=70` | Retorna HTML de até 50 cartazes, um por página; todos precisam estar `ready_to_print` e pertencer à loja. |
| `POST /v1/stores/{storeId}/labels/{labelId}/printed` | Registrar impressão confirmada; retorna quem registrou e quando. |
| `POST /v1/stores/{storeId}/labels/{labelId}/removed` | Confirmar retirada; resolve os alertas ligados ao cartaz. |
| `GET /v1/stores/{storeId}/alerts?status=unread&limit=50&offset=0` | Listar alertas `unread`, `read` ou `resolved`. |
| `POST /v1/stores/{storeId}/alerts/{alertId}/read` | Marcar alerta como lido. |

## Integração com impressão no navegador

As rotas `/print` devolvem `text/html`, não PDF nem comando proprietário da impressora. Como exigem Bearer token, o frontend deve buscá-las com `fetch` autenticado, criar um `Blob`/URL temporária ou abrir a página com segurança, e então chamar a impressão do navegador a partir de uma ação da pessoa usuária. O tamanho padrão é 100 × 70 mm e pode ser ajustado conforme o papel real.

`window.print()` não informa com segurança se a pessoa imprimiu ou cancelou. Depois de fechar a caixa de impressão, pedir confirmação e só então chamar `/printed`. Para lote, registrar cada etiqueta confirmada. Não presumir sucesso apenas por abrir a prévia.

Ainda não existe envio silencioso à fila, detecção de impressora, status de papel/tinta nem suporte a protocolo de fabricante. Isso depende do modelo e de como a impressora se conecta à máquina da loja; possivelmente exigirá um agente local.

## Regras importantes para UX

- Produto precisa existir no catálogo e ter preço na loja para gerar cartaz.
- Preço promocional tem de ser menor que o preço atual; promoções do mesmo produto não podem se sobrepor.
- Se uma nova importação fizer o preço atual ultrapassar o valor promocional, a criação do cartaz é recusada com `409 PROMOTION_PRICE_OUTDATED`; o gerente deve revisar a promoção.
- Cancelar uma promoção cancela cartazes ainda não impressos e deixa os já impressos imediatamente pendentes de retirada.
- A API cria alerta persistente até 15 segundos após o vencimento de um cartaz impresso. A retirada confirmada resolve o alerta.
- `owner`/`manager` podem importar catálogo e criar/cancelar promoção. Membros autorizados da organização podem consultar catálogo e operar cartazes/alertas.
- Valores monetários vêm como strings decimais; não usar ponto flutuante para editar/preencher valores.
- Paginação: enviar `limit`/`offset` nas listas maiores; máximo 100 itens por página.

## O que ainda não está no backend

- O frontend ainda precisa ser criado/conectado a essas rotas.
- A lista de lojas do usuário e gestão de membros ainda não têm endpoints/tela; o provisionamento precisa ser autorizado pela rede.
- O CSV foi feito para o piloto genérico; falta receber uma exportação real autorizada e ajustar o mapeamento ao ERP.
- O HTML de impressão é genérico. Faltam confirmar dimensões, margens, identidade visual e papel com a loja.
- Não há integração direta com ERP, fila física da impressora, notificações externas nem deploy de produção configurado.
