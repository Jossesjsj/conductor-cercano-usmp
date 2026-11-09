# =====================================================================
#  Conductor Cercano · USMP — Arranque en Windows (PowerShell / VS Code)
#  Uso:   .\iniciar.ps1              (puerto 8000)
#         .\iniciar.ps1 -Puerto 8010
#  Si PowerShell bloquea scripts:  powershell -ExecutionPolicy Bypass -File .\iniciar.ps1
# =====================================================================
param([int]$Puerto = 8000, [switch]$SinNavegador)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
function Info($m) { Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m) { Write-Host "  [OK] $m" -ForegroundColor Green }
function Falla($m) { Write-Host "  [ERROR] $m" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  ASIGNACION DEL CONDUCTOR MAS CERCANO - USMP" -ForegroundColor Magenta
Write-Host "  Proyecto Integrador N.2 - Algoritmos y Estructura de Datos II" -ForegroundColor DarkGray
Write-Host ""

# 1) Entorno virtual (se reutiliza si ya existe)
$py = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $py)) {
    Info 'No existe .venv: creando entorno virtual...'
    $base = $null
    $candidatos = @(@{ exe = 'py'; args = @('-3.12') }, @{ exe = 'py'; args = @('-3.11') }, @{ exe = 'py'; args = @('-3') }, @{ exe = 'python'; args = @() })
    foreach ($c in $candidatos) {
        try {
            $v = & $c.exe @($c.args + @('-c', 'import sys; print(sys.version_info >= (3, 11))')) 2>$null
            if ($v -eq 'True') { $base = $c; break }
        } catch { }
    }
    if (-not $base) { Falla 'Se necesita Python 3.11 o superior (https://www.python.org/downloads/).' }
    & $base.exe @($base.args + @('-m', 'venv', '.venv'))
    if (-not (Test-Path $py)) { Falla 'No se pudo crear el entorno virtual.' }
}
Ok "Python: $(& $py --version)"

# 2) Dependencias
& $py -c "import fastapi, uvicorn, osmnx, networkx, folium, matplotlib" 2>$null
if ($LASTEXITCODE -ne 0) {
    Info 'Instalando dependencias (requirements.txt)...'
    & $py -m pip install -q --upgrade pip
    & $py -m pip install -q -r requirements.txt
    if ($LASTEXITCODE -ne 0) { Falla 'pip install fallo. Revisa tu conexion a Internet.' }
}
Ok 'Dependencias instaladas'

# 3) Red vial local (RF-01): se descarga una sola vez
if (-not (Test-Path 'datos\comas_red.graphml')) {
    Info 'No existe datos\comas_red.graphml: descargando red vial de OpenStreetMap (una sola vez)...'
    & $py -m datos.descargar_red
    if ($LASTEXITCODE -ne 0) { Falla 'No se pudo descargar la red. Reintenta en unos minutos (Overpass puede estar saturado).' }
}
Ok 'Red vial de Comas disponible (datos\comas_red.graphml)'

# 4) Puerto libre
$ocupado = Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue
if ($ocupado) {
    $proc = Get-Process -Id $ocupado[0].OwningProcess -ErrorAction SilentlyContinue
    Write-Host "  [AVISO] El puerto $Puerto esta en uso por '$($proc.ProcessName)' (PID $($proc.Id))." -ForegroundColor Yellow
    $Puerto = $Puerto + 1
    while (Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue) { $Puerto++ }
    Info "Se usara el puerto libre $Puerto."
}

# 5) Arranque: FastAPI sirve la API y la presentacion (frontend/) en la misma URL
$url = "http://127.0.0.1:$Puerto"
Write-Host ""
Write-Host "  Presentacion:  $url" -ForegroundColor Green
Write-Host "  API (OpenAPI): $url/docs" -ForegroundColor Green
Write-Host "  Detener: Ctrl + C" -ForegroundColor DarkGray
Write-Host ""
if (-not $SinNavegador) {
    Start-Job -ScriptBlock { param($u) Start-Sleep -Seconds 4; Start-Process $u } -ArgumentList $url | Out-Null
}
$env:PYTHONIOENCODING = 'utf-8'
$ErrorActionPreference = 'Continue'  # uvicorn escribe su registro en stderr
& $py -m uvicorn main:app --host 127.0.0.1 --port $Puerto
