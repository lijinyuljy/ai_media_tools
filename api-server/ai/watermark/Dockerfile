# 使用 NVIDIA CUDA 11.8 运行环境作为基础
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

# 设置环境变量
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# 安装系统级依赖
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    git \
    && rm -rf /var/lib/apt/lists/*

# 设置 python 为默认命令
RUN ln -s /usr/bin/python3 /usr/bin/python

# 设置工作目录
WORKDIR /app

# 升级 pip
RUN pip3 install --no-cache-dir --upgrade pip

# 安装深度学习框架 (使用稳定版 2.6.2，兼容 CUDA 11.8)
RUN pip3 install --no-cache-dir paddlepaddle-gpu==2.6.2 -i https://pypi.tuna.tsinghua.edu.cn/simple
RUN pip3 install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu118

# 安装 Web 服务基础库及 OSS SDK
RUN pip3 install --no-cache-dir flask requests gunicorn oss2

# 复制 VSR 项目代码及依赖
COPY vsr_core/requirements.txt ./vsr_requirements.txt
RUN pip3 install --no-cache-dir -r vsr_requirements.txt

# 将代码克隆到容器
COPY vsr_core /app/vsr_core
COPY app.py .

# 暴露端口
EXPOSE 9000

# 启动命令
CMD ["python3", "app.py"]
