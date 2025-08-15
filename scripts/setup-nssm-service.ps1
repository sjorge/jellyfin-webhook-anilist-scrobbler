# Jellyfin AniList Webhook Service Setup Script
# This script sets up a Windows service for the Jellyfin AniList webhook
# 
# Features:
# - Automatically compiles the latest code (unless -SkipCompile is used)
# - Installs/updates the Windows service using NSSM
# - Configures logging and firewall rules
# - Handles configuration file setup
#
# Usage:
#   .\setup-nssm-service.ps1                    # Full setup with compilation
#   .\setup-nssm-service.ps1 -SkipCompile       # Setup using pre-compiled binary
#   .\setup-nssm-service.ps1 -Configure         # Setup with configuration prompts
#
# Requires: Administrator privileges, Bun (for compilation), NSSM
param(
  [string]$ServiceName = "AniListWebhook",
  [string]$App = "D:\\Documents\\Git\\jellyfin-webhook-anilistwatched\\bin\\jw-anilist-watched.exe",
  [string]$AppArgs = "webhook",
  [string]$AppDirectory = "D:\\Documents\\Git\\jellyfin-webhook-anilistwatched",
  [string]$LogDir = "C:\\ProgramData\\AniListWebhook",
  [string]$Account = "",
  [string]$ConfigPath = "$env:USERPROFILE\\.config\\anilistwatched\\config.toml",
  [switch]$Configure = $false,
  [switch]$AddFirewall = $true,
  [switch]$SkipCompile = $false
)

# Requires elevation
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Error "Please run this script in an elevated PowerShell (Run as Administrator)."
  exit 1
}

function Ensure-NssmInstalled {
  $nssm = Get-Command nssm -ErrorAction SilentlyContinue
  if ($null -ne $nssm) { return }
  $choco = Get-Command choco -ErrorAction SilentlyContinue
  if ($null -eq $choco) {
    throw "NSSM not found and Chocolatey is not installed. Install NSSM manually or install Chocolatey first."
  }
  choco install nssm -y --no-progress
  $nssm = Get-Command nssm -ErrorAction SilentlyContinue
  if ($null -eq $nssm) { throw "NSSM installation failed or not in PATH." }
}

function Compile-Project {
  param(
    [Parameter(Mandatory=$true)][string]$ProjectDirectory
  )
  
  Write-Host "Compiling project in: $ProjectDirectory"
  
  # Check if bun is available
  $bun = Get-Command bun -ErrorAction SilentlyContinue
  if ($null -eq $bun) {
    throw "Bun is not installed or not in PATH. Please install Bun first."
  }
  
  # Change to project directory and compile
  Push-Location $ProjectDirectory
  try {
    Write-Host "Running: bun run compile"
    $compileResult = & bun run compile 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "Compilation failed: $compileResult"
    }
    Write-Host "Compilation successful!" -ForegroundColor Green
  }
  finally {
    Pop-Location
  }
}

function New-OrUpdate-ConfigToml {
  param(
    [Parameter(Mandatory=$true)][string]$Path
  )

  Write-Host "Creating/updating config at: $Path"
  $cfgDir = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $cfgDir)) {
    New-Item -ItemType Directory -Path $cfgDir -Force | Out-Null
  }

  $anilistToken = Read-Host "Enter AniList token"
  $jellyfinApiKey = Read-Host "Enter Jellyfin API key"
  $jellyfinUrl = Read-Host "Enter Jellyfin base URL (e.g. http://192.168.1.27:8096)"
  $libraryName = Read-Host "Enter Jellyfin library name for anime (default: Animes)"
  if ([string]::IsNullOrWhiteSpace($libraryName)) { $libraryName = 'Animes' }

  $content = @"
[webhook]
bind = "0.0.0.0"
port = 4091

[anilist]
token = "$anilistToken"

[jellyfin]
apiKey = "$jellyfinApiKey"
url = "$jellyfinUrl"
libraryName = "$libraryName"
"@

  Set-Content -LiteralPath $Path -Value $content -Encoding UTF8
}

try {
  # Stop and remove existing service first to unlock the executable
  Write-Host "Stopping and removing existing service to unlock executable..." -ForegroundColor Yellow
  nssm stop $ServiceName *> $null
  nssm remove $ServiceName confirm *> $null
  
  # Wait a moment for the process to fully terminate
  Start-Sleep -Seconds 2
  
  # Compile the project if not skipped
  if (-not $SkipCompile) {
    Compile-Project -ProjectDirectory $AppDirectory
  } else {
    Write-Host "Skipping compilation as requested."
  }
  
  Ensure-NssmInstalled

  # Paths
  if (-not (Test-Path -LiteralPath $App)) { throw "App not found: $App" }
  if (-not (Test-Path -LiteralPath $AppDirectory)) { throw "AppDirectory not found: $AppDirectory" }
  New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

  # Ensure config exists or ask the user
  $needConfig = $Configure -or (-not (Test-Path -LiteralPath $ConfigPath))
  if ($needConfig) {
    New-OrUpdate-ConfigToml -Path $ConfigPath
  }

  # Install / configure service
  nssm install $ServiceName "$App" $AppArgs
  if ($LASTEXITCODE -ne 0) { throw "nssm install failed ($LASTEXITCODE)." }

  nssm set $ServiceName AppDirectory $AppDirectory
  nssm set $ServiceName Start SERVICE_AUTO_START
  nssm set $ServiceName AppStdout "$LogDir\service.log"
  nssm set $ServiceName AppStderr "$LogDir\service.err.log"

  # Configure Log on account (Option A)
  if ([string]::IsNullOrWhiteSpace($Account)) {
    $who = (whoami)
    Write-Host "Detected current user: $who"
    $Account = Read-Host "Enter service account (e.g. $env:COMPUTERNAME\YourUser or .\YourUser)"
  }
  $pwdSecure = Read-Host "Enter password for $Account" -AsSecureString
  $pwdPlain  = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pwdSecure))
  # Set username and password together (no ObjectPassword param)
  nssm set $ServiceName ObjectName $Account $pwdPlain

  # Set config env var if present (so service finds tokens)
  if (-not [string]::IsNullOrWhiteSpace($ConfigPath) -and (Test-Path -LiteralPath $ConfigPath)) {
    nssm set $ServiceName AppEnvironmentExtra "ANILISTWATCHED_CONFIG=$ConfigPath"
  } elseif (Test-Path -LiteralPath (Join-Path $LogDir 'config.toml')) {
    $cfg = (Join-Path $LogDir 'config.toml')
    nssm set $ServiceName AppEnvironmentExtra "ANILISTWATCHED_CONFIG=$cfg"
  } else {
    Write-Warning "Config file not found. Set AppEnvironmentExtra later: ANILISTWATCHED_CONFIG=FULL\\PATH\\TO\\config.toml"
  }

  # Firewall rule (optional)
  if ($AddFirewall) {
    netsh advfirewall firewall add rule name="AniListWebhook4091" dir=in action=allow protocol=TCP localport=4091 *> $null
  }

  # Start and show status
  nssm start $ServiceName
  sc query $ServiceName | Write-Output
  Write-Host "Logs: $LogDir\service.log and $LogDir\service.err.log"
  Write-Host "Tail logs: Get-Content -Tail 100 -Wait \"$LogDir\service.log\""
}
catch {
  Write-Error $_
  exit 1
}


