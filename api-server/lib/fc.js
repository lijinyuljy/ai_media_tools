const FC = require('@alicloud/fc20230330');
const OpenApi = require('@alicloud/openapi-client');
const TeaUtil = require('@alicloud/tea-util');
const axios = require('axios');

class FCService {
  constructor() {
    this.client = null;
    this.init();
  }

  init() {
    const { 
      ALIBABA_CLOUD_ACCESS_KEY_ID, 
      ALIBABA_CLOUD_ACCESS_KEY_SECRET,
      FC_ENDPOINT,
      FC_HTTP_TRIGGER_URL
    } = process.env;

    this.httpTriggerUrl = FC_HTTP_TRIGGER_URL;

    if (!ALIBABA_CLOUD_ACCESS_KEY_ID || !FC_ENDPOINT) {
      console.warn('[FC] ⚠️ 缺少阿里云凭证或 Endpoint (FC_ENDPOINT)，FC 功能将受限');
      return;
    }

    try {
      const config = new OpenApi.Config({
        accessKeyId: ALIBABA_CLOUD_ACCESS_KEY_ID,
        accessKeySecret: ALIBABA_CLOUD_ACCESS_KEY_SECRET,
        endpoint: FC_ENDPOINT,
        readTimeout: 60000,    // 大幅增加读超时至 60 秒
        connectTimeout: 10000,   // 增加连接超时至 10 秒
      });
      this.client = new FC.default(config);
      console.log(`[FC] 已初始化: endpoint=${FC_ENDPOINT}`);
    } catch (e) {
      console.error('[FC] 初始化失败:', e.message);
    }
  }

  /**
   * 异步调用云函数
   * @param {string} functionName 函数名称
   * @param {object} payload 传递给函数的 JSON 数据
   */
  async invokeAsync(functionName, payload) {
    // 如果配置了 HTTP Trigger URL，优先使用 Axios 直接调用
    if (this.httpTriggerUrl) {
      try {
        // 自动补全 /invoke 路径，防止用户直接从中控台复制的 URL 忘记加后缀导致 404
        let targetUrl = this.httpTriggerUrl.trim();
        if (!targetUrl.endsWith('/invoke')) {
          targetUrl = targetUrl.replace(/\/$/, '') + '/invoke';
        }

        const response = await axios.post(targetUrl, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 60000
        });
        return {
          requestId: response.headers['x-fc-request-id'] || 'http-trigger-' + Date.now(),
          status: response.status
        };
      } catch (e) {
        // 提取更为详细的 Axios 报错信息
        const errorMsg = e.response ? `Status: ${e.response.status}, Data: ${JSON.stringify(e.response.data)}` : e.message;
        console.error(`[FC] HTTP Trigger 调用失败:`, errorMsg);
        throw new Error(`HTTP Trigger 调用失败: ${errorMsg}`);
      }
    }

    if (!this.client) throw new Error('FC 客户端未初始化');
    
    try {
      const invokeHeaders = new FC.InvokeFunctionHeaders({
        xFcInvocationType: 'Async', // 关键：异步调用，利用 FC 自带队列
      });
      
      const { Readable } = require('stream');
      const invokeRequest = new FC.InvokeFunctionRequest({
        body: Readable.from(Buffer.from(JSON.stringify(payload))),
      });

      const result = await this.client.invokeFunction(functionName, invokeRequest, invokeHeaders);
      return {
        requestId: result.headers['x-fc-request-id'],
        status: result.statusCode
      };
    } catch (e) {
      console.error(`[FC] 函数 ${functionName} 调用失败:`, e.message);
      throw e;
    }
  }
}

module.exports = new FCService();
