# 关闭占用 Kryptos 默认端口的进程并重启服务
$Port = if ($env:KRYPTOS_PORT) { [int]$env:KRYPTOS_PORT } else { 8765 }
$Root = Split-Path $PSScriptRoot -Parent

Write-Host "检查端口 $Port ..."
$pids = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { $_.OwningProcess } |
    Where-Object { $_ -gt 0 } |
    Select-Object -Unique)

foreach ($procId in $pids) {
    Write-Host "结束进程 PID $procId"
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 1
Set-Location $Root
$env:KRYPTOS_RELOAD = "0"
Write-Host "启动 Kryptos (http://127.0.0.1:$Port) ..."
python -m kryptos.main
