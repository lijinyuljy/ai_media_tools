const oss = require('../lib/oss');
const fc = require('../lib/fc');
const path = require('path');
const db = require('../lib/db');

/**
 * TaskService - 核心任务调度中心
 * 负责解析任务路由，决定是调用外部 API 还是内置云函数。
 */
class TaskService {
  /**
   * 创建并调度去水印任务
   */
  async createWatermarkTask(params) {
    const { taskId, userId, file, type, engine, cost } = params;

    // 1. 本地记录任务初始状态
    try {
      const originalUrl = `/uploads/${file.filename}`;
      await db.query(
        'INSERT INTO tasks (task_id, user_id, file_name, original_url, type, engine, status, progress, cost, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [taskId, userId, file.originalname, originalUrl, type, engine, 'uploading', 5, cost, Date.now()]
      );
    } catch (err) {
      console.error('[TaskCenter] 初始任务记录失败:', err.message);
      throw err;
    }

    // 2. 异步执行流程 (不阻塞 HTTP 响应)
    this._runWatermarkWorkflow(taskId, file.path, type, engine);

    return { taskId, status: 'uploading' };
  }

  async _runWatermarkWorkflow(taskId, localPath, type, engine) {
    try {
      // A. 上传到 OSS (为了让云函数能访问到文件)
      const ossPath = `input/${taskId}${path.extname(localPath)}`;
      console.log(`[TaskCenter] 开始上传 OSS: ${ossPath}`);
      const uploadResult = await oss.upload(localPath, ossPath);
      
      await this.updateTask(taskId, { 
        status: 'queuing', 
        progress: 20
      });

      // B. 调用云函数 FC
      const functionName = 'watermark-remover'; // 预定义的 FC 函数名
      const payload = {
        taskId,
        inputUrl: oss.getSignatureUrl(ossPath, 3600), // 提供 1 小时有效的签名图
        type,
        engine,
        callbackUrl: `${process.env.API_CALLBACK_URL}?token=${process.env.WEBHOOK_SECRET}` // 带安全令牌的回调地址
      };

      console.log(`[TaskCenter] 触发 FC 函数: ${functionName}`);
      const dispatchSuccess = await fc.dispatchToFC(taskId, payload.inputUrl);
      
      if (dispatchSuccess) {
        await this.updateTask(taskId, { 
          status: 'processing', 
          progress: 30
        });
      } else {
        console.warn(`[TaskCenter] FC 调度失败，终止后续处理状态写入: ${taskId}`);
      }

    } catch (err) {
      console.error(`[TaskCenter] 任务 ${taskId} 调度失败:`, err.message);
      await this.updateTask(taskId, { 
        status: 'failed', 
        error: err.message 
      });
    }
  }

  // ===== 辅助函数 =====

  async getTask(taskId) {
    const { rows } = await db.query('SELECT * FROM tasks WHERE task_id = $1', [taskId]);
    return rows[0];
  }

  async updateTask(taskId, updates) {
    // 动态生成 UPDATE 语句
    const keys = Object.keys(updates);
    if (keys.length === 0) return;

    const setClause = keys.map((key, i) => {
        // 将驼峰转换为下划线 (简易转换)
        const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        return `${dbKey} = $${i + 2}`;
    }).join(', ');
    
    const values = keys.map(k => updates[k]);
    
    try {
      await db.query(`UPDATE tasks SET ${setClause} WHERE task_id = $1`, [taskId, ...values]);
    } catch (err) {
      console.error(`[TaskCenter] 更新任务 ${taskId} 失败:`, err.message);
    }
  }
}

module.exports = new TaskService();
