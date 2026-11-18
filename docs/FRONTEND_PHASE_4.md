# CartazMarket — fase 4, integração da aplicação web

O frontend React foi adicionado ao monorepo existente. As rotas operacionais usam os contratos de `apps/api/docs/openapi.yaml` e `docs/HANDOFF_FRONTEND.md`. Esta fase liga login Supabase, identidade, busca paginada de produtos, consulta de promoções, criação/cancelamento de promoções, geração do snapshot da API, cartazes registrados e validação/confirmação manual da impressão.

## Iniciar localmente

1. Requer Node.js 22.15 ou superior, Corepack, PostgreSQL 17 ou Docker Desktop.
2. Copie `.env.example` da raiz para `.env`, configure `DATABASE_URL` e `SUPABASE_URL`, suba PostgreSQL, aplique migrations e inicie a API conforme o README.
3. Copie `apps/web/.env.example` para `apps/web/.env.local`.
4. Preencha `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_API_BASE_URL`. Use apenas a chave publicável `sb_publishable_...`. Nunca use `sb_secret_...` nem `service_role` no navegador.
5. O CORS padrão da API permite `http://localhost:5173` e `http://127.0.0.1:5173`. O Vite usa `http://127.0.0.1:5173`. Se a porta/origem mudar, ajuste `CORS_ORIGINS` na API.
6. Depois do provisionamento de loja, configure `VITE_STORES` como JSON em uma linha, por exemplo `[ {"id":"UUID-DA-LOJA","organizationId":"UUID-DA-ORGANIZACAO","name":"Loja Centro"} ]`. Informe somente lojas que a conta pode acessar na organização indicada. O backend continua sendo a autoridade de autorização.
7. Execute `corepack pnpm install`, `corepack pnpm --filter @cartazmarket/web dev` e abra `http://127.0.0.1:5173`.

`apps/web/.env.local` é excluído pelo `.gitignore`. Variáveis `VITE_*` entram no bundle público do navegador. Por isso a lista de lojas não pode conter credenciais ou dados secretos.

## Fluxos conectados

- Entrar e sair com Supabase Auth usando e-mail e senha. A sessão usa `sessionStorage`, é limpa ao fechar a sessão do navegador e o token Bearer é enviado nas chamadas autenticadas. Ao receber HTTP 401, a sessão local é encerrada e o usuário volta à tela de entrada.
- A identidade e organizações vêm de `GET /v1/me`.
- Produtos vêm de `GET /v1/stores/{storeId}/products`. A consulta envia páginas de 25, busca por nome com debounce e offset no servidor.
- Promoções usam as rotas de listar, criar e cancelar. Somente perfis `owner` e `manager` veem ações administrativas, com a API validando novamente a permissão.
- `POST /labels` fornece o snapshot de preço, unidade e período para abrir o editor. Produto e preço registrados ficam bloqueados no editor conectado. O desenho personalizado continua salvo nos rascunhos locais deste navegador, associado ao ID do cartaz.
- Antes da impressão/exportação de um cartaz conectado, o frontend consulta a rota `/print` autenticada para confirmar que o cartaz continua disponível para impressão. Após a ação física, a pessoa confirma explicitamente para chamar `/printed`.

## Pendências e problemas conhecidos

1. **Loja não configurada.** O usuário optou por deixar o ID da loja e da organização para depois. Sem uma entrada autorizada em `VITE_STORES`, a tela de catálogo, promoções e cartazes explica que falta configurar a loja. `/v1/me` retorna organizações, mas a API ainda não tem endpoint que liste lojas. O cadastro precisa ser concluído pelo responsável autorizado no banco e os dois UUIDs precisam ser adicionados ao ambiente do frontend.
2. **API local indisponível durante esta implementação.** `http://127.0.0.1:3000/health` não respondeu. Build e fluxo de integração foram verificados com respostas HTTP simuladas no navegador, não contra PostgreSQL/Supabase/API locais reais.
3. **Autenticação real não foi verificada.** A URL e a chave publicável Supabase foram recebidas e gravadas somente no `apps/web/.env.local`, arquivo ignorado pelo Git. Login real depende de uma conta provisionada, da API em execução e de uma loja autorizada.
4. **Desenho do cartaz é local.** O contrato do backend guarda o snapshot operacional, não a composição visual, arquivos de imagem ou alterações de design. O desenho fica no armazenamento deste navegador e computador. Não sincroniza entre dispositivos e pode ser apagado ao limpar os dados locais.
5. **Campos de busca do catálogo.** A API só consulta nome de produto. Busca por SKU/código de barras, categoria e paginação total do banco ainda não estão no contrato.
6. **Preço promocional ao gerar cartaz simples.** O servidor aplica promoções ativas. A interface de produto cria o snapshot sem `promotionId`, então uma promoção agendada precisa ser escolhida na tela de promoções para o cartaz ficar associado ao período futuro.
7. **Confirmação física.** O navegador não revela com segurança se a pessoa imprimiu ou cancelou. A API só recebe `/printed` depois da confirmação manual.
8. **ERP e impressão direta.** A importação de catálogo é por CSV. Sincronização automática com ERP, envio silencioso à impressora e detecção de papel/tinta não fazem parte do backend atual.
9. **Dashboard agregado e telas operacionais adicionais.** A API não tem contrato para indicadores de dashboard, histórico unificado de eventos de operação, importação CSV pela nova interface, confirmação de retirada e consulta de alertas dentro da interface. Essas telas precisam de uma etapa posterior.
10. **Exportação conectada.** A API valida estado pelo HTML de impressão, mas a exportação customizada PDF/PNG usa o desenho local. Não é um arquivo fornecido ou arquivado pela API.
11. **Unidades ERP.** Unidades desconhecidas são mantidas como texto para o cartaz. Verifique se o mapeamento e a apresentação fazem sentido para a rede antes de imprimir.

## Verificações executadas

- `corepack pnpm --filter @cartazmarket/web build` — TypeScript e build Vite concluídos.
- `corepack pnpm --filter @cartazmarket/web test:connection` — login e rotas com respostas simuladas no Microsoft Edge. Cobriu paginação, debounce, permissão de gerente/operador, promoção, preço do snapshot, confirmação de impressão, erro de API, sessão expirada e largura móvel.
- `corepack pnpm --filter @cartazmarket/web test` e `test:printing` — motor monetário, dimensões A2–A6, exportação PNG/PDF e modo pré-impresso.
- Testes de integração da fase 4 não substituem a execução contra Supabase e PostgreSQL reais. O endpoint `/health` da API local não respondeu durante a implementação.

## Arquivos desta fase

- `src/connection/config.ts` — Supabase, URL da API e lojas autorizadas configuráveis.
- `src/connection/service.ts` — chamadas HTTP Bearer e validação de resposta.
- `src/connection/contracts.ts` — esquemas e formatos monetários.
- `src/connection/Auth.tsx` — sessão, login, organizações e proteção visual de rotas.
- `src/connection/StorePage.tsx` — catálogo, promoções e cartazes com paginação.
- `src/connection/RemoteLabel.tsx` — validação e confirmação de impressão.
- `src/connection/labelDraft.ts` — transformação do snapshot do backend em rascunho do editor.
- `tests/connection.test.mjs` — verificação de interface com API simulada.
