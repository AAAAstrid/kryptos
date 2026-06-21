#!/usr/bin/env bash
# 备份本地 data/ 到项目目录旁的 data-backup-时间戳
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/data"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="${1:-$ROOT/data-backup-$STAMP}"

if [[ ! -d "$SRC" ]]; then
  echo "未找到 data 目录: $SRC" >&2
  exit 1
fi

cp -a "$SRC" "$DEST"
echo "已备份到: $DEST"
