# CartazMarket — fase 2 do frontend

O editor abre em `/editor`. A rota `/modelos` abre a galeria, que permite comparar as seis composições com os dados atuais e aplicar o modelo escolhido. OFERTA, PROMOÇÃO, SUPER OFERTA, OFERTA DO DIA, ATACADO e HORTIFRUTI compartilham o motor de preços e usam composições vetoriais em A4 retrato.

O formulário aceita preenchimento manual. Título, produto e preço têm fonte, cor, alinhamento e tamanho ajustáveis individualmente. O editor oferece zoom, desfazer/refazer e salvamento automático de um rascunho no navegador. Ctrl+S ou Cmd+S também salva. Ctrl+Z e Ctrl+Shift+Z atuam no histórico do editor quando o foco está fora de campos de texto.

## Executar e testar

Use Node 22.18 ou superior para rodar os testes com o suporte nativo a TypeScript.

```powershell
Set-Location G:\CARTAZMARKET
corepack pnpm --filter @cartazmarket/web dev
corepack pnpm --filter @cartazmarket/web test
corepack pnpm --filter @cartazmarket/web build
```

A interface abre em http://127.0.0.1:5173/editor. O teste automatizado cobre formatação monetária pt-BR, entradas inválidas e dimensionamento do bloco de preço. O motor agrupa milhares e separa símbolo, inteiro, centavos e unidade sem converter o valor monetário em ponto flutuante.

A validação em Edge também cobriu o fluxo de edição, troca entre seis prévias, desfazer/refazer, ajustes de fonte, cor e alinhamento, restauração do rascunho, largura móvel e limites de texto no SVG.

A próxima fase acrescenta impressão, formatos de papel e exportação. A integração com produtos, promoções, autenticação e cartazes do backend entra na fase 4. O rascunho atual pertence ao navegador. A API do piloto oferece snapshots operacionais de cartazes e ainda carece de contrato para gravar a composição editável.
