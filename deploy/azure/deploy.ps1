<#
.SYNOPSIS
  Deploys RedWays to Azure: planning service on Container Apps, app + HiRISE tiles on a
  Storage Account static website.

.DESCRIPTION
  Run from the repository root after `az login`. Idempotent: re-running updates in place.
  Prerequisites (local, not versioned):
    - app/.env with VITE_CESIUM_ION_TOKEN
    - data/processed/gale/analytical/terrain.npz   (python -m scripts.prepare_gale)
    - data/processed/gale/tiles_hirise/            (python scripts/build_hirise_tiles.py; optional)

.EXAMPLE
  ./deploy/azure/deploy.ps1 -Storage redwaysg21
  ./deploy/azure/deploy.ps1 -Storage redwaysg21 -SkipService -SkipTiles   # app only
#>
param(
  # Globally unique, 5-24 lowercase letters/digits. Also used as the registry name.
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-z0-9]{5,24}$')][string]$Storage,
  [string]$ResourceGroup = "redways-rg",
  [string]$Location = "eastus",
  [string]$AppName = "redways-service",
  [string]$EnvName = "redways-env",
  [switch]$SkipService,
  # Build the service image with local Docker instead of ACR Tasks (required on free-trial subscriptions).
  [switch]$LocalBuild,
  [switch]$SkipTiles
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "../..")
Set-Location $root

function Invoke-Az {
  # Run az and fail only on a non-zero exit code. Windows PowerShell 5.1 turns native stderr
  # (az warnings) into error records, so "Stop" must not apply while az runs.
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $out = & az @args 2>&1 | ForEach-Object {
      if ($_ -is [System.Management.Automation.ErrorRecord]) { Write-Host "  az: $_" -ForegroundColor DarkGray } else { $_ }
    }
  } finally {
    $ErrorActionPreference = $previous
  }
  if ($LASTEXITCODE -ne 0) { throw "az $($args -join ' ') failed ($LASTEXITCODE)" }
  return $out
}

function Get-AzValue {
  # Query that may legitimately fail (resource not created yet): returns $null instead of throwing.
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $out = & az @args 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return $out
  } finally {
    $ErrorActionPreference = $previous
  }
}

if (-not (Test-Path "app/.env")) { throw "Missing app/.env (VITE_CESIUM_ION_TOKEN)." }
if (-not $SkipService -and -not (Test-Path "data/processed/gale/analytical/terrain.npz")) {
  throw "Missing terrain.npz: run python -m scripts.prepare_gale first."
}

Write-Host "== Resource providers (first run on a new subscription takes a few minutes)" -ForegroundColor Cyan
foreach ($ns in "Microsoft.Storage", "Microsoft.ContainerRegistry", "Microsoft.App", "Microsoft.OperationalInsights") {
  Invoke-Az provider register --namespace $ns --wait --output none
}

Write-Host "== Resource group and static website" -ForegroundColor Cyan
Invoke-Az group create --name $ResourceGroup --location $Location --output none
Invoke-Az storage account create --name $Storage --resource-group $ResourceGroup --location $Location `
  --sku Standard_LRS --kind StorageV2 --min-tls-version TLS1_2 --output none
Invoke-Az storage blob service-properties update --account-name $Storage --static-website `
  --index-document index.html --404-document index.html --auth-mode key --output none
