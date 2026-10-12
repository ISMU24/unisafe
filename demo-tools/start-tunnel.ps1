# Run manually in a dedicated PowerShell window. Ctrl+C stops the tunnel.
[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 3001,
    [ValidateSet('localhost', '127.0.0.1')]
    [string]$ApiHost = 'localhost',
    [ValidateSet('auto', 'http2', 'quic')]
    [string]$Protocol = 'auto'
)

$ErrorActionPreference = 'Stop'
$connector = Get-Command cloudflared.exe -CommandType Application -ErrorAction SilentlyContinue
if (-not $connector) {
    throw 'cloudflared is not on PATH. Install it using LOCAL-TUNNEL-DEMO.md, then reopen PowerShell.'
}

$apiBase = 'http://{0}:{1}' -f $ApiHost, $Port
foreach ($endpoint in @('/health', '/api/health')) {
    try {
        $health = Invoke-RestMethod -Uri "$apiBase$endpoint" -Method Get -TimeoutSec 10 -ErrorAction Stop
    } catch {
        throw "Local API health check failed at $apiBase$endpoint. Run npm start in UniSafe/server with PostgreSQL configured and check its terminal. No tunnel started."
    }
    if ($health.status -ne 'ok' -or $health.db.connected -ne $true -or $health.db.engine -ne 'postgresql') {
        throw "Expected a healthy PostgreSQL API at $apiBase$endpoint. Check the process using port $Port. No tunnel started."
    }
}

Write-Host "Forwarding only $apiBase. Copy the HTTPS trycloudflare.com URL printed below."
Write-Host 'Keep this window open. Ctrl+C stops public access. The URL may change on restart.'
# Do not persist the generated URL, read .env, serve files, or launch other ports.
& $connector.Source tunnel --url $apiBase --protocol $Protocol
if ($LASTEXITCODE -ne 0) {
    throw "cloudflared exited with code $LASTEXITCODE. See LOCAL-TUNNEL-DEMO.md troubleshooting."
}
