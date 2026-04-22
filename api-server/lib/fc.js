const FC = require('@alicloud/fc20230330');
const OpenApi = require('@alicloud/openapi-client');
const TeaUtil = require('@alicloud/tea-util');

class FCService {
  constructor() {
    this.client = null;
    this.init();
  }

  init() {
    const { 
      ALIBABA_CLOUD_ACCESS_KEY_ID, 
      ALIBABA_CLOUD_ACCESS_KEY_SECRET,
      FC_ENDPOINT // 例如: 12345.cn-hangzhou.fc.aliyuncs.com
    } = process.env;

    if (!ALIBABA_CLOUD_ACCESS_KEY_ID || !FC_ENDPOINT) {
      console.warn('[FC] ⚠️ 缺少阿里云凭证或 Endpoint (FC_ENDPOINT)，FC 功能将受限');
      return;
    }

    try {
      const config = new OpenApi.Config({
        accessKeyId: ALIBABA_CLOUD_ACCESS_KEY_ID,
        accessKeySecret: ALIBABA_CLOUD_ACCESS_KEY_SECRET,
        endpoint: FC_ENDPOINT,
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
