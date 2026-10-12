# Run manually. Opens visible, separate development terminal windows.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
# Stop on inspection errors rather than risk starting a duplicate API.
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object LocalPort -eq 3001)

function Start-DemoWindow {
    param([string]$Title, [string]$NpmCommand)
    $quotedRoot = $repoRoot.Replace("'", "''")
    $windowCommand = "`$Host.UI.RawUI.WindowTitle = '$Title'`r`nSet-Location -LiteralPath '$quotedRoot'`r`n$NpmCommand"
    $encodedCommand = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($windowCommand))
    Start-Process -FilePath 'powershell.exe' -WorkingDirectory $repoRoot -WindowStyle Normal -ArgumentList @(
        '-NoProfile', '-NoExit', '-EncodedCommand', $encodedCommand
    )
}

if ($listeners.Count -eq 0) {
    Start-DemoWindow -Title 'UniSafe API - port 3001' -NpmCommand '$env:ALLOW_SQLITE_FALLBACK = ''false''; npm run server'
} else {
    Write-Output 'TCP 3001 already has a listener; API startup skipped.'
}
# Verify both endpoints before launching clients, including when reusing a listener.
$deadline = (Get-Date).AddSeconds(30)
do {
    $ready = $true
    foreach ($endpoint in @('/health', '/api/health')) {
        try {
            $health = Invoke-RestMethod -Uri "http://localhost:3001$endpoint" -TimeoutSec 2 -ErrorAction Stop
        } catch {
            $ready = $false
            break
        }
        if ($health.status -ne 'ok' -or $health.db.connected -ne $true -or $health.db.engine -ne 'postgresql') {
            throw "Demo requires a healthy PostgreSQL API at $endpoint. Check the API configuration and the listener on port 3001."
        }
    }
    if ($ready) { break }
    Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)
if (-not $ready) { throw 'PostgreSQL API did not become healthy on port 3001. Check the API terminal.' }
Start-DemoWindow -Title 'UniForce Dashboard' -NpmCommand 'npm run dashboard'
Start-DemoWindow -Title 'UniSafe Expo - Phone' -NpmCommand 'npm start'
