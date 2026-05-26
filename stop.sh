#!/usr/bin/env bash
# stop.sh — 停止 Next K Frontend 静态文件服务
# 用法：./stop.sh
set -euo pipefail

# ── 路径常量 ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$SCRIPT_DIR/.pid"
PID_FILE="$PID_DIR/server.pid"

# 优雅关闭超时（秒）
GRACEFUL_TIMEOUT=10

# ── 颜色 ──────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[next-k-frontend]${NC} $*"; }
warn()  { echo -e "${YELLOW}[next-k-frontend]${NC} $*"; }
error() { echo -e "${RED}[next-k-frontend]${NC} $*" >&2; }

# ── 执行停止 ──────────────────────────────────────────────────────────────────
if [[ ! -f "$PID_FILE" ]]; then
    warn "未找到 PID 文件（$PID_FILE），服务可能未在运行。"
    exit 0
fi

PID=$(cat "$PID_FILE")

if ! kill -0 "$PID" 2>/dev/null; then
    warn "进程（PID=$PID）已不在运行，清理 PID 文件。"
    rm -f "$PID_FILE"
    exit 0
fi

info "停止服务（PID=$PID）：发送 SIGTERM..."
kill -TERM "$PID" 2>/dev/null || true

# 等待优雅退出
elapsed=0
while kill -0 "$PID" 2>/dev/null; do
    if [[ $elapsed -ge $GRACEFUL_TIMEOUT ]]; then
        warn "进程（PID=$PID）在 ${GRACEFUL_TIMEOUT}s 内未退出，强制 SIGKILL..."
        kill -KILL "$PID" 2>/dev/null || true
        break
    fi
    sleep 1
    elapsed=$((elapsed + 1))
done

if kill -0 "$PID" 2>/dev/null; then
    error "进程（PID=$PID）SIGKILL 后仍在运行，请手动处理：kill -9 $PID"
else
    info "服务（PID=$PID）已停止。"
fi

rm -f "$PID_FILE"

# 清理空 PID 目录
if [[ -d "$PID_DIR" ]] && [[ -z "$(ls -A "$PID_DIR" 2>/dev/null)" ]]; then
    rmdir "$PID_DIR" 2>/dev/null || true
fi

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Next K Frontend 已停止${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "  启动服务：./start.sh"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
