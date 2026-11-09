# =====================================================================
#  Conductor Cercano - LINK PUBLICO (https) con Cloudflare Tunnel
#  Uso:   .\publicar.ps1        (o doble clic en publicar.bat)
#  - Enciende la presentacion (si no esta encendida) en segundo plano.
#  - Crea un link https://....trycloudflare.com que se puede abrir desde
#    cualquier navegador (celular, laptop del profesor, etc.).
#  - El link funciona mientras esta ventana siga abierta.
#  No necesita cuenta de Cloudflare. La primera vez instala "cloudflared"
#  con winget (instalador oficial de Windows).
# =====================================================================
param([int]$Puerto = 8000)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
function Info($m) { Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m) { Write-Host "  [OK] $m" -ForegroundColor Green }
function Falla($m) { Write-Host "  [ERROR] $m" -ForegroundColor Red; Read-Host '  Presiona Enter para salir' | Out-Null; exit 1 }

Write-Host ""
Write-Host "  CONDUCTOR CERCANO - PUBLICAR LINK" -ForegroundColor Magenta
Write-Host ""

# 1) cloudflared
function Buscar-Cloudflared {
    $c = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    foreach ($r in @("${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe", "$env:ProgramFiles\cloudflared\cloudflared.exe",
                     "$env:LOCALAPPDATA\Microsoft\WinGet\Links\cloudflared.exe")) {
        if (Test-Path $r) { return $r }
    }
    return $null
}
$cf = Buscar-Cloudflared
if (-not $cf) {
    Info 'Instalando cloudflared (Cloudflare) con winget, solo la primera vez...'
    winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
    $cf = Buscar-Cloudflared
    if (-not $cf) { Falla 'No se pudo instalar cloudflared. Instalalo manualmente: winget install Cloudflare.cloudflared' }
}
Ok "cloudflared: $cf"

# 2) Servidor de la presentacion
$py = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $py)) { Falla 'No existe .venv. Ejecuta primero .\iniciar.ps1 una vez.' }
function Servidor-Listo {
    try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://127.0.0.1:$Puerto/api/estado").StatusCode -eq 200 } catch { $false }
}
$servidor = $null
if (Servidor-Listo) {
    Ok "La presentacion ya estaba encendida en el puerto $Puerto"
} else {
    Info 'Encendiendo la presentacion en segundo plano...'
    $env:PYTHONIOENCODING = 'utf-8'
    $servidor = Start-Process -FilePath $py -ArgumentList '-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', "$Puerto" `
        -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput "$PSScriptRoot\servidor.log" -RedirectStandardError "$PSScriptRoot\servidor.err.log"
    for ($i = 0; $i -lt 60 -and -not (Servidor-Listo); $i++) { Start-Sleep -Seconds 1 }
    if (-not (Servidor-Listo)) { Falla 'La presentacion no respondio. Revisa servidor.err.log' }
    Ok "Presentacion encendida en http://127.0.0.1:$Puerto"
}

# 3) Tunel publico
$log = Join-Path $PSScriptRoot 'tunel.log'
if (Test-Path $log) { Remove-Item $log -Force }
Info 'Creando el link publico (puede tardar unos segundos)...'
$tunel = Start-Process -FilePath $cf -ArgumentList 'tunnel', '--no-autoupdate', '--url', "http://127.0.0.1:$Puerto" `
    -WindowStyle Hidden -PassThru -RedirectStandardError $log -RedirectStandardOutput "$log.out"
$url = $null
for ($i = 0; $i -lt 60 -and -not $url; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $log) {
        $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($m) { $url = $m.Matches[0].Value }
    }
    if ($tunel.HasExited) { break }
}
if (-not $url) { Falla "No se obtuvo el link. Revisa $log (puede ser la conexion a Internet o un firewall)." }

# Esperar a que el link responda de verdad
for ($i = 0; $i -lt 30; $i++) {
    try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "$url/api/estado").StatusCode -eq 200) { break } } catch { Start-Sleep -Seconds 2 }
}
try { Set-Clipboard -Value $url } catch { }

Write-Host ""
Write-Host "  ==============================================================" -ForegroundColor Green
Write-Host "   LINK PUBLICO:  $url" -ForegroundColor Green
Write-Host "  ==============================================================" -ForegroundColor Green
Write-Host "   (copiado al portapapeles; compartelo por WhatsApp, correo, etc.)" -ForegroundColor DarkGray
Write-Host "   El link funciona mientras esta ventana siga abierta." -ForegroundColor Yellow
Write-Host ""
Start-Process $url

Read-Host '  Presiona Enter para DETENER el link publico'
if (-not $tunel.HasExited) { Stop-Process -Id $tunel.Id -Force }
if ($servidor -and -not $servidor.HasExited) { Stop-Process -Id $servidor.Id -Force }
Ok 'Link detenido.'
