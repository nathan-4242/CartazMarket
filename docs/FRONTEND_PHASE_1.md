# CartazMarket — fase 1 do frontend

O GitHub continha um monorepo pnpm, com Fastify e TypeScript em `apps/api`. O frontend foi adicionado em `apps/web` com React, TypeScript, Vite, React Router e Lucide. A base visual usa CSS com variáveis para a paleta e componentes de navegação, status, módulos e ação primária.

## Executar no Windows

Na raiz do repositório, com Node 22 ou superior:

```powershell
corepack pnpm install --store-dir G:\CARTAZMARKET\.pnpm-store
corepack pnpm --filter @cartazmarket/web dev
```

Abra http://127.0.0.1:5173. A interface inicia sem a API e indica quando a conexão está indisponível. Para apontar para outro ambiente, copie `apps/web/.env.example` para `apps/web/.env` e ajuste `VITE_API_BASE_URL`. O ambiente da API deve autorizar a origem do frontend em `CORS_ORIGINS`.

```powershell
corepack pnpm --filter @cartazmarket/web typecheck
corepack pnpm --filter @cartazmarket/web build
```

## Contratos verificados

A API local usa a porta 3000. A consulta implementada nesta fase é `GET /ready`, que distingue conexão saudável de banco indisponível (503). Esse resultado mede a disponibilidade do serviço e do PostgreSQL.

As rotas operacionais exigem um token Bearer do Supabase Auth e acesso à organização da loja. `GET /v1/me` traz a identidade e as organizações com seus papéis. As rotas por loja usam `storeId` na URL. `owner` e `manager` importam o catálogo e gerenciam promoções.

As listas usam `limit` e `offset`, com limite máximo de 100. Preços são strings decimais. Os recursos e os formatos de resposta estão em [OpenAPI](../apps/api/docs/openapi.yaml) e no [handoff](HANDOFF_FRONTEND.md). O tratamento geral da API devolve `error`, `message` e `requestId`. Consulte o esquema específico de cada rota para exceções como `/ready`.

## Próximas fases e dependências

- Fases 2 e 3 abrangem editor, seis modelos, motor de preços, formatos de papel, impressão e exportação.
- Fase 4 abrange sessão, identificação da loja e integração dos módulos. O piloto precisa fornecer um `storeId` autorizado, pois a API ainda carece de rota para listar lojas da pessoa autenticada. O login exige projeto Supabase configurado e usuário provisionado.
- A API persiste o snapshot operacional em `labels`. O contrato atual de criação não prevê persistência do design editável. A rota HTML do backend aceita dimensões de 40 a 300 mm por lado. O editor precisará gerar localmente a saída personalizada, incluindo A2 e A3, e só registrar a impressão após confirmação do funcionário.
- Fases 5 e 6 abrangem operação comercial e verificação final. O backend tem histórico de importação e alterações de preços, alertas e confirmação de retirada. O piloto importa dados via CSV. Sincronização direta com ERP, indicadores agregados e gestão de lojas ainda carecem de contratos no backend.
