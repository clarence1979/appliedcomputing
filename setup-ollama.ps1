# Digital Vector - one-step Ollama setup for the offline study assistant
# Right-click this file > Run with PowerShell (or paste into a PowerShell window).

Write-Host 'Installing Ollama...' -ForegroundColor Cyan
winget install --id Ollama.Ollama -e --accept-source-agreements

# Refresh PATH so 'ollama' works in this same session
$env:Path=[Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User')

# Allow the browser page to talk to the local server
[Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS','*','User')
$env:OLLAMA_ORIGINS='*'

Write-Host 'Downloading the language model (first time only)...' -ForegroundColor Cyan
ollama pull llama3.2

# Restart the server so the new origin setting takes effect
Get-Process '*ollama*' -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host 'Starting Ollama - keep this window open, then click Re-check in the browser.' -ForegroundColor Green
ollama serve
