$Root = $PSScriptRoot

Write-Host "Starting OneRepute..." -ForegroundColor Cyan

# Start backend
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$Root\backend'; npm run dev"
)

# Start frontend
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$Root\frontend'; npm run dev"
)

Write-Host ""
Write-Host "Backend and frontend are starting..." -ForegroundColor Green
Write-Host ""
Write-Host "Backend:  npm run dev" -ForegroundColor Yellow
Write-Host "Frontend: npm run dev" -ForegroundColor Yellow