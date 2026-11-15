param(
  [string]$StoreId = "8bf1a045-d270-4b8a-8931-35e937d608da",
  [string]$ApiBaseUrl = "http://127.0.0.1:3000"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$envPath = Join-Path $repoRoot ".env"
if (-not (Test-Path -LiteralPath $envPath)) {
  throw "Arquivo .env não encontrado na raiz do projeto."
}

$supabaseLine = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^SUPABASE_URL=' } | Select-Object -Last 1
$supabaseUrl = ($supabaseLine -replace '^SUPABASE_URL=', '').Trim().Trim('"').Trim("'").TrimEnd('/')
if (-not $supabaseUrl.StartsWith("https://")) {
  throw "SUPABASE_URL não está configurada com um endereço HTTPS no .env."
}

Write-Host "Verificação local do CartazMarket"
Write-Host "Loja: $StoreId"
Write-Host "A chave publicável não será salva. A senha será solicitada sem exibição."

$publishableKey = Read-Host "Chave publicável do Supabase (sb_publishable_... ou anon antiga)"
$email = Read-Host "E-mail do usuário de teste"
$securePassword = Read-Host "Senha do usuário de teste" -AsSecureString
$plainPassword = [System.Net.NetworkCredential]::new("", $securePassword).Password
$session = $null
$headers = $null

try {
  Invoke-RestMethod -Uri "$ApiBaseUrl/health" -Method Get | Out-Null

  $loginBody = @{
    email = $email
    password = $plainPassword
  } | ConvertTo-Json -Compress

  $session = Invoke-RestMethod `
    -Uri "$supabaseUrl/auth/v1/token?grant_type=password" `
    -Method Post `
    -Headers @{ apikey = $publishableKey } `
    -ContentType "application/json" `
    -Body $loginBody

  if (-not $session.access_token) {
    throw "O Supabase não retornou um token de acesso. Confira o usuário e a confirmação do e-mail."
  }

  $headers = @{ Authorization = "Bearer $($session.access_token)" }
  $me = Invoke-RestMethod -Uri "$ApiBaseUrl/v1/me" -Method Get -Headers $headers
  Write-Host "Autenticação da API: OK ($($me.user.email))"

  $csv = "sku;nome;unidade;preco`r`nCARTAZMARKET-TESTE-001;Produto de teste CartazMarket;UN;12,34`r`n"
  $csvBytes = [System.Text.Encoding]::UTF8.GetBytes($csv)
  $result = Invoke-RestMethod `
    -Uri "$ApiBaseUrl/v1/stores/$StoreId/imports/products" `
    -Method Post `
    -Headers $headers `
    -ContentType "text/csv" `
    -Body $csvBytes

  Write-Host "Importação CSV: OK"
  Write-Host "Linhas importadas: $($result.rowsImported)"
  Write-Host "Produtos criados: $($result.productsCreated)"
  Write-Host "Preços registrados/alterados: $($result.pricesChanged)"
  Write-Host "ID da importação: $($result.syncRunId)"
} catch {
  $failureMessage = $_.Exception.Message
  if ($failureMessage -match "nome remoto não pôde ser resolvido|No such host is known|NameResolutionFailure|name resolution") {
    $failureMessage = "Não foi possível localizar o domínio em SUPABASE_URL. Copie a Project URL direto do painel e atualize o .env."
  }
  Write-Host "A verificação não concluiu: $failureMessage" -ForegroundColor Red
  Write-Host "Confira se a API está rodando, se o usuário está confirmado e se a chave publicável pertence ao projeto configurado." -ForegroundColor Yellow
  exit 1
} finally {
  $plainPassword = $null
  $loginBody = $null
  $session = $null
  $headers = $null
  if ($securePassword) {
    $securePassword.Dispose()
  }
}
