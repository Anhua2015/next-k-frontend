#!/usr/bin/env bash
# start.sh — 本地伺服 Next K Frontend（Python http.server）
# 用法：./start.sh
# 环境变量覆盖：PORT=8080 ./start.sh
set -euo pipefail

# ── 路径常量 ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$SCRIPT_DIR/.pid"
LOG_DIR="$SCRIPT_DIR/logs"
PID_FILE="$PID_DIR/server.pid"
LOG_FILE="$LOG_DIR/server.log"

# ── 颜色 ──────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[next-k-frontend]${NC} $*"; }
warn()  { echo -e "${YELLOW}[next-k-frontend]${NC} $*"; }
error() { echo -e "${RED}[next-k-frontend]${NC} $*" >&2; }

# ── 辅助：检查进程是否存活 ───────────────────────────────────────────────────
is_running() {
    [[ -f "$PID_FILE" ]] || return 1
    kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

# ── 0. 防止重复启动 ───────────────────────────────────────────────────────────
if is_running; then
    warn "服务已在运行（PID=$(cat "$PID_FILE")），跳过启动。"
    warn "如需重启，请先运行：./stop.sh"
    exit 0
fi

# ── 1. 检测 Python ────────────────────────────────────────────────────────────
PYTHON_BIN=""
for py in python3 python; do
    if command -v "$py" &>/dev/null; then
        ver=$("$py" -c "import sys; print(sys.version_info.major)" 2>/dev/null || echo "0")
        if [[ "$ver" -ge 3 ]]; then
            PYTHON_BIN="$py"
            break
        fi
    fi
done

if [[ -z "$PYTHON_BIN" ]]; then
    error "未找到 Python 3。请先安装 Python 3。"
    exit 1
fi
info "使用 Python: $PYTHON_BIN ($(${PYTHON_BIN} --version 2>&1))"

# ── 2. 确认入口文件存在 ───────────────────────────────────────────────────────
if [[ ! -f "$SCRIPT_DIR/index.html" ]]; then
    error "未找到 index.html（$SCRIPT_DIR/index.html），请在 next-k-frontend 目录下运行此脚本。"
    exit 1
fi

# ── 3. 端口 ───────────────────────────────────────────────────────────────────
PORT="${PORT:-3000}"

# 检查端口是否已被占用
if command -v lsof &>/dev/null; then
    if lsof -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
        error "端口 $PORT 已被占用。请用 PORT=其他端口 ./start.sh 指定其他端口。"
        exit 1
    fi
fi

# ── 4. 创建目录 ───────────────────────────────────────────────────────────────
mkdir -p "$PID_DIR" "$LOG_DIR"

# ── 5. 启动静态文件服务 ───────────────────────────────────────────────────────
info "启动静态文件服务（端口 $PORT）..."
nohup "$PYTHON_BIN" -m http.server "$PORT" \
    --directory "$SCRIPT_DIR" \
    >> "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"
info "服务进程已启动（PID=$SERVER_PID），日志：$LOG_FILE"

# ── 6. 等待服务就绪 ───────────────────────────────────────────────────────────
info "等待服务就绪..."
WAIT_MAX=15
WAIT_COUNT=0
while [[ $WAIT_COUNT -lt $WAIT_MAX ]]; do
    if curl -sf "http://localhost:${PORT}/" >/dev/null 2>&1; then
        break
    fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        error "服务进程意外退出。请检查日志：$LOG_FILE"
        rm -f "$PID_FILE"
        exit 1
    fi
    sleep 1
    WAIT_COUNT=$((WAIT_COUNT + 1))
done

if [[ $WAIT_COUNT -ge $WAIT_MAX ]]; then
    warn "服务未在 ${WAIT_MAX}s 内响应，可能仍在启动中。请检查：$LOG_FILE"
fi

# ── 7. 启动摘要 ───────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Next K Frontend 启动成功${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "  访问地址     : http://localhost:${PORT}"
echo -e "  服务日志     : $LOG_FILE"
echo -e "  停止服务     : ./stop.sh"
echo ""
echo -e "  API 地址说明："
echo -e "    本机运行时自动指向 http://127.0.0.1:8000"
echo -e "    切换 API：浏览器 Console 执行："
echo -e "    localStorage.setItem('NEXT_K_API_BASE', 'http://your-api:8000')"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
