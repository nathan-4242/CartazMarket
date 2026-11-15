# CartazMarket — rascunhos de issues

Preparados para abrir no repositório remoto assim que a pasta estiver ligada ao GitHub. Prioridade sugerida para o piloto.

## P0 — Frontend: autenticação e seleção de loja

**Objetivo:** permitir login Supabase, obter a identidade via `/v1/me` e trabalhar apenas com uma loja autorizada.

**Aceite:**
- Sessão Supabase persiste e o token Bearer é enviado às rotas `/v1`.
- A interface lida com sessão expirada, `401`, falta de acesso e API indisponível.
- A seleção de loja funciona com o mecanismo de provisionamento definido para o piloto; não há cadastro aberto que conceda acesso.

## P0 — Frontend: catálogo e promoções

**Objetivo:** implementar busca de produto, exibição de preço e criação/consulta/cancelamento de promoções.

**Aceite:**
- Busca usa `q`, `limit` e `offset` e apresenta os preços retornados pela API.
- Criação envia valor decimal como string e data ISO com fuso.
- Erros de preço inválido, produto sem preço, sobreposição e permissão são apresentados de forma compreensível.
- Só `owner`/`manager` recebe ações para importar e gerenciar promoções.

## P0 — Frontend: cartazes, impressão e retirada

**Objetivo:** implementar prévia, impressão individual/em lote e acompanhamento de cartazes pendentes.

**Aceite:**
- Criar cartaz chama `POST /labels` e a prévia usa os valores do snapshot da API.
- Impressão busca `/labels/{id}/print` ou `/labels/print-batch` com Bearer token.
- Usuário confirma a impressão antes de chamar `/printed`; cancelar a caixa do navegador não marca como impresso.
- Tela filtra cartazes vencidos e a confirmação de retirada chama `/removed`.
- Dimensões da etiqueta podem ser ajustadas após validar o papel real.

## P1 — Frontend: alertas e histórico

**Objetivo:** mostrar alertas de retirada, importações e mudanças de preço.

**Aceite:**
- Alertas mostram status e dados do cartaz/produto, permitem marcar como lido e atualizam ao confirmar a retirada.
- Históricos de importação e preço suportam filtros/paginação e estados vazios/erro.

## P1 — Definir provisionamento de lojas e usuários

**Objetivo:** definir com a rede um processo autorizado para criar organização, loja e associar usuários Supabase com papéis.

**Aceite:**
- Dono do processo e validação de identidade estão documentados.
- Há modo controlado de criar/alterar associações, sem endpoint público de autoelevação.
- Front recebe a lista de lojas disponíveis para o usuário.

## P1 — Ajustar importação ao CSV real do ERP

**Objetivo:** validar o importador com amostra autorizada da rede.

**Aceite:**
- Cabeçalhos, separador, códigos de produto, unidades, moeda e semântica de preço estão mapeados.
- Casos de arquivo inválido e atualização de preço foram validados pelo responsável da rede.
- Processo permanece somente leitura em relação ao ERP.

## P2 — Validar impressão em equipamento real

**Objetivo:** calibrar a saída HTML e decidir se o piloto precisa enviar diretamente para uma fila local.

**Aceite:**
- Modelo/conexão da impressora e tamanho do papel estão registrados.
- Margens e dimensões são validadas com impressão física.
- Se for necessário envio sem diálogo ou leitura de status, definir e implementar agente local compatível.

## P2 — Preparar ambiente de produção

**Objetivo:** escolher e configurar hospedagem, banco, domínio, cópias de segurança e monitoramento.

**Aceite:**
- Segredos ficam apenas no ambiente servidor; CORS aceita somente o domínio oficial.
- Migrations são aplicadas no banco de produção e backup/restauração são documentados.
- Health/readiness, logs e procedimento de atualização estão configurados.
