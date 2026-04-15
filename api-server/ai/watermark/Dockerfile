# 使用基础 Python 镜像
FROM python:3.9-slim

# 设置工作目录
WORKDIR /app

# 安装必要的系统依赖
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# 安装运行库
RUN pip install --no-cache-dir flask requests gunicorn

# 拷贝代码
COPY app.py .

# 阿里云函数计算默认监听 9000 端口
EXPOSE 9000

# 启动服务
CMD ["python", "app.py"]
