param(
  [string]$ServiceName = "AniListWebhook",
  [string]$App = "D:\\Documents\\Git\\jellyfin-webhook-anilistwatched\\bin\\jw-anilist-watched.exe",
  [string]$AppArgs = "webhook",
  [string]$AppDirectory = "D:\\Documents\\Git\\jellyfin-webhook-anilistwatched",
  [string]$LogDir = "C:\\ProgramData\\AniListWebhook",
  [string]$Account = "",
  [string]$ConfigPath = "$env:USERPROFILE\\.config\\anilistwatched\\config.toml",
  [switch]$AddFirewall = $true
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

try {
  Ensure-NssmInstalled

  # Paths
  if (-not (Test-Path -LiteralPath $App)) { throw "App not found: $App" }
  if (-not (Test-Path -LiteralPath $AppDirectory)) { throw "AppDirectory not found: $AppDirectory" }
  New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

  # Install / configure service
  nssm stop  $ServiceName *> $null
  nssm remove $ServiceName confirm *> $null

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


