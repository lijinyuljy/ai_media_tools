#!/bin/bash
set -e # 遇到任何错误立即停止执行

# 1. 自动寻找 Docker 路径
if ! command -v docker &> /dev/null; then
    # 针对 macOS Docker Desktop 的常见路径进行兜底
    DOCKER_BIN="/Applications/Docker.app/Contents/Resources/bin/docker"
    if [ -f "$DOCKER_BIN" ]; then
        export PATH="$PATH:/Applications/Docker.app/Contents/Resources/bin"
        echo "🔍 自动定位到 Docker: $DOCKER_BIN"
    else
        echo "❌ 找不到 docker 命令，请确保 Docker Desktop 已安装并正在运行。"
        exit 1
    fi
fi

# 2. 加载配置
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "❌ 找不到 .env 文件，请确保在项目根目录下运行此脚本。"
    exit 1
fi

# 检查必要参数
if [ -z "$ACR_REGISTRY" ] || [ -z "$ACR_NAMESPACE" ] || [ -z "$ACR_REPO_NAME" ]; then
    echo "❌ 缺少 ACR 配置信息，请检查 .env 中的 ACR_ 相关项。"
    exit 1
fi

FULL_IMAGE_NAME="$ACR_REGISTRY/$ACR_NAMESPACE/$ACR_REPO_NAME:latest"

echo "🚀 准备部署: $FULL_IMAGE_NAME"

# 2. 登陆 ACR
# 注意：ACR 个人版登录通常使用独立的登录用户名和凭证密码
if [ -z "$ACR_LOGIN_USERNAME" ]; then
    echo "⚠️ 未在 .env 中发现 ACR_LOGIN_USERNAME，尝试使用主账号 AK 登录..."
    LOGIN_USER=$ALIBABA_CLOUD_ACCESS_KEY_ID
else
    LOGIN_USER=$ACR_LOGIN_USERNAME
fi

echo "🔑 正在尝试登录阿里云 ACR (账号: $LOGIN_USER)..."
docker login --username=$LOGIN_USER $ACR_REGISTRY

# 3. 构建镜像
echo "🛠️ 正在构建 Docker 镜像 (平台: linux/amd64)..."
# 显式指定平台，防止 Mac M1/M2 芯片构建出错误的架构
docker build --platform linux/amd64 -t wst-ai-watermark:latest ./ai/watermark

# 4. 打标并推送
echo "🏷️ 正在为镜像打标..."
docker tag wst-ai-watermark:latest $FULL_IMAGE_NAME

echo "📤 正在推送镜像到阿里云..."
docker push $FULL_IMAGE_NAME

echo "✅ 镜像推送完成！"
echo "👉 现在你可以前往阿里云 FC 3.0 控制台，选择此镜像创建函数了。"
echo "镜像地址: $FULL_IMAGE_NAME"
