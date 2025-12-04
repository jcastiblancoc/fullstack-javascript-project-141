param(
  [string]$branch = 'main',
  [string]$remote = 'origin'
)

Write-Host "Preparing to push changes to $remote/$branch"

# Show git status
git status --porcelain

# Add specific files we modified
$files = @('code/.env.example','scripts/setup.js','Makefile','package.json','.gitignore')
$toAdd = @()
foreach ($f in $files) {
  if (Test-Path $f) { $toAdd += $f }
}

if ($toAdd.Count -eq 0) {
  Write-Host "No tracked files found to add. Use 'git status' to inspect the repo." -ForegroundColor Yellow
  exit 1
}

git add $toAdd

$commitMsg = Read-Host "Enter commit message (or press Enter for default)"
if ([string]::IsNullOrWhiteSpace($commitMsg)) { $commitMsg = 'ci: add setup script and env example; update Makefile' }

git commit -m $commitMsg

git push $remote $branch

Write-Host "Push complete." -ForegroundColor Green