$webUrl = (Invoke-Az storage account show --name $Storage --resource-group $ResourceGroup `
  --query "primaryEndpoints.web" --output tsv).Trim().TrimEnd("/")
Write-Host "Static site: $webUrl"

if (-not $SkipService) {
  Write-Host "== Planning service image" -ForegroundColor Cyan
  Invoke-Az extension add --name containerapp --upgrade --only-show-errors --output none

  $acrExists = Get-AzValue acr show --name $Storage --resource-group $ResourceGroup --query name --output tsv
  if (-not $acrExists) {
    Invoke-Az acr create --name $Storage --resource-group $ResourceGroup --location $Location `
      --sku Basic --admin-enabled true --output none
  }
  $image = "$Storage.azurecr.io/redways-service:latest"
  # Build context is the repository root; .dockerignore limits it to engine/, service/ and the analytical package.
  if ($LocalBuild) {
    # Free-trial subscriptions reject ACR Tasks (az acr build): build with local Docker and push.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      docker build --platform linux/amd64 -f service/Dockerfile -t $image .
      if ($LASTEXITCODE -ne 0) { throw "docker build failed" }
      Invoke-Az acr login --name $Storage --output none
      docker push $image
      if ($LASTEXITCODE -ne 0) { throw "docker push failed" }
    } finally {
      $ErrorActionPreference = $previous
    }
  } else {
    Invoke-Az acr build --registry $Storage --image "redways-service:latest" --file service/Dockerfile . --output none
  }

  Write-Host "== Container Apps" -ForegroundColor Cyan
  $envExists = Get-AzValue containerapp env show --name $EnvName --resource-group $ResourceGroup --query name --output tsv
  if (-not $envExists) {
    Invoke-Az containerapp env create --name $EnvName --resource-group $ResourceGroup --location $Location --output none
  }
  $appExists = Get-AzValue containerapp show --name $AppName --resource-group $ResourceGroup --query name --output tsv
  if (-not $appExists) {
    # One replica: the service owns a single planner in memory (see service/HTTP_API.md).
    Invoke-Az containerapp create --name $AppName --resource-group $ResourceGroup --environment $EnvName `
      --image $image --registry-server "$Storage.azurecr.io" --target-port 8000 --ingress external `
      --cpu 1.0 --memory 2.0Gi --min-replicas 1 --max-replicas 1 `
      --env-vars "ALLOWED_ORIGIN=$webUrl" --output none
  } else {
    Invoke-Az containerapp update --name $AppName --resource-group $ResourceGroup --image $image `
      --set-env-vars "ALLOWED_ORIGIN=$webUrl" --revision-suffix ("r" + (Get-Date -Format "MMddHHmmss")) --output none
  }
}

$fqdn = (Get-AzValue containerapp show --name $AppName --resource-group $ResourceGroup `
  --query "properties.configuration.ingress.fqdn" --output tsv)
if (-not $fqdn) { throw "Planning service not found; run without -SkipService first." }
$serviceUrl = "https://$($fqdn.Trim())"
Write-Host "Service: $serviceUrl"

Write-Host "== App build" -ForegroundColor Cyan
# Vite reads VITE_CESIUM_ION_TOKEN from app/.env; the process variable overrides the service URL.
$env:VITE_SERVICE_URL = $serviceUrl
# npm and Vite print warnings on stderr; rely on exit codes, not on stderr (see Invoke-Az).
$ErrorActionPreference = "Continue"
try {
  if (-not (Test-Path "app/node_modules")) {
    npm --prefix app ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
  }
  npm --prefix app run build
  if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
} finally {
  Remove-Item Env:VITE_SERVICE_URL -ErrorAction SilentlyContinue
  $ErrorActionPreference = "Stop"
}

Write-Host "== Upload app" -ForegroundColor Cyan
Invoke-Az storage blob upload-batch --account-name $Storage --auth-mode key --destination '$web' `
  --source app/dist --overwrite --only-show-errors --output none

if (-not $SkipTiles) {
  if (Test-Path "data/processed/gale/tiles_hirise/tileset.json") {
    Write-Host "== Upload HiRISE tiles (~425 MB)" -ForegroundColor Cyan
    Invoke-Az storage blob upload-batch --account-name $Storage --auth-mode key `
      --destination '$web' --destination-path "local-data/gale/tiles_hirise" `
      --source data/processed/gale/tiles_hirise --overwrite --only-show-errors --output none
  } else {
    Write-Warning "No HiRISE tiles found; the app falls back to Cesium Mars inside the parcel."
  }
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "  App:     $webUrl/"
Write-Host "  Service: $serviceUrl/health"
Write-Host "Add $webUrl to the Cesium ion token's allowed URLs (ion.cesium.com > Access Tokens)." -ForegroundColor Yellow
