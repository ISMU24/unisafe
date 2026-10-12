# UniSafe: temporary HTTPS demo on Windows

Keep the API on your laptop and use its configured PostgreSQL database.
PostgreSQL is mandatory for this demo. Cloudflare Quick Tunnel forwards one
local HTTP service through a temporary HTTPS URL; no account or purchased domain
is required. This is for a supervised demo, with no uptime guarantee.
[Cloudflare Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

Only API port 3001 is forwarded, including its Socket.IO endpoint. The PostgreSQL
port is not forwarded, and the launcher does not serve directories, database files or
`.env`. Existing API authentication and public endpoints remain as implemented.
Keep JWT secrets server-side. Leave the local dashboard on `http://localhost:5173`
with `VITE_API_URL=http://localhost:3001`.

## 1. Install/check cloudflared

Install once using the [WinGet package](https://github.com/microsoft/winget-pkgs/tree/master/manifests/c/Cloudflare/cloudflared):

```powershell
winget install --id Cloudflare.cloudflared --exact --source winget
```

Open a new PowerShell window so PATH refreshes, then check:

```powershell
Get-Command cloudflared.exe
cloudflared --version
```

If WinGet is unavailable, use Cloudflare's official Windows MSI or executable
from [Downloads](https://developers.cloudflare.com/tunnel/downloads/). For the
launcher, ensure `cloudflared.exe` is on PATH. Windows installations require
manual updates; use `winget upgrade --id Cloudflare.cloudflared --exact --source winget`
if installed through WinGet. No Windows service installation is needed.

## 2. Start the API (terminal A)

```powershell
Set-Location 'C:\Users\israe\Desktop\Project\UniSafe\server'
npm start
```

Leave this running. Expect `PostgreSQL database connection verified.` and
`UniSafe server (PostgreSQL + RAG + PDF + Socket.IO) listening on :3001`.
Use the existing PostgreSQL configuration without changing credentials. Missing
or invalid PostgreSQL configuration must be fixed; do not switch to SQLite.
Do not run init, seed or reset commands to prepare this demo. Normal startup
retains schema initialization and conditional initial-admin bootstrap.
See [local API details](UniSafe/DEPLOYMENT.md#local-postgresql-demo-with-an-https-tunnel).

## 3. Start the tunnel (terminal B)

```powershell
Set-Location 'C:\Users\israe\Desktop\Project'
.\demo-tools\start-tunnel.ps1
```

The script checks both local health endpoints and requires a connected PostgreSQL
database before invoking cloudflared. It runs in the foreground and saves no URL
or configuration. Its equivalent direct command is:

```powershell
cloudflared tunnel --url http://localhost:3001
```

If PowerShell policy blocks the script, check local health manually and use that
direct command; do not change machine execution policy. The generated public URL
appears in cloudflared's terminal output as `https://<assigned-name>.trycloudflare.com`.
Copy the HTTPS origin, without `/api` or a trailing slash. Keep terminal B open.

## 4. Verify public health (terminal C)

Paste the generated origin at the prompt; it stays in this shell variable, not
in a tracked source file:

```powershell
$TunnelUrl = (Read-Host 'Paste the generated HTTPS tunnel origin').Trim().TrimEnd('/')
if ($TunnelUrl -notmatch '^https://[a-z0-9-]+\.trycloudflare\.com$') {
    throw 'Expected the HTTPS trycloudflare.com origin, without a path.'
}
foreach ($Endpoint in @('/health', '/api/health')) {
    $Health = Invoke-RestMethod -Uri "$TunnelUrl$Endpoint" -TimeoutSec 30 -ErrorAction Stop
    if ($Health.status -ne 'ok' -or $Health.db.connected -ne $true -or $Health.db.engine -ne 'postgresql') {
        throw "Unexpected database health at $Endpoint"
    }
    Write-Output "PASS $Endpoint : PostgreSQL connected"
}
```

Both should return HTTP 200 with `status: "ok"` and
`db: { engine: "postgresql", connected: true }`. `/api/health` also reports optional
AI/index status. Open the same HTTPS `/health` URL on the phone using mobile data
to check external reachability. These checks do not prove login or realtime works.

## 5. APK configuration and stopping

The APK embeds `EXPO_PUBLIC_API_URL` at build time. A previously installed APK
pointing to Render or a LAN address will not switch automatically. Supply the
current URL through a local build environment when separately building the APK;
check for EAS profile overrides. Do not commit generated URLs to `eas.json`,
source files or documentation. No deployment or APK build is performed by these scripts.

Press **Ctrl+C in terminal B** to stop cloudflared and end tunnel access. Stop the
API separately with Ctrl+C in terminal A when finished. A new Quick Tunnel gets
a new hostname: expect to update the mobile build configuration and rebuild if
the address changes. Keep the laptop awake and connected throughout the demo.

## Troubleshooting

| Problem | Check/action |
|---|---|
| API not running | Run `Invoke-RestMethod http://localhost:3001/health`. If it fails, inspect terminal A and start `npm start`; do not start a tunnel until local health succeeds. |
| Port 3001 already in use | Run `Get-NetTCPConnection -LocalPort 3001 -State Listen \| Select-Object LocalAddress,OwningProcess`, then `Get-Process -Id <OwningProcess>`. Reuse only a verified UniSafe PostgreSQL API, or stop its owning terminal with Ctrl+C. Do not kill an unknown process. |
| Alternate API port | In terminal A set `$env:PORT = '3002'` before starting the API, and run `.\demo-tools\start-tunnel.ps1 -Port 3002` in terminal B. Update local dashboard configuration too. Only that selected API port is forwarded. |
| Windows Firewall / campus network | Keep the firewall enabled. No inbound port-3001 rule or router forwarding is needed for the local connector. It needs outbound Cloudflare connectivity on port 7844: UDP for QUIC or TCP for HTTP/2. If UDP is blocked, try `.\demo-tools\start-tunnel.ps1 -Protocol http2`. If both are blocked, use an allowed network or consult its administrator. [Firewall requirements](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/) |
| Tunnel returns 502 / connection refused | Verify local health and the selected port. The upstream must be `http://localhost:3001`, not HTTPS. If localhost resolves to an unusable IPv6 address, try `.\demo-tools\start-tunnel.ps1 -ApiHost 127.0.0.1`. A connected tunnel cannot fix an unavailable local API. [Cloudflare troubleshooting](https://developers.cloudflare.com/tunnel/troubleshooting/) |
| Quick Tunnel conflicts with existing configuration | An existing `.cloudflared/config.yaml` can prevent Quick Tunnel mode. Back up and temporarily rename the conflicting config only if it is yours and unused; restore it afterward. Do not delete certificates or credentials. [Cloudflare configuration issue](https://github.com/cloudflare/cloudflare-docs/issues/28227) |
| Socket.IO fails | Forward the whole API origin, including `/socket.io`, using the same HTTPS base as REST. Sign in with a valid existing account; sockets require an access token. Verify the APK actually embeds the current URL. Keep it foregrounded during realtime checks. |
| Browser CORS errors | Keep the dashboard's exact origin in `CLIENT_ORIGINS`, normally `http://localhost:5173`, and restart the API after changing server settings. Vite may choose another port if 5173 is busy. Do not add `*` or disable authentication. The tunnel URL is the API destination, not the local dashboard origin. |

Cloudflare supports [WebSockets](https://developers.cloudflare.com/network/websockets/).
To check just the public Socket.IO polling transport from terminal C:

```powershell
curl.exe --silent --show-error --fail "$TunnelUrl/socket.io/?EIO=4&transport=polling"
```

A response beginning `0{"sid":...}` confirms transport reachability only; it does
not authenticate a Socket.IO session or prove events arrive. Keep the existing
JWT handshake. Do not add an interactive email-login gate to this tunnel: the
native app cannot complete that browser flow. Quick Tunnels do not support SSE;
this project uses Socket.IO instead. Stop the tunnel after the demonstration.
