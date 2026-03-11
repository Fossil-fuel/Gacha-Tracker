# Push changes to GitHub
# Run this from PowerShell: .\push-to-github.ps1

Set-Location $PSScriptRoot

Write-Host "Adding all changes..." -ForegroundColor Cyan
git add .

Write-Host "Committing..." -ForegroundColor Cyan
git commit -m "Update About page notes, fix title nav, remove e.g. from descriptions"

Write-Host "Pushing to GitHub..." -ForegroundColor Cyan
git push origin main

Write-Host "Done!" -ForegroundColor Green
