$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$appEnvPath = Join-Path $repoRoot "my-app\.env.local"

if (-not (Test-Path -LiteralPath $appEnvPath)) {
  throw "Missing app env file: $appEnvPath"
}

$envMap = @{}
Get-Content -LiteralPath $appEnvPath | ForEach-Object {
  if ($_ -match '^\s*([^#=\s]+)\s*=\s*(.*)\s*$') {
    $key = $matches[1]
    $value = $matches[2].Trim()
    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $envMap[$key] = $value
  }
}

$serviceUrlRaw = $envMap["AUTOMATION_WORKER_URL"]
if (-not $serviceUrlRaw) {
  $serviceUrlRaw = $envMap["AUTOMATION_SERVICE_URL"]
}
if (-not $serviceUrlRaw) {
  throw "Missing AUTOMATION_WORKER_URL (or AUTOMATION_SERVICE_URL) in app env."
}
$serviceUrl = [uri]$serviceUrlRaw
$env:PORT = [string]$serviceUrl.Port
$env:AUTOMATION_SERVICE_TOKEN = $envMap["AUTOMATION_SERVICE_TOKEN"]
$env:OPENCLAW_GATEWAY_URL = $envMap["OPENCLAW_API_URL"]
$env:OPENCLAW_GATEWAY_TOKEN = $envMap["OPENCLAW_API_KEY"]
$env:OPENAI_API_KEY = $envMap["OPENAI_API_KEY"]

Write-Host "[AUTOMATION_WORKER] local-start" @{
  port = $env:PORT
  serviceUrl = $serviceUrl.ToString().TrimEnd("/")
  gatewayUrl = $env:OPENCLAW_GATEWAY_URL
}

Set-Location -LiteralPath $PSScriptRoot
node src/server.mjs
