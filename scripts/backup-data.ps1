# 备份本地 data/（会话、角色库、API 配置、上传资源）到项目外的目录
param(
    [string]$Dest = ""
)

$Root = Split-Path $PSScriptRoot -Parent

$Src = Join-Path $Root "data"
if (-not (Test-Path $Src)) {
    Write-Error "未找到 data 目录: $Src"
    exit 1
}

if (-not $Dest) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $Dest = Join-Path $Root "data-backup-$stamp"
}

Copy-Item -Recurse -Force $Src $Dest
Write-Host "已备份到: $Dest"
