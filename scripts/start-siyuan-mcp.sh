#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 优先使用外部已注入的环境变量；未设置时从仓库根目录 .env 读取
if [ -f "$REPO_ROOT/.env" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|\#*) continue ;;
    esac
    key="${line%%=*}"
    val="${line#*=}"
    # 去除可选的首尾空白和引号
    key="$(printf '%s' "$key" | xargs)"
    val="${val%\"}"
    val="${val#\"}"
    val="${val%\'}"
    val="${val#\'}"
    if [ -n "$key" ] && [ -z "${!key:-}" ]; then
      export "$key=$val"
    fi
  done < "$REPO_ROOT/.env"
fi

: "${SIYUAN_API_URL:=http://localhost:6806}"
export SIYUAN_API_URL

# 兼容 macOS 桌面端 GUI 未加载终端 PATH（Homebrew / NVM）的场景
if ! command -v node >/dev/null 2>&1; then
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
  if [ -d "$HOME/.nvm/versions/node" ]; then
    LATEST_NVM_NODE="$(ls -1d "$HOME/.nvm/versions/node/"* 2>/dev/null | sort -V | tail -n 1 || true)"
    if [ -n "$LATEST_NVM_NODE" ]; then
      export PATH="$LATEST_NVM_NODE/bin:$PATH"
    fi
  fi
fi

exec node "$REPO_ROOT/node_modules/@fromsko/siyuan-mcp-server/dist/server.js"
