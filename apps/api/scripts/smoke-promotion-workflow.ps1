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

Write-Host "Local validation: promotion -> label -> removal"
Write-Host "Loja: $StoreId"
$publishableKey = Read-Host "Supabase publishable key (sb_publishable_... or legacy anon)"
$email = Read-Host "Test user email"
$securePassword = Read-Host "Test user password" -AsSecureString
$plainPassword = [System.Net.NetworkCredential]::new("", $securePassword).Password
$session = $null
$headers = $null

try {
  Invoke-RestMethod -Uri "$ApiBaseUrl/health" -Method Get | Out-Null

  $loginBody = @{ email = $email; password = $plainPassword } | ConvertTo-Json -Compress
  $session = Invoke-RestMethod `
    -Uri "$supabaseUrl/auth/v1/token?grant_type=password" `
    -Method Post `
    -Headers @{ apikey = $publishableKey } `
    -ContentType "application/json" `
    -Body $loginBody
  if (-not $session.access_token) {
    throw "Supabase did not return an access token. Check the user and email confirmation."
  }
  $headers = @{ Authorization = "Bearer $($session.access_token)" }

  $csv = "sku;nome;unidade;preco`r`nCARTAZMARKET-TESTE-001;Produto de teste CartazMarket;UN;12,34`r`n"
  $csvBytes = [System.Text.Encoding]::UTF8.GetBytes($csv)
  $importResult = Invoke-RestMethod `
    -Uri "$ApiBaseUrl/v1/stores/$StoreId/imports/products" `
    -Method Post `
    -Headers $headers `
    -ContentType "text/csv" `
    -Body $csvBytes
  Write-Host "1. Catalog import: OK"

  $importHistory = Invoke-RestMethod `
    -Uri "$ApiBaseUrl/v1/stores/$StoreId/imports?limit=100" `
    -Method Get `
    -Headers $headers
  if (-not ($importHistory.imports | Where-Object { $_.id -eq $importResult.syncRunId })) {
    throw "The import history did not include the latest import."
  }
  Write-Host "1a. Import history: OK"

  $query = [uri]::EscapeDataString("Produto de teste CartazMarket")
  $catalog = Invoke-RestMethod -Uri "$ApiBaseUrl/v1/stores/$StoreId/products?q=$query&limit=100" -Method Get -Headers $headers
  $product = $catalog.products | Where-Object { $_.name -eq "Produto de teste CartazMarket" } | Select-Object -First 1
  if (-not $product) {
    throw "The fixture product did not appear in the store catalog."
  }
  Write-Host "2. Catalog query: OK"

  $priceHistory = Invoke-RestMethod `
    -Uri "$ApiBaseUrl/v1/stores/$StoreId/price-changes?productId=$($product.productId)&limit=100" `
    -Method Get `
    -Headers $headers
  if (-not ($priceHistory.changes | Where-Object { $_.productId -eq $product.productId })) {
    throw "The price change history did not include the fixture product."
  }
  Write-Host "2a. Price change history: OK"

  $culture = [System.Globalization.CultureInfo]::InvariantCulture
  $regularAmount = [decimal]::Parse([string]$product.currentAmount, $culture)
  $promotionalAmount = $regularAmount - [decimal]0.01
  if ($promotionalAmount -lt 0) {
    throw "The test product price must be greater than zero to create a promotion."
  }

  $start = [DateTimeOffset]::UtcNow.AddMinutes(2)
  $end = $start.AddDays(1)
  $expectedPromotionalAmount = $promotionalAmount.ToString("0.00", $culture)
  $promotionBody = @{
    productId = $product.productId
    promotionalAmount = $expectedPromotionalAmount
    startsAt = $start.ToString("o")
    endsAt = $end.ToString("o")
  } | ConvertTo-Json -Compress
  $promotionResult = $null
  try {
    $promotionResult = Invoke-RestMethod `
      -Uri "$ApiBaseUrl/v1/stores/$StoreId/promotions" `
      -Method Post `
      -Headers $headers `
      -ContentType "application/json" `
      -Body $promotionBody
  } catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 409) {
      $existingPromotions = Invoke-RestMethod `
        -Uri "$ApiBaseUrl/v1/stores/$StoreId/promotions" `
        -Method Get `
        -Headers $headers
      $promotionResult = $existingPromotions.promotions |
        Where-Object {
          $_.productId -eq $product.productId -and
          $_.promotionalAmount -eq $expectedPromotionalAmount -and
          $_.status -in @("scheduled", "active")
        } |
        Sort-Object createdAt -Descending |
        Select-Object -First 1
      if (-not $promotionResult) { throw }
      Write-Host "Reusing unfinished test promotion from an earlier run."
    } else {
      throw
    }
  }
  $promotionId = if ($promotionResult.promotion) { $promotionResult.promotion.id } else { $promotionResult.id }
  if (-not $promotionId) { throw "The API did not return the promotion ID." }
  Write-Host "3. Scheduled promotion creation/reuse: OK"

  $overlapRejected = $false
  try {
    Invoke-RestMethod `
      -Uri "$ApiBaseUrl/v1/stores/$StoreId/promotions" `
      -Method Post `
      -Headers $headers `
      -ContentType "application/json" `
      -Body $promotionBody | Out-Null
  } catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 409) {
      $overlapRejected = $true
    } else {
      throw
    }
  }
  if (-not $overlapRejected) { throw "The API accepted overlapping promotions for one product." }
  Write-Host "4. Overlapping promotion rejection: OK"

  $labelBody = @{ productId = $product.productId; promotionId = $promotionId } | ConvertTo-Json -Compress
  $labelResult = Invoke-RestMethod `
    -Uri "$ApiBaseUrl/v1/stores/$StoreId/labels" `
    -Method Post `
    -Headers $headers `
    -ContentType "application/json" `
    -Body $labelBody
  $labelId = $labelResult.label.id
  if (-not $labelId) { throw "The API did not return the label ID." }
  if ([string]$labelResult.label.displayAmount -ne $expectedPromotionalAmount) {
    throw "The label did not save the expected promotional price."
  }
  Write-Host "5. Promotional label snapshot: OK"

  Invoke-RestMethod `
    -Uri "$ApiBaseUrl/v1/stores/$StoreId/labels/$labelId/printed" `
    -Method Post `
    -Headers $headers `
    -ContentType "application/json" `
    -Body "{}" | Out-Null
  Write-Host "6. Printed state: OK"

  Invoke-RestMethod `
    -Uri "$ApiBaseUrl/v1/stores/$StoreId/promotions/$promotionId/cancel" `
    -Method Post `
    -Headers $headers `
    -ContentType "application/json" `
    -Body "{}" | Out-Null
  Write-Host "7. Cancellation and immediate removal due: OK"

  $alertDeadline = (Get-Date).AddSeconds(35)
  $dueAlert = $null
  do {
    $unreadAlerts = Invoke-RestMethod `
      -Uri "$ApiBaseUrl/v1/stores/$StoreId/alerts?status=unread&limit=100" `
      -Method Get `
      -Headers $headers
    $dueAlert = $unreadAlerts.alerts | Where-Object { $_.labelId -eq $labelId } | Select-Object -First 1
    if (-not $dueAlert) { Start-Sleep -Seconds 1 }
  } while (-not $dueAlert -and (Get-Date) -lt $alertDeadline)
  if (-not $dueAlert) { throw "The background scheduler did not create an alert for the due label within 35 seconds." }
  Write-Host "8. Automatic due alert: OK"

  Invoke-RestMethod `
    -Uri "$ApiBaseUrl/v1/stores/$StoreId/alerts/$($dueAlert.id)/read" `
    -Method Post `
    -Headers $headers `
    -ContentType "application/json" `
    -Body "{}" | Out-Null
  Write-Host "9. Mark alert read: OK"

  $due = Invoke-RestMethod `
    -Uri "$ApiBaseUrl/v1/stores/$StoreId/labels?removalDueOnly=true" `
    -Method Get `
    -Headers $headers
  $dueLabel = $due.labels | Where-Object { $_.id -eq $labelId } | Select-Object -First 1
  if (-not $dueLabel) { throw "The printed label was not listed as due for removal." }
  Write-Host "10. Pending removal query: OK"

  Invoke-RestMethod `
    -Uri "$ApiBaseUrl/v1/stores/$StoreId/labels/$labelId/removed" `
    -Method Post `
    -Headers $headers `
    -ContentType "application/json" `
    -Body "{}" | Out-Null
  $remainingDue = Invoke-RestMethod `
    -Uri "$ApiBaseUrl/v1/stores/$StoreId/labels?removalDueOnly=true" `
    -Method Get `
    -Headers $headers
  if ($remainingDue.labels | Where-Object { $_.id -eq $labelId }) {
    throw "The label still appears as pending after confirming removal."
  }
  $resolvedAlerts = Invoke-RestMethod `
    -Uri "$ApiBaseUrl/v1/stores/$StoreId/alerts?status=resolved&limit=100" `
    -Method Get `
    -Headers $headers
  if (-not ($resolvedAlerts.alerts | Where-Object { $_.id -eq $dueAlert.id })) {
    throw "The alert was not resolved after confirming label removal."
  }
  Write-Host "11. Removal confirmation and alert resolution: OK"
  Write-Host "Full workflow validated."
  Write-Host "Test promotion: $promotionId"
  Write-Host "Test label: $labelId"
} catch {
  $failureMessage = $_.Exception.Message
  if ($failureMessage -match "No such host is known|NameResolutionFailure|name resolution|ENOTFOUND") {
    $failureMessage = "Could not resolve SUPABASE_URL. Check the project URL in .env."
  }
  Write-Host "Workflow failed: $failureMessage" -ForegroundColor Red
  Write-Host "Confirm the API is running and the user has owner or manager access to this store." -ForegroundColor Yellow
  exit 1
} finally {
  $plainPassword = $null
  $loginBody = $null
  $session = $null
  $headers = $null
  if ($securePassword) { $securePassword.Dispose() }
}
