const oss = require('../lib/oss');
const fc = require('../lib/fc');
const fs = require('fs');
const path = require('path');

/**
 * TaskService - 核心任务调度中心
 * 负责解析任务路由，决定是调用外部 API 还是内置云函数。
 */
class TaskService {
  constructor() {
    this.tasksDB = null; // 由外部挂载或初始化
    this.saveTasks = null;
  }

  setDatabase(db, saveFn) {
    this.tasksDB = db;
    this.saveTasks = saveFn;
  }

  /**
   * 创建并调度去水印任务
   */
  async createWatermarkTask(params) {
    const { taskId, userId, file, type, engine, cost } = params;

    // 1. 本地记录任务初始状态
    const newTask = {
      taskId,
      userId,
      fileName: file.originalname,
      type,
      engine,
      status: 'uploading', // 第一阶段：上传到 OSS
      progress: 5,
      cost,
      createdAt: Date.now(),
      resultUrl: null,
      error: null
    };
    this.updateTask(taskId, newTask);

    // 2. 异步执行流程 (不阻塞 HTTP 响应)
    this._runWatermarkWorkflow(taskId, file.path, type, engine);

    return newTask;
  }

  async _runWatermarkWorkflow(taskId, localPath, type, engine) {
    try {
      const task = this.getTask(taskId);
      
      // A. 上传到 OSS (为了让云函数能访问到文件)
      const ossPath = `input/${taskId}${path.extname(localPath)}`;
      console.log(`[TaskCenter] 开始上传 OSS: ${ossPath}`);
      const uploadResult = await oss.upload(localPath, ossPath);
      
      this.updateTask(taskId, { 
        status: 'queuing', 
        progress: 20, 
        originalOssUrl: uploadResult.url 
      });

      // B. 调用云函数 FC
      const functionName = 'watermark-remover'; // 预定义的 FC 函数名
      const payload = {
        taskId,
        inputUrl: oss.getSignatureUrl(ossPath, 3600), // 提供 1 小时有效的签名图
        type,
        engine,
        callbackUrl: process.env.API_CALLBACK_URL // FC 处理完后的回调地址
      };

      console.log(`[TaskCenter] 触发 FC 函数: ${functionName}`);
      const fcResult = await fc.invokeAsync(functionName, payload);
      
      this.updateTask(taskId, { 
        status: 'processing', 
        progress: 30, 
        fcRequestId: fcResult.requestId 
      });

      // 注: 最终状态将通过 Webhook 回调更新，或此处可以启动一个兜底的超时检查
    } catch (err) {
      console.error(`[TaskCenter] 任务 ${taskId} 调度失败:`, err.message);
      this.updateTask(taskId, { 
        status: 'failed', 
        error: err.message 
      });
    }
  }

  // ===== 辅助函数 =====

  getTask(taskId) {
    return this.tasksDB ? this.tasksDB.get(taskId) : null;
  }

  updateTask(taskId, updates) {
    if (!this.tasksDB) return;
    const existing = this.tasksDB.get(taskId) || {};
    const updated = { ...existing, ...updates };
    this.tasksDB.set(taskId, updated);
    if (this.saveTasks) this.saveTasks();
  }
}

module.exports = new TaskService();
