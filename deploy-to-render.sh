#!/bin/bash
# ============================================================
#  To be done · Render 部署脚本
#  在你的 Mac 终端里运行：bash ~/Desktop/frost-render/deploy-to-render.sh
# ============================================================

set -e
cd "$(dirname "$0")"

echo ""
echo "============================================"
echo "  To be done · Render 部署脚本"
echo "============================================"
echo ""

# ---- 1. 检查 git ----
if ! command -v git &>/dev/null; then
  echo "❌ 没安装 git，请先运行：xcode-select --install"
  exit 1
fi

# ---- 2. 检查 GitHub CLI ----
echo "[1/5] 检查 GitHub CLI..."
if ! command -v gh &>/dev/null; then
  echo "  ⚠️  没安装 GitHub CLI"
  echo "  请先安装：brew install gh"
  echo "  然后认证：gh auth login"
  echo ""
  echo "  如果你没有 GitHub 账号，先去 https://github.com/signup 注册（免费）"
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "  ⚠️  GitHub CLI 未登录"
  echo "  请运行：gh auth login"
  echo "  选 GitHub.com → HTTPS → 浏览器登录"
  exit 1
fi
echo "  ✅ GitHub 已登录"

# ---- 3. 初始化 git + 提交 ----
echo ""
echo "[2/5] 初始化代码仓库..."
if [ ! -d .git ]; then
  git init -q
fi
git add -A
git commit -q -m "To be done 验证码后台 - Render 版" 2>/dev/null || true
echo "  ✅ 代码已提交"

# ---- 4. 创建 GitHub 仓库 ----
echo ""
echo "[3/5] 创建 GitHub 仓库..."
REPO_NAME="frost-verify"
if gh repo view "$REPO_NAME" &>/dev/null; then
  echo "  仓库 $REPO_NAME 已存在，跳过创建"
else
  echo "  正在创建公开仓库 $REPO_NAME ..."
  gh repo create "$REPO_NAME" --public --source=. --remote=origin --push 2>/dev/null || {
    echo "  正在推送代码到已有仓库..."
    git remote add origin "https://github.com/$(gh api user -q .login)/$REPO_NAME.git" 2>/dev/null || true
  }
fi
git push -u origin main 2>/dev/null || git push -u origin master 2>/dev/null || true
echo "  ✅ 代码已推送到 GitHub"

# ---- 5. 拉取 Blob Token ----
echo ""
echo "[4/5] 拉取 Vercel Blob Token（存储验证码用）..."
TOKEN=$(/usr/local/bin/vercel env pull /tmp/.env-render --yes 2>/dev/null && grep "BLOB_READ_WRITE_TOKEN" /tmp/.env-render | sed 's/.*="\(.*\)"/\1/')
rm -f /tmp/.env-render
if [ -z "$TOKEN" ]; then
  echo "  ⚠️  自动拉取失败，请手动获取："
  echo "  在终端运行：cd ~/Desktop/frost-vercel && vercel env pull .env --yes"
  echo "  然后打开 .env 文件，复制 BLOB_READ_WRITE_TOKEN 的值"
else
  echo ""
  echo "  ╔══════════════════════════════════════════════════════════╗"
  echo "  ║  请复制以下 Token，稍后在 Render 填入环境变量：          ║"
  echo "  ╚══════════════════════════════════════════════════════════╝"
  echo ""
  echo "  $TOKEN"
  echo ""
fi

# ---- 6. 下一步指引 ----
echo ""
echo "[5/5] 接下来在 Render 网页完成部署："
echo ""
echo "  1. 打开 https://dashboard.render.com/register"
echo "     用 GitHub 账号一键登录（推荐）"
echo ""
echo "  2. 点 New + → Web Service → 连选 frost-verify 仓库"
echo ""
echo "  3. 填配置（render.yaml 会自动填充大部分）："
echo "     Name:        to-be-done-verify"
echo "     Runtime:     Node"
echo "     Build:       npm install"
echo "     Start:       node server.js"
echo "     Plan:        Free"
echo ""
echo "  4. 在 Environment Variables 里加："
echo "     BLOB_READ_WRITE_TOKEN = <上面复制的 Token>"
echo ""
echo "  5. 点 Create Web Service → 等 1~2 分钟构建完成"
echo ""
echo "  6. 构建完成后拿到地址：https://to-be-done-verify.onrender.com"
echo ""
echo "  7. （可选但推荐）防休眠："
echo "     去 https://uptimerobot.com 注册免费账号"
echo "     Add Monitor → HTTP(s) → 填 https://你的地址/api/health"
echo "     间隔 10 分钟 → 这样 Render 不会休眠"
echo ""
echo "============================================"
echo "  部署完成后，把你的 onrender.com 地址发我"
echo "  我帮你把 App 源码里的服务器地址改过来"
echo "============================================"
