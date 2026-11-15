<#
.SYNOPSIS
  One-time setup so GitHub Actions can deploy main to Azure without stored secrets.

.DESCRIPTION
  Run once from the repository root, after `az login`, by someone who owns the subscription.
    1. Creates the Entra app registration "redways-github-deploy" and its service principal.
    2. Adds a federated credential that only trusts GitHub Actions runs on
       ManuLoiacono/G21_RED_WAYS, branch main (OIDC; no client secret exists).
    3. Grants Contributor on the resource group only.
    4. Uploads app/.env (Cesium ion token) to the private build-inputs container.
    5. Writes the (non-secret) client, tenant and subscription IDs into the workflow file.
  Idempotent: re-running reuses what already exists.
#>
param(
  [string]$Storage = "redwaysg21",
  [string]$ResourceGroup = "redways-rg",
  [string]$Repo = "ManuLoiacono/G21_RED_WAYS",
  [string]$AppName = "redways-github-deploy"
)

$ErrorActionPreference = "Continue"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "../.."))
function Fail($msg) { Write-Host $msg -ForegroundColor Red; exit 1 }

$appId = az ad app list --display-name $AppName --query "[0].appId" -o tsv
if (-not $appId) { $appId = az ad app create --display-name $AppName --query appId -o tsv }
if (-not $appId) { Fail "Could not create the app registration." }

$sp = az ad sp list --filter "appId eq '$appId'" --query "[0].id" -o tsv
if (-not $sp) { $sp = az ad sp create --id $appId --query id -o tsv }
if (-not $sp) { Fail "Could not create the service principal." }

$has = az ad app federated-credential list --id $appId --query "[?name=='github-main'].name" -o tsv
if (-not $has) {
  $file = Join-Path $env:TEMP "redways-fic.json"
  $cred = @{ name = "github-main"; issuer = "https://token.actions.githubusercontent.com";
             subject = "repo:${Repo}:ref:refs/heads/main"; audiences = @("api://AzureADTokenExchange") }
  [IO.File]::WriteAllText($file, ($cred | ConvertTo-Json -Compress))
  az ad app federated-credential create --id $appId --parameters "@$file" -o none
  if ($LASTEXITCODE -ne 0) { Fail "Could not add the federated credential." }
}

$scope = az group show -n $ResourceGroup --query id -o tsv
az role assignment create --assignee-object-id $sp --assignee-principal-type ServicePrincipal `
  --role Contributor --scope $scope -o none --only-show-errors
if ($LASTEXITCODE -ne 0) { Fail "Could not assign Contributor on $ResourceGroup." }

if (-not (Test-Path "app/.env")) { Fail "Missing app/.env (VITE_CESIUM_ION_TOKEN)." }
az storage blob upload --account-name $Storage --container-name build-inputs --name app.env `
  --file app/.env --overwrite --auth-mode key --only-show-errors -o none
if ($LASTEXITCODE -ne 0) { Fail "Could not upload app/.env to build-inputs." }

$tenant = az account show --query tenantId -o tsv
$sub = az account show --query id -o tsv
$wf = ".github/workflows/deploy-azure.yml"
$text = [IO.File]::ReadAllText($wf)
$text = $text -replace 'AZURE_CLIENT_ID: ".*"', "AZURE_CLIENT_ID: `"$appId`"" `
              -replace 'AZURE_TENANT_ID: ".*"', "AZURE_TENANT_ID: `"$tenant`"" `
              -replace 'AZURE_SUBSCRIPTION_ID: ".*"', "AZURE_SUBSCRIPTION_ID: `"$sub`""
[IO.File]::WriteAllText($wf, $text)

Write-Host "Done. IDs written to $wf (they are identifiers, not secrets)." -ForegroundColor Green
