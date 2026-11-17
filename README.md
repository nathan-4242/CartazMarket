# CartazMarket

Aplicação web e backend do piloto CartazMarket. O foco do backend é receber uma planilha autorizada, validar tudo antes da publicação e manter histórico de preços sem escrever no ERP.

Se você está desenvolvendo o frontend, comece pelo [handoff do backend](docs/HANDOFF_FRONTEND.md). O trabalho pendente está organizado nos [issues do GitHub](https://github.com/nathan-4242/CartazMarket/issues).

## Arquitetura

```text
Frontend React em `apps/web`
  └── Supabase Auth emite token de usuário
        └── API Fastify valida o token via JWKS e confere associação/loja
              └── PostgreSQL próprio guarda catálogo, preços e histórico

ERP da rede ── exportação CSV autorizada ──> API (staging → publicação atômica)
```

O backend é um monólito modular em TypeScript: simples de operar no piloto, com limites claros entre autenticação, importação, catálogo, promoções e cartazes. O ERP continua como fonte oficial e é somente leitura nesta fase. A API nunca recebe senha ou acesso direto ao banco do ERP.

## O que já está implementado

- Aplicação web em `apps/web` com editor, impressão A2–A6, PNG/PDF, autenticação Supabase, busca de produtos, promoções e cartazes. O progresso e as pendências estão em `docs/FRONTEND_PHASE_1.md` a `docs/FRONTEND_PHASE_4.md`.

- Health checks em `/health` e `/ready`.
- Validação de tokens Supabase Auth usando JWKS (sem chave de serviço no cliente).
- `GET /v1/me` lista a identidade e as organizações do usuário.
- Consulta do catálogo e dos preços atuais por loja, com busca e limite de resultados.
- `POST /v1/stores/:storeId/imports/products` recebe CSV, permitido a `owner`/`manager` da organização.
- Validação de cabeçalhos em português/inglês, delimitador por vírgula ou ponto e vírgula, códigos duplicados, preço e limites de arquivo/linhas.
- Publicação transacional: ou todo o catálogo/preço é atualizado, ou os preços anteriores permanecem; cada mudança fica registrada em `price_change_events`.
- Consulta do histórico de importações e das alterações de preço.
- Criação, consulta, validação de sobreposição e cancelamento de promoções.
- Geração do registro/snapshot do cartaz, confirmação de impressão e retirada.
- Alertas persistentes de retirada, leitura e resolução automática após a confirmação da retirada.
- Identificação do usuário que cancelou a promoção, confirmou impressão/retirada ou leu o alerta.
- Migrations SQL versionadas com checksum.

## Requisitos

- Node.js 22 ou superior
- Corepack (para usar a versão de pnpm declarada pelo projeto)
- Docker Desktop ou uma instância PostgreSQL 17 acessível

## Preparar o ambiente

1. Copie `.env.example` para `.env` na raiz e ajuste os valores se necessário.
2. Suba o banco local com `docker compose up -d postgres`.
3. Instale as dependências com `corepack pnpm install`.
4. Configure `SUPABASE_URL` no `.env` para autenticação. Sem isso, a API sobe, mas as rotas autenticadas respondem que a autenticação não foi configurada.
5. Ajuste `CORS_ORIGINS` para a origem do frontend (por padrão, `http://localhost:5173` e `http://127.0.0.1:5173` em desenvolvimento).
6. Aplique as migrations com `corepack pnpm db:migrate`.
7. Inicie a API em desenvolvimento com `corepack pnpm dev`.

`GET http://127.0.0.1:3000/health` verifica se o processo está ativo. `GET http://127.0.0.1:3000/ready` verifica se o banco está acessível.

## Formato do CSV piloto

Envie o conteúdo no corpo da requisição, como `text/csv`, com token do Supabase no cabeçalho `Authorization: Bearer ...`. Exemplo de colunas:

```csv
sku;nome;unidade;preco
7890000000012;Arroz tipo 1 5kg;UN;24,90
7890000000029;Feijão carioca 1kg;UN;8,49
```

Exemplo de chamada:

```text
POST /v1/stores/{id-da-loja}/imports/products
Authorization: Bearer {token-de-acesso}
Content-Type: text/csv
```

O limite atual é 8 MiB e 50 mil linhas. O retorno informa o identificador da importação, quantas linhas entraram, produtos novos e preços alterados. A coluna de código precisa identificar o mesmo produto de forma estável em cada exportação. Cabeçalhos aceitos incluem `sku`, `ean`, `codigo`, `nome`, `descricao`, `unidade`, `preco`, `valor` e equivalentes documentados no parser.

## Promoções e cartazes

O contrato completo para o front está em `apps/api/docs/openapi.yaml` (OpenAPI 3.1).

Todas as rotas abaixo exigem `Authorization: Bearer {token-de-acesso}` e recebem o ID da loja. O catálogo pode ser consultado em `GET /v1/stores/{storeId}/products` (opcional: `?q=arroz&limit=50&offset=0`); use `productId` nas chamadas seguintes. Catálogo, promoções e cartazes usam paginação `limit`/`offset` (máximo de 100 itens por página).

- `GET /v1/stores/{storeId}/imports` consulta o histórico de importações (`?status=failed&limit=20&offset=0`).
- `GET /v1/stores/{storeId}/price-changes` consulta histórico de preços, com filtros opcionais `productId`, `from` e `to` em ISO com fuso.

- `POST /v1/stores/{storeId}/promotions` cria uma promoção. Envie `productId`, `promotionalAmount` como texto decimal (ex.: `"19.90"`) e `startsAt`/`endsAt` como datas ISO com fuso, por exemplo `2026-11-20T08:00:00-03:00`. Só owner/manager pode criar; o preço promocional precisa ser menor que o preço atual e não pode haver outra promoção sobreposta para o produto.
- `GET /v1/stores/{storeId}/promotions` lista promoções; filtros: `?status=scheduled`, `active`, `expired` ou `cancelled`.
- `POST /v1/stores/{storeId}/promotions/{promotionId}/cancel` cancela uma promoção. Cartazes ainda não impressos são cancelados; cartazes já impressos entram imediatamente na lista de retirada.
- `POST /v1/stores/{storeId}/labels` com `{ "productId": "..." }` cria um cartaz pronto para impressão usando a promoção ativa, se existir. Para preparar cartaz de promoção futura, inclua também `promotionId`. A resposta contém o snapshot de preço e as datas.
- `POST /v1/stores/{storeId}/labels/{labelId}/printed` registra que a impressão física aconteceu.
- `GET /v1/stores/{storeId}/labels/{labelId}/print?widthMm=100&heightMm=70` entrega uma página HTML pronta para imprimir. O frontend busca com o token e abre o conteúdo para a caixa de impressão do navegador; só deve registrar `/printed` depois que a pessoa confirmar a impressão.
- `GET /v1/stores/{storeId}/labels/print-batch?labelIds={id1},{id2}&widthMm=100&heightMm=70` prepara até 50 cartazes pendentes, um por página. A API rejeita o lote inteiro se algum cartaz não pertencer à loja ou já não estiver pendente.
- `GET /v1/stores/{storeId}/labels?removalDueOnly=true` lista cartazes impressos que precisam ser retirados; `POST /v1/stores/{storeId}/labels/{labelId}/removed` confirma a retirada.
- `GET /v1/stores/{storeId}/alerts?status=unread` lista alertas automáticos de retirada; `POST /v1/stores/{storeId}/alerts/{alertId}/read` marca um alerta como lido.

Um processo em segundo plano varre cartazes impressos a cada 15 segundos e grava um alerta persistente quando a vigência termina. O frontend pode consultar a lista de alertas; não há envio por WhatsApp, e-mail ou notificação do navegador nesta etapa. A API gera a página de impressão e guarda a confirmação manual. A seleção da impressora acontece no navegador/dispositivo; envio sem diálogo e consulta de status exigirão um agente local ou integração compatível com o equipamento escolhido.

Para validar o fluxo real sem interface, mantenha `corepack pnpm dev` aberto em um terminal e, em outro, rode `./apps/api/scripts/smoke-promotion-workflow.ps1`. O script pede a chave publicável e as credenciais localmente, sem salvar ou exibir a senha/token. Ele valida importação, consultas de histórico, catálogo, criação/conflito de promoção, snapshot de cartaz, impressão, geração automática de alerta, leitura, retirada e resolução do alerta. O teste deixa os registros de promoção/cartaz cancelados/retirados e o produto de fixture no banco local.

Antes de usar com dados reais, alguém com acesso administrativo precisa criar organização, loja e associação do usuário nas tabelas correspondentes. Esta etapa não inclui ainda tela de cadastro/gestão; não crie associação para usuário sem validar a identidade e autorização com a rede.

## Verificação local de autenticação e CSV

Com o PostgreSQL iniciado e o `.env` preenchido com `SUPABASE_URL`, abra dois terminais na raiz do projeto:

1. No primeiro, execute `corepack pnpm dev` e deixe a API aberta.
2. No segundo, execute `./apps/api/scripts/smoke-import.ps1` no PowerShell.
3. Informe a chave publicável do projeto Supabase, o e-mail e a senha do usuário piloto. A senha é solicitada sem aparecer na tela, e o script não salva nem imprime o token.

O script autentica o usuário, consulta `/v1/me` e importa um produto de teste na Loja Piloto. Nunca informe uma chave `sb_secret_...` ou `service_role` neste script; ele usa apenas a chave publicável (`sb_publishable_...`) ou a antiga chave `anon`.

## Decisões de dados

- `products.id` é o identificador interno estável. Códigos/SKUs vindos do ERP ficam em `external_product_keys` e são únicos por organização e sistema de origem.
- `store_prices` relaciona produto e filial, sempre dentro da mesma organização; as chaves estrangeiras compostas impedem vínculos entre organizações diferentes.
- Valores monetários usam `numeric(12,2)` e são tratados como texto decimal pelo Drizzle, evitando conversão para ponto flutuante no JavaScript.
- `sync_runs` registra cada tentativa; preços novos são preparados em `sync_staging_prices`, publicados numa transação e mudanças anteriores ficam em `price_change_events`.
- `products` é o catálogo interno da organização; cada arquivo usa `external_product_keys` para reconciliar o código de origem com o identificador interno.
- Migrations aplicadas são imutáveis. Mudanças posteriores entram em novo arquivo numerado.
- As credenciais e dados de teste do Compose são exclusivamente locais. Não reutilize esses valores em produção.

## Migrations

Arquivos em `apps/api/migrations` são imutáveis depois de aplicados. O comando `corepack pnpm db:migrate` usa uma tabela de controle, verifica checksum, aplica cada migration em transação e serializa execuções concorrentes com advisory lock do PostgreSQL.

## O que falta para o piloto virar uma operação utilizável

- **Frontend conectado:** inclui login, busca de produtos, criação/cancelamento de promoções e cartazes ligados aos contratos disponíveis. Consulte `docs/FRONTEND_PHASE_4.md` para pendências como provisionamento da loja, desenho salvo localmente e telas de alertas/retirada.
- **Provisionamento de acesso:** definir como a rede autoriza usuários, lojas e papéis. Isso exige validar o processo com o responsável da rede; não deve haver cadastro aberto que conceda acesso a uma loja.
- **Entrada real do catálogo:** obter um CSV de exemplo autorizado e mapear seus cabeçalhos, códigos, unidades e regras de preço. A conexão direta ao ERP só deve ser planejada depois de conhecer o fornecedor e as opções oficiais de integração.
- **Impressão física:** validar o HTML de impressão no navegador, ajustar dimensões e margens ao papel real e confirmar o fluxo com a impressora. Para imprimir sem diálogo ou receber status/falha, será necessário um agente local ou SDK/protocolo compatível com o modelo escolhido.
- **Alertas fora do sistema:** decidir se os avisos ficam apenas na aplicação ou se também precisam chegar por e-mail, navegador ou outro canal.
- **Preparação de produção:** escolher hospedagem, domínio, banco, cópias de segurança, monitoramento e política de acesso; os valores locais do Docker são apenas para desenvolvimento.
- **Validação operacional:** revisar permissões e cenários com a rede e validar o fluxo com catálogo e regras reais antes de uso em loja.

## Limites atuais do backend

O backend do piloto cobre os fluxos principais de catálogo, promoções, cartazes e alertas em ambiente de desenvolvimento. Ele não substitui o ERP, não importa dados sem um arquivo autorizado, não provisiona usuários sozinho, não envia um trabalho diretamente à fila da impressora e não envia notificações externas. A impressão pelo navegador está preparada; integração sem diálogo, status da impressora, ERP e deploy dependem de informações e decisões da operação.
