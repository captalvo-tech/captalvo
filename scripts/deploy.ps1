# ==============================================================================
# CAPTALVO — Safe Deployment Script
# Target: https://captalvo.online
# Hostinger Cloud Startup (SSH port 65002)
# ==============================================================================

param(
    [string]$HostUser = "u415074840",
    [string]$HostIp = "186.244.144.164",
    [int]$HostPort = 65002,
    [string]$RemoteDomainPath = "/home/u415074840/domains/captalvo.online",
    [string]$RemoteBackupBase = "/home/u415074840/domains/_backups_todos_sites/captalvo.online"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$PublicDir = Join-Path $ProjectRoot "public"
$AppDir = Join-Path $ProjectRoot "app"

Write-Host "==> [Captalvo Deploy] Iniciando deploy seguro para https://captalvo.online..." -ForegroundColor Cyan

# 1. SSH Connectivity Check
Write-Host "==> [1/6] Testando conexão SSH com ${HostUser}@${HostIp}:${HostPort}..."
$testSsh = ssh -p $HostPort -o BatchMode=yes -o ConnectTimeout=5 "${HostUser}@${HostIp}" "echo SSH_OK"
if ($testSsh -ne "SSH_OK") {
    Write-Error "Falha na conexão SSH com o servidor Hostinger."
}
Write-Host "    Conexão SSH confirmada com sucesso." -ForegroundColor Green

# 2. Remote Safe Backup (outside public_html)
$Timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd_HHmmss")
Write-Host "==> [2/6] Criando backup remoto com timestamp $Timestamp em $RemoteBackupBase..."
$backupCmd = "mkdir -p '$RemoteBackupBase/$Timestamp' && if [ -d '$RemoteDomainPath/public_html' ]; then cp -r '$RemoteDomainPath/public_html/'* '$RemoteBackupBase/$Timestamp/' 2>/dev/null || true; fi; echo BACKUP_OK"
$backupRes = ssh -p $HostPort "${HostUser}@${HostIp}" "$backupCmd"
Write-Host "    Resultado do backup: $backupRes" -ForegroundColor Green

# 3. Create Remote Staging Directory (isolated & non-public)
Write-Host "==> [3/6] Preparando área temporária não pública em ~/staging_captalvo..."
$stageCmd = "rm -rf /home/$HostUser/staging_captalvo && mkdir -p /home/$HostUser/staging_captalvo/public /home/$HostUser/staging_captalvo/app && mkdir -p '$RemoteDomainPath/app' '$RemoteDomainPath/public_html'"
ssh -p $HostPort "${HostUser}@${HostIp}" "$stageCmd"

# 4. Inject Dynamic Build Timestamp for Anti-Cache & Pack Archives
$BuildTimestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
Write-Host "==> [4/6] Injetando timestamp anti-cache ($BuildTimestamp) em todos os assets e compactando arquivos..."

node "$ScriptDir/update_html_timestamps.js"

$tempTarApp = Join-Path $ProjectRoot "captalvo_app.tar.gz"
$tempTarPublic = Join-Path $ProjectRoot "captalvo_public.tar.gz"

tar.exe --exclude="*.log" -czf "$tempTarApp" -C "$AppDir" .
tar.exe --exclude="*.bak" --exclude="*.tmp" -czf "$tempTarPublic" -C "$PublicDir" .

scp -P $HostPort "$tempTarApp" "${HostUser}@${HostIp}:/home/$HostUser/staging_captalvo/captalvo_app.tar.gz"
scp -P $HostPort "$tempTarPublic" "${HostUser}@${HostIp}:/home/$HostUser/staging_captalvo/captalvo_public.tar.gz"

Remove-Item "$tempTarApp" -Force -ErrorAction SilentlyContinue
Remove-Item "$tempTarPublic" -Force -ErrorAction SilentlyContinue

# 5. Extract to production with correct permissions
Write-Host "==> [5/6] Aplicando arquivos em produção com permissões seguras..."
$applyCmd = @"
tar -xzf /home/$HostUser/staging_captalvo/captalvo_app.tar.gz -C '$RemoteDomainPath/app/'
tar -xzf /home/$HostUser/staging_captalvo/captalvo_public.tar.gz -C '$RemoteDomainPath/public_html/'
rm -rf /home/$HostUser/staging_captalvo
mkdir -p '$RemoteDomainPath/app/storage/logs/sessions'
chmod 775 '$RemoteDomainPath/app/storage'
chmod -R 775 '$RemoteDomainPath/app/storage/logs'
chmod 755 '$RemoteDomainPath/public_html'
find '$RemoteDomainPath/public_html' -type f -exec chmod 644 {} +
find '$RemoteDomainPath/public_html' -type d -exec chmod 755 {} +
rm -f '$RemoteDomainPath/public_html/default*.php'
echo DEPLOY_APPLIED
"@
$applyRes = ssh -p $HostPort "${HostUser}@${HostIp}" "$applyCmd"
Write-Host "    $applyRes" -ForegroundColor Green

# 6. Verify Deployment Live
Write-Host "==> [6/6] Validando produção live (HTTPS, Anti-Cache & Health Endpoint)..."
$healthCheck = curl.exe -s https://captalvo.online/api/health
Write-Host "    Resposta /api/health: $healthCheck" -ForegroundColor Cyan

$telemetryCheck = curl.exe -s "https://captalvo.online/api/telemetry?action=stats"
Write-Host "    Resposta /api/telemetry?action=stats: $telemetryCheck" -ForegroundColor Cyan

$httpStatus = (curl.exe -s -o /dev/null -w "%{http_code}" https://captalvo.online)
Write-Host "    Status HTTP captalvo.online: $httpStatus" -ForegroundColor Green

$headers = curl.exe -ILs https://captalvo.online
$cacheHeader = ($headers | Select-String -Pattern "cache-control" -CaseSensitive:$false)
Write-Host "    Header Cache-Control: $cacheHeader" -ForegroundColor Yellow

Write-Host "==> [Deploy Concluído] Captalvo Alpha está no ar em https://captalvo.online!" -ForegroundColor Green
