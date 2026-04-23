const axios = require('axios');
const util = require("@alicloud/openapi-util");
const db = require('./db');
require('dotenv').config();

const {
  ALIBABA_CLOUD_ACCESS_KEY_ID,
  ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  API_CALLBACK_URL,
  WEBHOOK_SECRET,
  FC_HTTP_TRIGGER_URL
} = process.env;

async function dispatchToFC(taskId, inputUrl) {
  const payload = { taskId, inputUrl, callbackUrl: API_CALLBACK_URL };
  
  if (!FC_HTTP_TRIGGER_URL || !ALIBABA_CLOUD_ACCESS_KEY_ID || !ALIBABA_CLOUD_ACCESS_KEY_SECRET) {
    return await failTask(taskId, "缺少 FC 触发器 URL 或签名凭证配置！");
  }

  let targetUrl = FC_HTTP_TRIGGER_URL.trim();
  if (!targetUrl.endsWith('/invoke')) targetUrl = targetUrl.replace(/\/$/, '') + '/invoke';

  try {
    console.log(`[FC] 彻底按官方文档规范，采用 Signature Auth 访问 HTTP 触发器: ${targetUrl}`);
    
    const method = 'POST';
    const bodyStr = JSON.stringify(payload);
    const date = new Date().toISOString();
    
    // 只放入参与计算网关签名的核心 Header
    let headers = {
      'x-acs-date': date,
      'Content-Type': 'application/json'
    };

    const parsedUrl = new URL(targetUrl);
    
    // 构建签名鉴权对象 (原样复制官方文档结构)
    const authRequest = {
      method: method,
      pathname: parsedUrl.pathname.replace('$', '%24'),
      headers: headers,
      query: Object.fromEntries(parsedUrl.searchParams),
    };

    // 严苛调用官方底层签名算法 (ACS3-HMAC-SHA256)
    const auth = util.default.getAuthorization(
      authRequest,
      'ACS3-HMAC-SHA256',
      '',
      ALIBABA_CLOUD_ACCESS_KEY_ID,
      ALIBABA_CLOUD_ACCESS_KEY_SECRET
    );
    headers['authorization'] = auth;
    
    // 签名计算完成之后，再置入透传给我们自己业务容器的安全 Token (防污染签名计算)
    headers['X-WST-Webhook-Secret'] = WEBHOOK_SECRET || 'ws_ak_927364_token';

    // 默认 HTTP 触发器，发起 POST 请求
    const resp = await axios.post(targetUrl, bodyStr, {
        headers: headers,
        timeout: 10000 // 足够完成建连与抛出任务的时间
    });

    // 成功
    console.log(`[FC] 调用成功: ${taskId}, 请求标识: ${resp.headers['x-fc-request-id'] || 'N/A'}`);
    return true;

  } catch (e) {
    const errorMsg = e.response ? `HTTP ${e.response.status} ${JSON.stringify(e.response.data)}` : e.message;
    console.error(`[FC] 签名调用失败: ${errorMsg}`);
    return await failTask(taskId, errorMsg);
  }
}

async function failTask(taskId, errorMsg) {
  console.error(`[TaskCenter] ❌ FC 调度失败: ${errorMsg}`);
  await db.query('UPDATE tasks SET status = $1, error = $2 WHERE task_id = $3', ['failed', errorMsg, taskId]);
  return false;
}

module.exports = { dispatchToFC };
