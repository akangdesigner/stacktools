#!/usr/bin/env bash
# 一鍵重啟 dev server：殺掉 port 3001 上的舊程序，再重新 npm run dev
# 用途：改到 lib/ 或 API route 後，Next dev 有時不重編、跑舊碼，重啟最保險
set -e

PORT=3001
DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "→ 關閉 port $PORT 上的舊 dev server…"
lsof -ti "tcp:$PORT" | xargs kill -9 2>/dev/null || true
sleep 1

echo "→ 重新啟動 dev（$DIR）…"
cd "$DIR"
exec npm run dev
