#Requires -Version 5.1
<#
.SYNOPSIS
    Развёртывание команды агентов на Windows 11: инструмент, память и окружение.

.DESCRIPTION
    Ставит систему целиком в одну папку: клонирует обёртку (бэкенд и фронт) и
    приватный репозиторий памяти, создаёт виртуальное окружение питона, ставит
    зависимости обеих частей и регистрирует MCP-сервер в Claude Code.

    Скрипт можно запускать повторно: всё, что уже стоит, он пропускает, а не
    переделывает. Данные он не трогает никогда — память приезжает git-ом.

    Что останется сделать руками, скрипт напечатает в конце: ключи провайдеров
    и пути к клонам рабочих проектов. И то и другое — про эту машину, поэтому
    в репозиториях их нет.

.PARAMETER Path
    Куда ставить. По умолчанию — %USERPROFILE%\AGENT.Dashboard.

.PARAMETER DataRepo
    Адрес приватного репозитория памяти.

.PARAMETER SkipMcp
    Не регистрировать MCP-сервер в Claude Code.

.EXAMPLE
    .\install-windows.ps1
    .\install-windows.ps1 -Path D:\work\AGENT.Dashboard
#>
param(
    [string]$Path = (Join-Path $HOME 'AGENT.Dashboard'),
    [string]$ToolRepo = 'https://github.com/AlexandraG-code/AGENT.Dashboard.git',
    [string]$DataRepo = 'https://github.com/AlexandraG-code/AGENT.Dashboard.DATA.git',
    [switch]$SkipMcp
)

$ErrorActionPreference = 'Stop'

function Write-Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Write-Ok($text)   { Write-Host "   $text" -ForegroundColor Green }
function Write-Skip($text) { Write-Host "   $text" -ForegroundColor DarkGray }

function Test-Command($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

# Питон ищется через лаунчер py: на Windows это единственный способ спросить
# конкретную версию, не угадывая, что лежит в PATH под именем python. Команда и
# её аргументы возвращаются отдельно: массив в операторе вызова не разворачивается,
# и `& @('py','-3.13')` искало бы программу с таким именем целиком.
function Resolve-Python {
    if (Test-Command 'py') {
        foreach ($version in '-3.13', '-3.12', '-3') {
            & py $version -c 'import sys' 2>$null
            if ($LASTEXITCODE -eq 0) {
                return [pscustomobject]@{ Exe = 'py'; Args = @($version) }
            }
        }
    }
    if (Test-Command 'python') {
        return [pscustomobject]@{ Exe = 'python'; Args = @() }
    }
    return $null
}

Write-Step 'Проверяю, что есть на машине'

if (-not (Test-Command 'git')) {
    throw 'Нет git. Поставь его: winget install --id Git.Git'
}
Write-Ok "git: $((git --version))"

$python = Resolve-Python
if (-not $python) {
    throw 'Нет питона. Поставь 3.13: winget install --id Python.Python.3.13'
}
$pyArgs = $python.Args
Write-Ok "питон: $(& $python.Exe @pyArgs -c 'import sys; print(sys.version.split()[0])')"

if (-not (Test-Command 'node')) {
    throw 'Нет Node.js. Поставь LTS: winget install --id OpenJS.NodeJS.LTS'
}
Write-Ok "node: $((node --version))"

if (-not (Test-Command 'yarn')) {
    # Corepack идёт в комплекте с Node и ставит yarn без отдельной установки.
    if (Test-Command 'corepack') {
        corepack enable | Out-Null
    }
    if (-not (Test-Command 'yarn')) {
        throw 'Нет yarn. Включи его: corepack enable (идёт вместе с Node.js)'
    }
}
Write-Ok "yarn: $((yarn --version))"

Write-Step "Инструмент: $Path"

if (Test-Path (Join-Path $Path 'backend')) {
    Write-Skip 'уже на месте, обновлять не буду — сделай git pull сама, если нужно'
} else {
    git clone $ToolRepo $Path
    Write-Ok 'склонирован'
}

$dataPath = Join-Path $Path 'data'

Write-Step "Память команды: $dataPath"

if (Test-Path (Join-Path $dataPath '.git')) {
    Write-Skip 'уже на месте'
} else {
    git clone $DataRepo $dataPath
    Write-Ok 'склонирована — составы команд, промпты, контекст и летопись приехали'
}

Write-Step 'Окружение питона'

$backend = Join-Path $Path 'backend'
$venv = Join-Path $backend '.venv'
$venvPython = Join-Path $venv 'Scripts\python.exe'

if (Test-Path $venvPython) {
    Write-Skip 'виртуальное окружение уже создано'
} else {
    & $python.Exe @pyArgs -m venv $venv
    Write-Ok 'виртуальное окружение создано'
}

# Зависимости пинятся точно, поэтому повторный запуск ничего не пересобирает.
& $venvPython -m pip install --upgrade pip --quiet
& $venvPython -m pip install -r (Join-Path $backend 'requirements.txt') --quiet
Write-Ok 'зависимости бэкенда поставлены'

& $venvPython -m compileall -q (Join-Path $backend 'fleet') (Join-Path $backend 'dashboard') | Out-Null
Write-Ok 'бэкенд компилируется'

Write-Step 'Зависимости фронта'

Push-Location (Join-Path $Path 'frontend')
try {
    yarn install --silent
    Write-Ok 'поставлены'
} finally {
    Pop-Location
}

Write-Step 'MCP-сервер в Claude Code'

if ($SkipMcp) {
    Write-Skip 'пропущено по ключу -SkipMcp'
} elseif (-not (Test-Command 'claude')) {
    Write-Skip 'claude не найден в PATH — зарегистрируй сервер потом, командой ниже'
} else {
    $launcher = Join-Path $backend 'run-mcp.cmd'
    # Регистрация хранится абсолютным путём, поэтому она своя на каждой машине.
    claude mcp remove fleet -s user 2>$null | Out-Null
    claude mcp add fleet -s user -- $launcher
    Write-Ok "зарегистрирован: $launcher"
}

Write-Host "`n== Готово" -ForegroundColor Cyan
Write-Host @"

Запуск:      $(Join-Path $Path 'start-windows.ps1')
Дашборд:     http://localhost:3001
API и Swagger: http://localhost:8770/docs

Осталось заполнить руками — это про машину, а не про проект, поэтому в git его нет:

  1. Ключи провайдеров — в дашборде, вкладка «Модели».
     Лягут в data\secrets.json, который не коммитится.

  2. Каталоги клонов рабочих проектов — вкладка «Пространства»,
     поле «Каталог репозитория», выбор папки в обзоре.
     Лягут в data\paths.local.json, тоже вне git.

  3. Если claude не нашёлся выше:
     claude mcp add fleet -s user -- $(Join-Path $backend 'run-mcp.cmd')

"@ -ForegroundColor Gray
