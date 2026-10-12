# Read-only. Optional -LanIp selects a particular physical adapter when several exist.
[CmdletBinding()]
param([string]$LanIp)

$repoRoot = Split-Path -Parent $PSScriptRoot
$excludedAdapters = 'vEthernet|WSL|VirtualBox|VMware|Hyper-V|Virtual|Loopback|VPN|TAP|TUNNEL'
$candidates = @()
try {
    $candidates = @(
        Get-NetIPConfiguration -ErrorAction Stop | Where-Object {
            $_.IPv4DefaultGateway.NextHop -and
            $_.NetAdapter.Status -eq 'Up' -and
            $_.NetAdapter.HardwareInterface -ne $false -and
            $_.InterfaceAlias -notmatch $excludedAdapters -and
            $_.InterfaceDescription -notmatch $excludedAdapters
        } | ForEach-Object {
            $config = $_
            foreach ($address in $config.IPv4Address) {
                if ($address.IPAddress -match '^\d+\.\d+\.\d+\.\d+$' -and
                    $address.IPAddress -notmatch '^(127\.|169\.254\.|0\.)') {
                    [pscustomobject]@{ IP = $address.IPAddress; Index = $config.InterfaceIndex }
                }
            }
        } | Sort-Object Index, IP -Unique
    )
} catch {
    # Report the failed LAN check below without dumping exception details.
}
if ($LanIp) {
    if ($LanIp -notin @($candidates.IP)) { $LanIp = $null }
} elseif ($candidates.Count -gt 0) {
    $LanIp = $candidates[0].IP
    # Prefer the configured phone URL if it matches a current physical adapter.
    $phoneEnv = Join-Path $repoRoot 'UniSafe\.env'
    if (Test-Path -LiteralPath $phoneEnv) {
        $phoneLines = @(Select-String -LiteralPath $phoneEnv -Pattern '^\s*(?:export\s+)?EXPO_PUBLIC_API_URL\s*=' -ErrorAction SilentlyContinue)
        foreach ($entry in $phoneLines) {
            if ($entry.Line -match 'http://(?<ip>\d+\.\d+\.\d+\.\d+):3001' -and
                $Matches.ip -in @($candidates.IP)) { $LanIp = $Matches.ip }
        }
    }
}

try {
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object LocalPort -eq 3001)
    if ($listeners.Count -gt 0) { Write-Output 'PASS TCP 3001: listening' }
    else { Write-Output 'FAIL TCP 3001: no listener' }
} catch { Write-Output 'FAIL TCP 3001: unable to inspect listeners' }

function Test-DemoHealth {
    param([string]$Url)
    try {
        $health = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 8 -ErrorAction Stop
        $engine = switch ([string]$health.db.engine) {
            'postgresql' { 'postgresql' }
            'sqlite' { 'sqlite' }
            default { 'unknown' }
        }
        if ($health.status -eq 'ok' -and $health.db.connected -eq $true -and $engine -eq 'postgresql') {
            Write-Output ('PASS {0}: status=ok, db.connected=true, db.engine={1}' -f $Url, $engine)
        } else {
            Write-Output ('FAIL {0}: demo requires connected PostgreSQL, db.engine={1}' -f $Url, $engine)
        }
    } catch { Write-Output ('FAIL {0}: request failed' -f $Url) }
}
Test-DemoHealth -Url 'http://localhost:3001/health'
Test-DemoHealth -Url 'http://localhost:3001/api/health'
if ($LanIp) { Test-DemoHealth -Url ('http://{0}:3001/health' -f $LanIp) }
else { Write-Output 'FAIL LAN health: no matching physical LAN IPv4 with default gateway' }

try {
    # Human-readable rule names appear under DisplayName in Windows Firewall.
    $rules = @(Get-NetFirewallRule -ErrorAction Stop | Where-Object {
        $_.DisplayName -eq 'UniSafe API 3001' -or $_.Name -eq 'UniSafe API 3001'
    })
    if ($rules.Count -gt 0) { Write-Output 'PASS firewall: UniSafe API 3001 exists (existence only)' }
    else { Write-Output 'FAIL firewall: UniSafe API 3001 missing' }
} catch { Write-Output 'FAIL firewall: unable to inspect rules' }

try {
    $dashboardEnv = Join-Path $repoRoot 'uniforce-dashboard\.env'
    $entries = @()
    if (Test-Path -LiteralPath $dashboardEnv) {
        $entries = @(Select-String -LiteralPath $dashboardEnv -Pattern '^\s*(?:export\s+)?VITE_API_URL\s*=' -ErrorAction Stop)
    }
    if ($entries.Count -eq 0) { Write-Output 'PASS dashboard VITE_API_URL: unset (local development default)' }
    else {
        $value = ($entries[-1].Line -replace '^\s*(?:export\s+)?VITE_API_URL\s*=\s*', '').Trim()
        # Parse only this public variable, accepting dotenv quoting/comments.
        if ($value -match '^"(?<value>[^"\r\n]*)"\s*(?:#.*)?$' -or
            $value -match "^'(?<value>[^'\r\n]*)'\s*(?:#.*)?$") { $value = $Matches.value }
        else { $value = ($value -replace '#.*$', '').Trim() }
        $uri = $null
        if ([string]::IsNullOrWhiteSpace($value)) { Write-Output 'PASS dashboard VITE_API_URL: blank (same origin)' }
        elseif ([uri]::TryCreate($value, [UriKind]::Absolute, [ref]$uri) -and
            $uri.Scheme -in @('http', 'https') -and
            ($uri.Host -eq 'localhost' -or $uri.IsLoopback)) {
            Write-Output 'PASS dashboard VITE_API_URL: localhost/loopback (local)'
        } else { Write-Output 'FAIL dashboard VITE_API_URL: remote or invalid address (bad for local demo)' }
    }
} catch { Write-Output 'FAIL dashboard VITE_API_URL: unable to read public setting' }

$phoneAddress = if ($LanIp) { $LanIp } else { '<ip>' }
Write-Output ('Now open http://{0}:3001/health in the PHONE browser.' -f $phoneAddress)
