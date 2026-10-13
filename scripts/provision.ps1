param(
    [Parameter(Mandatory)]
    [string]$Subscription,
    [Parameter(Mandatory)]
    [string]$ResourceGroup,
    [string]$Name = 'conversation-evaluation-demo',
    [Parameter(Mandatory)]
    [string]$Location,
    [Parameter(Mandatory)]
    [string]$Repository
)

$ErrorActionPreference = 'Stop'
$env:AZURE_EXTENSION_USE_DYNAMIC_INSTALL = 'no'
$root = Split-Path $PSScriptRoot -Parent
$localSettings = Join-Path $root '.local.env'
if (-not (Test-Path $localSettings)) { throw 'Configure the ignored server settings before deploying.' }

$existing = az staticwebapp list --subscription $Subscription --resource-group $ResourceGroup `
    --query "[?name=='$Name'].name" --output tsv
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect Static Web Apps.' }
if (-not $existing) {
    az deployment group create --subscription $Subscription --resource-group $ResourceGroup `
        --name 'conversation-lab' --template-file (Join-Path $root 'infra\main.bicep') `
        --parameters "name=$Name" "location=$Location" --mode Incremental --output none
    if ($LASTEXITCODE -ne 0) { throw 'Static Web App creation failed.' }
}

$settings = @{}
foreach ($line in Get-Content $localSettings) {
    $equals = $line.IndexOf('=')
    if ($equals -lt 1) { continue }
    $key = $line.Substring(0, $equals)
    if ($key -match '^(FOUNDRY_|JOB_SIGNING_KEY$|LIVE_CALLS_ENABLED$)') {
        $settings[$key] = $line.Substring($equals + 1) | ConvertFrom-Json
    }
}
foreach ($key in @('FOUNDRY_PROJECT_ENDPOINT', 'FOUNDRY_CLIENT_ID', 'FOUNDRY_CLIENT_SECRET',
    'FOUNDRY_TENANT_ID', 'FOUNDRY_JUDGE_DEPLOYMENT', 'FOUNDRY_CHAT_DEPLOYMENT',
    'FOUNDRY_RUBRIC_NAME', 'FOUNDRY_RUBRIC_VERSION', 'JOB_SIGNING_KEY')) {
    if (-not $settings[$key]) { throw "Missing server setting: $key" }
}

try {
    $arguments = @('staticwebapp', 'appsettings', 'set', '--subscription', $Subscription,
        '--resource-group', $ResourceGroup, '--name', $Name, '--setting-names')
    $arguments += $settings.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
    $arguments += @('--output', 'none')
    & az @arguments
    if ($LASTEXITCODE -ne 0) { throw 'Server setting configuration failed.' }
} finally {
    $settings.Clear()
    $arguments = $null
}

$token = az staticwebapp secrets list --subscription $Subscription --resource-group $ResourceGroup `
    --name $Name --query properties.apiKey --output tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Unable to retrieve the deployment token.' }
try {
    $token | gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN --repo $Repository
    if ($LASTEXITCODE -ne 0) { throw 'Unable to configure the GitHub deployment secret.' }
} finally {
    $token = $null
}
az staticwebapp show --subscription $Subscription --resource-group $ResourceGroup --name $Name `
    --query '{hostname:defaultHostname,state:provisioningState}' --output json
if ($LASTEXITCODE -ne 0) { throw 'Unable to read the deployed site.' }
