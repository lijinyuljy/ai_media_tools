const FC = require('@alicloud/fc20230330').default;
const OpenApi = require('@alicloud/openapi-client');
const { Readable } = require('stream');
const db = require('./db');
require('dotenv').config();

const {
  ALIBABA_CLOUD_ACCESS_KEY_ID,
  ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  API_CALLBACK_URL
} = process.env;

async function dispatchToFC(taskId, inputUrl) {
  const payload = { taskId, inputUrl, callbackUrl: API_CALLBACK_URL };
  
  if (!ALIBABA_CLOUD_ACCESS_KEY_ID || !ALIBABA_CLOUD_ACCESS_KEY_SECRET) {
    return await failTask(taskId, "缺少阿里云 ALIBABA_CLOUD_ACCESS_KEY_ID 凭证配置！");
  }

  try {
    // 强制使用阿里云官方 SDK 规范调用（内置完整的 ACS3-HMAC-SHA256 签名机制）
    // 完全丢弃非标准直连逻辑，采用官方高可用 API 端点
    const endpoint = "1184220920681982.cn-hangzhou.fc.aliyuncs.com";
    console.log(`[FC] 严格执行官方 SDK 标准调用 (签名认证): https://${endpoint}`);
    
    // 初始化 OpenAPI 客户端配置
    const config = new OpenApi.Config({
      accessKeyId: ALIBABA_CLOUD_ACCESS_KEY_ID,
      accessKeySecret: ALIBABA_CLOUD_ACCESS_KEY_SECRET,
      endpoint: endpoint,
      protocol: 'HTTPS', 
      readTimeout: 30000,
      connectTimeout: 10000 
    });

    // 实例化官方原生 FC 客户端
    const client = new FC(config);
    
    // 指定为异步调用，符合业务流程
    const invokeHeaders = new FC.InvokeFunctionHeaders({ xFcInvocationType: 'Async' });
    const invokeRequest = new FC.InvokeFunctionRequest({ 
      body: Readable.from(Buffer.from(JSON.stringify(payload))) 
    });
    
    // 官方指定调用函数API (此时 SDK 会自动生成完美的 x-acs-signature 并在 Header 中带上)
    await client.invokeFunction('watermark-remover', invokeRequest, invokeHeaders);
    
    console.log(`[FC] 调用成功: ${taskId}`);
    return true;

  } catch (e) {
    const errorMsg = e.message;
    console.error(`[FC] SDK 签名调用失败: ${errorMsg}`);
    return await failTask(taskId, errorMsg);
  }
}

async function failTask(taskId, errorMsg) {
  console.error(`[TaskCenter] ❌ FC 调度失败: ${errorMsg}`);
  await db.query('UPDATE tasks SET status = $1, error = $2 WHERE task_id = $3', ['failed', errorMsg, taskId]);
  return false;
}

module.exports = { dispatchToFC };
