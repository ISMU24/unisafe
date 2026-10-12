# Run manually before starting Expo. Does not start any services.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$excludedAdapters = 'vEthernet|WSL|VirtualBox|VMware|Hyper-V|Virtual|Loopback|VPN|TAP|TUNNEL'
$candidates = @(
    Get-NetIPConfiguration | Where-Object {
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
                [pscustomobject]@{
                    IP = $address.IPAddress
                    Adapter = $config.InterfaceAlias
                    Index = $config.InterfaceIndex
                }
            }
        }
    } | Sort-Object Index, IP -Unique
)
if ($candidates.Count -eq 0) {
    throw 'No active physical LAN IPv4 with a default gateway was found. Connect to Wi-Fi or Ethernet.'
}
$selected = $candidates[0]
if ($candidates.Count -gt 1) {
    for ($i = 0; $i -lt $candidates.Count; $i++) {
        Write-Host ('{0}. {1} ({2})' -f ($i + 1), $candidates[$i].IP, $candidates[$i].Adapter)
    }
    do {
        $choice = 0
        $answer = Read-Host 'Choose the adapter on the same network as the phone (number)'
        $valid = [int]::TryParse($answer, [ref]$choice) -and $choice -ge 1 -and $choice -le $candidates.Count
    } until ($valid)
    $selected = $candidates[$choice - 1]
}
$url = 'http://{0}:3001' -f $selected.IP
$envPath = Join-Path $repoRoot 'UniSafe\.env'
$sourcePath = $envPath
if (-not [System.IO.File]::Exists($envPath)) {
    $sourcePath = Join-Path $repoRoot 'UniSafe\.env.example'
    if (-not [System.IO.File]::Exists($sourcePath)) {
        throw 'UniSafe/.env and its .env.example template are both missing.'
    }
}
# Read internally to preserve every other line; never emit file contents.
$utf8 = [System.Text.UTF8Encoding]::new($false, $true)
$content = [System.IO.File]::ReadAllText($sourcePath, $utf8)
$pattern = '(?m)^([\t ]*(?:export[\t ]+)?EXPO_PUBLIC_API_URL[\t ]*=[\t ]*)[^\r\n]*'
if ([regex]::IsMatch($content, $pattern)) {
    $content = [regex]::Replace($content, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{
        param($match)
        return $match.Groups[1].Value + $url
    })
} else {
    $newlineMatch = [regex]::Match($content, '\r\n|\n|\r')
    $newline = if ($newlineMatch.Success) { $newlineMatch.Value } else { [Environment]::NewLine }
    if ($content.Length -gt 0 -and $content -notmatch '[\r\n]$') { $content += $newline }
    $content += 'EXPO_PUBLIC_API_URL=' + $url + $newline
}
[System.IO.File]::WriteAllText($envPath, $content, [System.Text.UTF8Encoding]::new($false))
Write-Output $url
