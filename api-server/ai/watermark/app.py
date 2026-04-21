import os
import sys
import json
import requests
import time
import shutil
from flask import Flask, request, jsonify

# 1. 强制进入 Headless 模式并 Mock GUI 依赖
# 因为 VSR 的 backend.config 引用了 PySide6 和 qfluentwidgets
# 在云函数环境（无屏幕）下，直接引用会导致报错。我们通过 Mock 绕过。
from unittest.mock import MagicMock
sys.modules['PySide6'] = MagicMock()
sys.modules['PySide6.QtCore'] = MagicMock()
sys.modules['PySide6.QtWidgets'] = MagicMock()
sys.modules['PySide6.QtGui'] = MagicMock()
sys.modules['qfluentwidgets'] = MagicMock()

# 2. 将 VSR 核心代码加入路径
VSR_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vsr_core')
sys.path.insert(0, VSR_PATH)

from backend.main import SubtitleRemover
from backend.config import config
from backend.tools.constant import InpaintMode

app = Flask(__name__)

def run_vsr_task(input_path, output_path):
    """
    真正调用 VSR 核心代码进行去字幕处理
    """
    print(f"[VSR] Initializing SubtitleRemover for: {input_path}")
    
    # 配置 VSR 参数 (对应控制台的设置)
    config.inpaintMode.value = InpaintMode.STTN_AUTO  # 默认使用智能擦除模式
    config.hardwareAcceleration.value = True         # 启用硬件加速
    
    # 实例化处理类
    # 注意：SubtitleRemover 的构造函数会自动探测视频时长、尺寸等
    sr = SubtitleRemover(input_path)
    sr.video_out_path = output_path
    
    # 设置全屏处理或指定选区（默认全屏，如果需要指定区域可在此修改 sr.sub_areas）
    # sr.sub_areas = [(0, sr.frame_height, 0, sr.frame_width)]
    
    print(f"[VSR] Starting processing...")
    sr.run()
    
    if os.path.exists(output_path):
        print(f"[VSR] Task completed successfully: {output_path}")
        return True
    return False

@app.route('/invoke', methods=['POST'])
def invoke():
    """
    阿里云 FC 3.0 调用入口
    """
    task_id = "unknown"
    callback_url = None
    try:
        # 获取调用负载
        payload = request.get_json()
        task_id = payload.get('taskId')
        input_url = payload.get('inputUrl')
        callback_url = payload.get('callbackUrl')
        
        print(f"[FC] Received VSR task: {task_id}")

        # 1. 创建工作目录
        work_dir = f"/tmp/{task_id}"
        os.makedirs(work_dir, exist_ok=True)
        local_input = os.path.join(work_dir, "input.mp4")
        local_output = os.path.join(work_dir, "output.mp4")

        # 2. 下载原始视频
        print(f"[FC] Downloading: {input_url}")
        response = requests.get(input_url, stream=True)
        with open(local_input, 'wb') as f:
            shutil.copyfileobj(response.raw, f)

        # 3. 执行真正的 AI 处理
        success = run_vsr_task(local_input, local_output)
        
        if success:
            # 4. 将结果上传回 OSS
            import oss2
            auth = oss2.Auth(os.getenv('ALIBABA_CLOUD_ACCESS_KEY_ID'), os.getenv('ALIBABA_CLOUD_ACCESS_KEY_SECRET'))
            bucket = oss2.Bucket(auth, os.getenv('OSS_REGION', 'oss-cn-hangzhou'), os.getenv('OSS_BUCKET'))
            
            oss_output_path = f"results/{task_id}_no_sub.mp4"
            print(f"[FC] Uploading result to OSS: {oss_output_path}")
            bucket.put_object_from_file(oss_output_path, local_output)
            
            # 生成结果 URL (如果是私有桶，通常建议在 API Server 端生成签名 URL，此处回传相对路径/名称)
            result_url = oss_output_path 

            if callback_url:
                result_payload = {
                    "taskId": task_id,
                    "status": "completed",
                    "resultUrl": result_url, 
                    "progress": 100
                }
                requests.post(callback_url, json=result_payload)
            
            # 清理临时文件
            shutil.rmtree(work_dir)
            
            return jsonify({"status": "ok", "taskId": task_id}), 200
        else:
            raise Exception("AI model processing returned False")

    except Exception as e:
        print(f"[FC] Error: {str(e)}")
        import traceback
        traceback.print_exc()
        if callback_url:
            requests.post(callback_url, json={"taskId": task_id, "status": "failed", "error": str(e)})
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    # 生产环境建议通过 gunicorn 启动
    app.run(host='0.0.0.0', port=9000)
