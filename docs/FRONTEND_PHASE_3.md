# CartazMarket — fase 3, impressão e exportação

## Uso

O editor e a rota /impressao oferecem os formatos A2, A3, A4, A5 e A6, orientação retrato/paisagem, margem de 0 a 20 mm e modo de papel pré-impresso. O padrão é A4 retrato, com margem de 5 mm. Configurações são persistidas no rascunho e nos cartazes salvos. Um novo cartaz mantém o modelo e as configurações de impressão atuais.

PNG é gerado nas dimensões equivalentes a 300 dpi. PDF usa as dimensões físicas do papel, com textos convertidos em contornos vetoriais e imagens raster preservadas como imagens. Os contornos dispensam fontes instaladas no computador de destino. O texto convertido em contorno deixa de ser selecionável como texto no PDF.

A prévia, PNG, PDF e impressão compartilham PaperPreview e Poster. Paisagem reorganiza o nome do produto à esquerda e o bloco de preço à direita, mantendo a proporção das letras. As posições personalizadas podem ser ajustadas depois da mudança de orientação. Margens mantêm a proporção da arte dentro da área útil.

O modo pré-impresso omite fundo, decoração, título do modelo e imagens. Produto, preço, unidade, validade, código, descrição, embalagem e textos adicionais permanecem. A prévia mostra somente o conteúdo enviado ao papel. A folha física precisa corresponder ao mesmo modelo, orientação, dimensão e margem.

Use escala de 100%, o papel indicado e cabeçalhos/rodapés desativados no diálogo da impressora. O navegador permite alterar essas opções. A abertura do diálogo não registra impressão concluída. O registro operacional na API pertence à fase de integração.

## Fontes

Barlow Condensed ExtraBold Italic continua como fonte padrão. PT Serif e Barlow são alternativas locais, com licença OFL em public/fonts. Rascunhos antigos com Georgia são migrados para PT Serif; Verdana e Tahoma são migrados para Barlow. Essa mudança permite renderizar e exportar com os mesmos arquivos de fonte em qualquer computador. As imagens carregadas anteriormente continuam raster, respeitando a resolução disponível.

## Arquivos

- src/posters/paper.ts — dimensões, orientação e normalização de configurações.
- src/posters/PaperPreview.tsx — folha e margens compartilhadas.
- src/posters/PrintControls.tsx — controles e feedback de exportação.
- src/posters/output.tsx — preparação vetorial, PNG, PDF e janela de impressão.
- src/posters/fonts.ts e public/fonts — famílias e fontes locais.
- Poster, Editable, draft, Editor, PosterLibrary e main foram adaptados para formatos, paisagem, persistência e navegação.
- tests/paper.test.mjs e tests/printing.test.mjs — testes de impressão.

exportPdf recebe uma lista de rascunhos e suporta múltiplas páginas, preparando a impressão em lote. A seleção de lotes na interface fica para um fluxo posterior.

## Verificação

Na raiz do projeto:

    corepack pnpm --filter @cartazmarket/web build
    corepack pnpm --filter @cartazmarket/web test
    corepack pnpm --filter @cartazmarket/web test:printing

O teste de navegador usa Microsoft Edge instalado e o build em dist. Os arquivos temporários ficam em apps/web/node_modules/.cache/printing-tests.

Foram verificados os cinco formatos PDF, dimensões de PNG retrato/paisagem, geometria vetorial dos PDFs sem imagens, exportação com imagem e fonte PT Serif, modo pré-impresso, validação de preço e acionamento da janela de impressão com tamanho de página correto. O teste substitui a chamada física de window.print por um marcador. A saída foi inspecionada visualmente em PNG.

A validação em impressora física e no estoque real de papel pré-impresso está pendente. A fase seguinte integra autenticação e dados reais da API.
