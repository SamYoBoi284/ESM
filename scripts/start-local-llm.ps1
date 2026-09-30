$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$model = Join-Path $root "models\qwen2.5-0.5b-instruct-q4_k_m.gguf"

$candidates = @(
    (Join-Path $root "tools\llama.cpp\llama-server.exe"),
    (Join-Path $root "tools\llama.cpp\build\bin\llama-server.exe"),
    (Join-Path $root "llama-server.exe")
)

$server = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $server) {
    Write-Host "llama-server.exe was not found." -ForegroundColor Red
    Write-Host "Put the Windows llama.cpp server binary in tools\llama.cpp\ or the ESM root." -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $model)) {
    Write-Host "Qwen model was not found:" -ForegroundColor Red
    Write-Host $model -ForegroundColor Yellow
    exit 1
}

Write-Host "Starting ESM Local LLM..." -ForegroundColor Cyan
Write-Host "Model: $model"
Write-Host "Server: $server"
Write-Host "Endpoint: http://127.0.0.1:8080/v1"

& $server `
    -m $model `
    --host 127.0.0.1 `
    --port 8080 `
    --cors-origins '*' `
    --alias "qwen2.5-0.5b-instruct" `
    -c 4096
