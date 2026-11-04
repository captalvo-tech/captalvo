# ==============================================================================
# CAPTALVO — Real-Time Remote Log Viewer & Debugger
# Target: https://captalvo.online / Hostinger Cloud Startup
# ==============================================================================

param(
    [string]$HostUser = "u415074840",
    [string]$HostIp = "186.244.144.164",
    [int]$HostPort = 65002,
    [int]$Lines = 30,
    [switch]$Follow
)

$ErrorActionPreference = "Stop"

Write-Host "==> [Captalvo Telemetry] Conectando ao servidor para obter logs recentes..." -ForegroundColor Cyan

$remoteLogPath = "/home/$HostUser/domains/captalvo.online/app/storage/logs"

if ($Follow) {
    Write-Host "    Acompanhando logs em tempo real (Pressione Ctrl+C para sair)..." -ForegroundColor Yellow
    ssh -p $HostPort "${HostUser}@${HostIp}" "tail -f -n $Lines $remoteLogPath/captalvo_telemetry_*.jsonl 2>/dev/null"
} else {
    $cmd = "if [ -d '$remoteLogPath' ]; then tail -n $Lines $remoteLogPath/captalvo_telemetry_*.jsonl 2>/dev/null || echo 'Nenhum log gravado ainda.'; else echo 'Diretório de logs não criado ainda.'; fi"
    $res = ssh -p $HostPort "${HostUser}@${HostIp}" "$cmd"
    Write-Host $res
}

