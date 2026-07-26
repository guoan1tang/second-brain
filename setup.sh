#!/usr/bin/env bash
# 第二大脑 · 一键安装:装 MCP 依赖 + 注册到 Claude Code
set -e
cd "$(dirname "$0")"
ROOT="$(pwd)"
VAULT="$ROOT/vault"
SERVER="$ROOT/mcp/server.js"

echo "📦 安装 MCP 依赖..."
( cd mcp && npm install --no-audit --no-fund )

echo ""
echo "🔌 注册到 Claude Code..."
if command -v claude >/dev/null 2>&1; then
  claude mcp remove second-brain -s user >/dev/null 2>&1 || true
  claude mcp add second-brain -s user -e VAULT_PATH="$VAULT" -- "$(which node)" "$SERVER"
  echo "✅ 已注册。"
else
  echo "⚠️  未检测到 claude 命令,请手动执行:"
  echo "   claude mcp add second-brain -s user -e VAULT_PATH=\"$VAULT\" -- \$(which node) \"$SERVER\""
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 完成!接下来:"
echo "   1. 用 Obsidian 打开文件夹:$VAULT"
echo "      (设置里启用「模板」插件,模板文件夹设为 _templates)"
echo "   2. 编辑 vault/10-Semantic · 语义记忆/Profile · 自我画像/关于我.md 填上你的信息"
echo "   3. 新开一个 Claude Code 会话,说:「看看我的第二大脑」"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
