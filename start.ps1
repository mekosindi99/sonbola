# ============================================================
#  Sonbola Auto-Start Script
# ============================================================

$ErrorActionPreference = "Continue"
$ROOT = $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Sonbola - Auto Setup & Start" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. تحقق من pnpm ──────────────────────────────────────
Write-Host "[1/6] Checking pnpm..." -ForegroundColor Yellow
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    npm install -g pnpm
}
Write-Host "  OK" -ForegroundColor Green

# ── 2. إضافة PostgreSQL للـ PATH ─────────────────────────
Write-Host "[2/6] Checking PostgreSQL..." -ForegroundColor Yellow
$pgPaths = @(
    "C:\Program Files\PostgreSQL\17\bin",
    "C:\Program Files\PostgreSQL\16\bin",
    "C:\Program Files\PostgreSQL\15\bin",
    "C:\Program Files\PostgreSQL\18\bin"
)
foreach ($p in $pgPaths) {
    if (Test-Path "$p\psql.exe") {
        $env:Path += ";$p"
        Write-Host "  Found: $p" -ForegroundColor Green
        break
    }
}

# ── 3. تحقق من ملف .env ──────────────────────────────────
Write-Host "[3/6] Checking .env file..." -ForegroundColor Yellow
$envFile = "$ROOT\artifacts\api-server\.env"
if (-not (Test-Path $envFile)) {
    Copy-Item "$ROOT\artifacts\api-server\.env.example" $envFile
    Write-Host "  Please edit the .env file, then press Enter..." -ForegroundColor Red
    notepad $envFile
    Read-Host
}

# قراءة .env
Get-Content $envFile | ForEach-Object {
    if ($_ -match "^([^#][^=]+)=(.+)$") {
        [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
    }
}
Write-Host "  OK" -ForegroundColor Green

# ── 4. إصلاح allowBuilds في pnpm-workspace.yaml ──────────
Write-Host "[4/6] Installing packages..." -ForegroundColor Yellow
$wsFile = "$ROOT\pnpm-workspace.yaml"
$ws = Get-Content $wsFile -Raw
$ws = $ws -replace "allowBuilds:\r?\n\s*esbuild: false\r?\n\s*sharp: false", "allowBuilds:`n  esbuild: true`n  sharp: true"
$ws = $ws -replace "esbuild: false", "esbuild: true"
$ws = $ws -replace "sharp: false", "sharp: true"
Set-Content $wsFile $ws -NoNewline
pnpm install --ignore-scripts 2>&1 | Where-Object { $_ -notmatch "WARN|Scope:" } | Write-Host
Write-Host "  OK" -ForegroundColor Green

# ── 5. رفع قاعدة البيانات ────────────────────────────────
Write-Host "[5/6] Setting up database..." -ForegroundColor Yellow
$dbUrl = $env:DATABASE_URL
$dbPort = "5432"
if ($dbUrl -match ":(\d{4,5})/") { $dbPort = $matches[1] }
psql -U postgres -p $dbPort -c "CREATE DATABASE sonbola;" 2>$null
pnpm add -D "@esbuild/win32-x64" --filter "@workspace/db" 2>&1 | Out-Null
Set-Location "$ROOT\lib\db"
$env:DATABASE_URL | Out-Null
npx drizzle-kit push --config ./drizzle.config.ts 2>&1 | Out-Null
Set-Location $ROOT
Write-Host "  OK" -ForegroundColor Green

# ── 6. Build API Server ───────────────────────────────────
Write-Host "[6/6] Building API server..." -ForegroundColor Yellow
Set-Location "$ROOT\artifacts\api-server"
pnpm add -D "@rollup/rollup-win32-x64-msvc" "lightningcss-win32-x64-msvc" 2>&1 | Out-Null
node ./build.mjs 2>&1 | Out-Null
Set-Location $ROOT
Write-Host "  OK" -ForegroundColor Green

# ── تشغيل السيرفرين ──────────────────────────────────────
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Starting Sonbola..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  API  -> http://localhost:3000" -ForegroundColor Green
Write-Host "  Web  -> http://localhost:5173" -ForegroundColor Green
Write-Host "  Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

# تشغيل API في الخلفية
$apiVars = @{
    DATABASE_URL    = $env:DATABASE_URL
    OPENAI_API_KEY  = $env:OPENAI_API_KEY
    PORT            = $env:PORT
    NODE_ENV        = $env:NODE_ENV
    LOCAL_DOMAIN    = $env:LOCAL_DOMAIN
    VAPID_PUBLIC_KEY  = $env:VAPID_PUBLIC_KEY
    VAPID_PRIVATE_KEY = $env:VAPID_PRIVATE_KEY
    VAPID_SUBJECT     = $env:VAPID_SUBJECT
    LOCAL_UPLOADS_DIR = $env:LOCAL_UPLOADS_DIR
}
$apiJob = Start-Job -ScriptBlock {
    param($root, $vars)
    foreach ($k in $vars.Keys) {
        [System.Environment]::SetEnvironmentVariable($k, $vars[$k], "Process")
    }
    Set-Location "$root\artifacts\api-server"
    node --enable-source-maps ./dist/index.mjs
} -ArgumentList $ROOT, $apiVars

Start-Sleep -Seconds 3
Start-Process "http://localhost:5173"

# تشغيل Dashboard
Set-Location $ROOT
pnpm --filter "@workspace/dashboard" run dev
