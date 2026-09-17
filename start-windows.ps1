#Requires -Version 5.1
<#
.SYNOPSIS
    Запуск команды агентов: API и интерфейс.

.DESCRIPTION
    Поднимает две части в отдельных окнах: бэкенд на 8770 (API, Swagger на
    /docs) и фронт на 3001. В браузере нужен только 3001 — он сам проксирует
    /api на бэкенд.

    MCP-сервер здесь не запускается намеренно: его поднимает сам Claude Code
    своим процессом на каждую сессию, и второй экземпляр только мешал бы.

.PARAMETER NoBrowser
    Не открывать браузер после запуска.
#>
param(
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$venvPython = Join-Path $backend '.venv\Scripts\python.exe'

if (-not (Test-Path $venvPython)) {
    throw "Нет окружения питона ($venvPython). Сначала прогони install-windows.ps1"
}
if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
    throw 'Не поставлены зависимости фронта. Сначала прогони install-windows.ps1'
}
if (-not (Test-Path (Join-Path $root 'data'))) {
    throw 'Нет каталога data: память команды не склонирована. Прогони install-windows.ps1'
}

Write-Host '== Поднимаю API на 8770' -ForegroundColor Cyan
Start-Process -FilePath (Join-Path $backend 'run-dashboard.cmd') -WorkingDirectory $backend

# Ждём, пока API ответит: фронт без него покажет пустой экран и ошибку запроса,
# а человек решит, что сломалось всё.
$ready = $false
foreach ($attempt in 1..30) {
    Start-Sleep -Milliseconds 500
    try {
        $answer = Invoke-WebRequest -Uri 'http://127.0.0.1:8770/api/state' -UseBasicParsing -TimeoutSec 2
        if ($answer.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
}
if ($ready) {
    Write-Host '   API отвечает' -ForegroundColor Green
} else {
    Write-Host '   API не ответил за 15 секунд — смотри его окно, запуск продолжаю' -ForegroundColor Yellow
}

Write-Host '== Поднимаю интерфейс на 3001' -ForegroundColor Cyan
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'yarn dev' -WorkingDirectory $frontend

if (-not $NoBrowser) {
    Start-Sleep -Seconds 4
    Start-Process 'http://localhost:3001'
}

Write-Host @"

Дашборд:       http://localhost:3001
API и Swagger: http://localhost:8770/docs

Закрыть — закрыть два окна, которые открылись.
"@ -ForegroundColor Gray
