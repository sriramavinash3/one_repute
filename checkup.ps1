$ErrorActionPreference = "Continue"

Clear-Host

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "       ONEREPUTE PROJECT DIAGNOSTIC" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$Root = $PSScriptRoot

Write-Host "Project Root:" -ForegroundColor Yellow
Write-Host $Root
Write-Host ""

# -----------------------------
# 1. Node.js
# -----------------------------
Write-Host "[1] Checking Node.js..." -ForegroundColor Cyan

try {
    $nodeVersion = node --version
    Write-Host "[OK] Node.js: $nodeVersion" -ForegroundColor Green
}
catch {
    Write-Host "[FAIL] Node.js not found" -ForegroundColor Red
}

Write-Host ""

# -----------------------------
# 2. npm
# -----------------------------
Write-Host "[2] Checking npm..." -ForegroundColor Cyan

try {
    $npmVersion = npm --version
    Write-Host "[OK] npm: $npmVersion" -ForegroundColor Green
}
catch {
    Write-Host "[FAIL] npm not found" -ForegroundColor Red
}

Write-Host ""

# -----------------------------
# 3. Backend
# -----------------------------
Write-Host "[3] Checking BACKEND..." -ForegroundColor Cyan

$Backend = Join-Path $Root "backend"

if (Test-Path $Backend) {
    Write-Host "[OK] backend folder exists" -ForegroundColor Green
}
else {
    Write-Host "[FAIL] backend folder NOT found" -ForegroundColor Red
}

if (Test-Path "$Backend\package.json") {
    Write-Host "[OK] backend package.json exists" -ForegroundColor Green
}
else {
    Write-Host "[FAIL] backend package.json NOT found" -ForegroundColor Red
}

if (Test-Path "$Backend\node_modules") {
    Write-Host "[OK] backend node_modules exists" -ForegroundColor Green
}
else {
    Write-Host "[WARNING] backend node_modules missing" -ForegroundColor Yellow
}

Write-Host ""

# -----------------------------
# 4. Frontend
# -----------------------------
Write-Host "[4] Checking FRONTEND..." -ForegroundColor Cyan

$Frontend = Join-Path $Root "frontend"

if (Test-Path $Frontend) {
    Write-Host "[OK] frontend folder exists" -ForegroundColor Green
}
else {
    Write-Host "[FAIL] frontend folder NOT found" -ForegroundColor Red
}

if (Test-Path "$Frontend\package.json") {
    Write-Host "[OK] frontend package.json exists" -ForegroundColor Green
}
else {
    Write-Host "[FAIL] frontend package.json NOT found" -ForegroundColor Red
}

if (Test-Path "$Frontend\node_modules") {
    Write-Host "[OK] frontend node_modules exists" -ForegroundColor Green
}
else {
    Write-Host "[WARNING] frontend node_modules missing" -ForegroundColor Yellow
}

Write-Host ""

# -----------------------------
# 5. Backend npm scripts
# -----------------------------
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "        BACKEND NPM SCRIPTS" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

if (Test-Path "$Backend\package.json") {
    Push-Location $Backend
    npm run
    Pop-Location
}
else {
    Write-Host "[SKIPPED] backend package.json missing" -ForegroundColor Yellow
}

Write-Host ""

# -----------------------------
# 6. Frontend npm scripts
# -----------------------------
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "        FRONTEND NPM SCRIPTS" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

if (Test-Path "$Frontend\package.json") {
    Push-Location $Frontend
    npm run
    Pop-Location
}
else {
    Write-Host "[SKIPPED] frontend package.json missing" -ForegroundColor Yellow
}

Write-Host ""

# -----------------------------
# 7. Test backend build
# -----------------------------
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "        TESTING BACKEND BUILD" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

if (Test-Path "$Backend\package.json") {
    Push-Location $Backend

    npm run build

    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Backend build successful" -ForegroundColor Green
    }
    else {
        Write-Host "[FAIL] Backend build failed" -ForegroundColor Red
    }

    Pop-Location
}

Write-Host ""

# -----------------------------
# 8. Final
# -----------------------------
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "        DIAGNOSTIC COMPLETE" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Read-Host "Press ENTER to close"