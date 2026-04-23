const SDK = require('@alicloud/fc20230330');
const Client = SDK.default;
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
    const endpoint = "1184220920681982.cn-hangzhou.fc.aliyuncs.com";
    console.log(`[FC] 严格执行官方 SDK 标准调用 (内置签名认证): https://${endpoint}`);
    
    const config = new OpenApi.Config({
      accessKeyId: ALIBABA_CLOUD_ACCESS_KEY_ID,
      accessKeySecret: ALIBABA_CLOUD_ACCESS_KEY_SECRET,
      endpoint: endpoint,
      protocol: 'HTTPS', 
      readTimeout: 30000,
      connectTimeout: 10000 
    });

    const client = new Client(config);
    
    // 正确从顶级包命名空间引用 Models，避开之前的 CommonJS 混淆和绕过 validate() 报错
    const invokeHeaders = new SDK.InvokeFunctionHeaders({ 
      xFcInvocationType: 'Async' 
    });
    const invokeRequest = new SDK.InvokeFunctionRequest({ 
      body: Readable.from(Buffer.from(JSON.stringify(payload))) 
    });
    
    await client.invokeFunction('watermark-remover', invokeRequest, invokeHeaders);
    
    console.log(`[FC] 调用成功: ${taskId}`);
    return true;

  } catch (e) {
    const errorMsg = e.message;
    console.error(`[FC] SDK 调用失败: ${errorMsg}`);
    return await failTask(taskId, errorMsg);
  }
}

async function failTask(taskId, errorMsg) {
  console.error(`[TaskCenter] ❌ FC 调度失败: ${errorMsg}`);
  await db.query('UPDATE tasks SET status = $1, error = $2 WHERE task_id = $3', ['failed', errorMsg, taskId]);
  return false;
}

module.exports = { dispatchToFC };
