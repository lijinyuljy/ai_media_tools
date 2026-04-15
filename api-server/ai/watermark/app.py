import os
import json
import requests
import time
from flask import Flask, request, jsonify

app = Flask(__name__)

# 模拟去水印处理逻辑
def process_watermark(input_path, output_path, mode='clean'):
    print(f"[Model] Starting watermark removal: {input_path}")
    # 在这里集成具体的模型代码 (如 Lama, ProPainter 等)
    # 此处仅做模拟：复制文件或生成一张处理过的图
    time.sleep(5) # 模拟计算耗时
    with open(input_path, 'rb') as f_in:
        with open(output_path, 'wb') as f_out:
            f_out.write(f_in.read())
    print(f"[Model] Processed file saved to: {output_path}")
    return True

@app.route('/invoke', methods=['POST'])
def invoke():
    """
    阿里云 FC 3.0 调用入口
    """
    try:
        # 获取调用负载
        payload = request.get_json()
        task_id = payload.get('taskId')
        input_url = payload.get('inputUrl')
        callback_url = payload.get('callbackUrl')
        
        print(f"[FC] Received task: {task_id}")

        # 1. 下载原始文件
        local_input = f"/tmp/{task_id}_in.tmp"
        response = requests.get(input_url)
        with open(local_input, 'wb') as f:
            f.write(response.content)

        # 2. 执行模型处理
        local_output = f"/tmp/{task_id}_out.tmp"
        success = process_watermark(local_input, local_output)
        
        if success:
            # 3. 将结果上传回 OSS (通常建议在云函数里集成 OSS SDK)
            # 为了 MVP 阶段代码简洁，我们假设回调时告诉 API Server 结果已存入指定位置
            # 或者通过 Webhook 把结果二进制流发回去（小文件方案）
            
            # 这里演示通过 Webhook 回传状态
            if callback_url:
                result_payload = {
                    "taskId": task_id,
                    "status": "completed",
                    "resultUrl": "https://aliyun-oss-public.com/results/done.jpg", # 实际应为上传后的 OSS URL
                    "progress": 100
                }
                requests.post(callback_url, json=result_payload)
            
            return jsonify({"status": "ok", "taskId": task_id}), 200
        else:
            raise Exception("Model processing failed")

    except Exception as e:
        print(f"[FC] Error: {str(e)}")
        if callback_url:
            requests.post(callback_url, json={"taskId": task_id, "status": "failed", "error": str(e)})
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=9000)
