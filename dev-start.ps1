# Starts Postgres (Docker) + both dev servers for local development.
# Run from the repo root: .\dev-start.ps1

$dockerBin = "$env:ProgramFiles\Docker\Docker\resources\bin"
if ($env:Path -notlike "*$dockerBin*") { $env:Path += ";$dockerBin" }

Write-Host "Checking Docker..."
docker ps *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Starting Docker Desktop (this can take 30-60s)..."
    Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    $elapsed = 0
    while ($elapsed -lt 90) {
        Start-Sleep -Seconds 5
        $elapsed += 5
        docker ps *> $null
        if ($LASTEXITCODE -eq 0) { break }
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Docker did not become ready in time. Open Docker Desktop manually and re-run this script."
        exit 1
    }
}
Write-Host "Docker is ready."

Write-Host "Starting Postgres..."
docker compose up -d

Write-Host "Waiting for Postgres to accept connections..."
$elapsed = 0
while ($elapsed -lt 30) {
    docker compose exec postgres pg_isready -U aspire *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 2
    $elapsed += 2
}

Write-Host "Starting dev:server and dev:web in new windows..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev:server"
Start-Sleep -Seconds 3
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev:web"

Write-Host ""
Write-Host "Done. Once both windows show 'ready', open http://localhost:5173"
Write-Host "(First run only: also run 'cd apps\server; npx prisma migrate deploy; npx tsx prisma\seed.ts' to set up the database.)"
