const axios = require('axios');
const FC = require('@alicloud/fc20230330').default;
const OpenApi = require('@alicloud/openapi-client');
const { Readable } = require('stream');
const db = require('./db');
require('dotenv').config();

const {
  ALIBABA_CLOUD_ACCESS_KEY_ID,
  ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  API_CALLBACK_URL,
  WEBHOOK_SECRET
} = process.env;

async function dispatchToFC(taskId, inputUrl) {
  const payload = { taskId, inputUrl, callbackUrl: API_CALLBACK_URL };
  let lastError = "";

  // 策略 1: HTTP Trigger 直连 (优先)
  if (process.env.FC_HTTP_TRIGGER_URL) {
    let targetUrl = process.env.FC_HTTP_TRIGGER_URL.trim();
    if (!targetUrl.endsWith('/invoke')) targetUrl = targetUrl.replace(/\/$/, '') + '/invoke';
    try {
      console.log(`[FC] 策略1 - 尝试 Axios直连 HTTP Trigger: ${targetUrl}`);
      // HTTP Trigger 的超时时间设为 10 秒
      await axios.post(targetUrl, payload, { 
          headers: { 
              'Content-Type': 'application/json', 
              'X-WST-Webhook-Secret': WEBHOOK_SECRET || 'ws_ak_927364_token' 
          }, 
          timeout: 10000 
      });
      console.log(`[FC] 策略1成功: ${taskId}`);
      return true;
    } catch (e) {
      lastError = e.response ? `HTTP ${e.response.status} ${JSON.stringify(e.response.data)}` : e.message;
      console.error(`[FC] 策略1失败: ${lastError}`);
    }
  }

  // 策略 2: 官方 SDK 自动重试机制 (降级)
  if (!ALIBABA_CLOUD_ACCESS_KEY_ID) {
    console.warn(`[FC] 没有配置 ALIBABA_CLOUD_ACCESS_KEY_ID，无法执行 SDK 降级`);
    return await failTask(taskId, lastError);
  }

  // 根据用户之前报错的 account ID 推导 SDK 端点
  const accountId = "1184220920681982"; 
  const endpoints = [
    { url: `${accountId}.cn-hangzhou-internal.fc.aliyuncs.com`, protocol: 'HTTP' }, // 经典内网无阻碍
    { url: `${accountId}.cn-hangzhou.fc.aliyuncs.com`, protocol: 'HTTP' }, // 公网强制 HTTP 防止 IPv6/SSL 握手墙
    { url: `${accountId}.cn-hangzhou.fc.aliyuncs.com`, protocol: 'HTTPS' } // 公网标准 HTTPS
  ];

  for (const ep of endpoints) {
    try {
      console.log(`[FC] 策略2 - 尝试 SDK API 调用: ${ep.protocol}://${ep.url}`);
      const config = new OpenApi.Config({
        accessKeyId: ALIBABA_CLOUD_ACCESS_KEY_ID,
        accessKeySecret: ALIBABA_CLOUD_ACCESS_KEY_SECRET,
        endpoint: ep.url,
        protocol: ep.protocol,
        readTimeout: 30000,
        connectTimeout: 8000, // 8秒内连不上就切下一个端点
      });
      const client = new FC(config);
      const invokeHeaders = new FC.InvokeFunctionHeaders({ xFcInvocationType: 'Async' });
      const invokeRequest = new FC.InvokeFunctionRequest({ body: Readable.from(Buffer.from(JSON.stringify(payload))) });
      
      await client.invokeFunction('watermark-remover', invokeRequest, invokeHeaders);
      
      console.log(`[FC] 策略2成功 (${ep.protocol}://${ep.url}): ${taskId}`);
      return true;
    } catch (e) {
      lastError = e.message;
      console.error(`[FC] 策略2失败 (${ep.protocol}://${ep.url}): ${lastError}`);
    }
  }

  // 所有策略耗尽
  return await failTask(taskId, `所有调度策略全部失败，最后报错: ${lastError.substring(0, 100)}`);
}

async function failTask(taskId, errorMsg) {
  console.error(`[TaskCenter] ❌ FC 调用彻底死锁: ${errorMsg}`);
  await db.query('UPDATE tasks SET status = $1, error = $2 WHERE task_id = $3', ['failed', errorMsg, taskId]);
  return false;
}

module.exports = { dispatchToFC };
