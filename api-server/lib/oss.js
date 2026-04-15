const OSS = require('ali-oss');
const path = require('path');

class OSSService {
  constructor() {
    this.client = null;
    this.init();
  }

  init() {
    const { 
      ALIBABA_CLOUD_ACCESS_KEY_ID, 
      ALIBABA_CLOUD_ACCESS_KEY_SECRET,
      OSS_REGION,
      OSS_BUCKET
    } = process.env;

    if (!ALIBABA_CLOUD_ACCESS_KEY_ID || !ALIBABA_CLOUD_ACCESS_KEY_SECRET) {
      console.warn('[OSS] ⚠️ 缺少阿里云凭证 (ALIBABA_CLOUD_ACCESS_KEY_ID)，OSS 功能将受限');
      return;
    }

    try {
      this.client = new OSS({
        region: OSS_REGION || 'oss-cn-hangzhou',
        accessKeyId: ALIBABA_CLOUD_ACCESS_KEY_ID,
        accessKeySecret: ALIBABA_CLOUD_ACCESS_KEY_SECRET,
        bucket: OSS_BUCKET,
        secure: true, // 使用 HTTPS
      });
      console.log(`[OSS] 已初始化: region=${OSS_REGION}, bucket=${OSS_BUCKET}`);
    } catch (e) {
      console.error('[OSS] 初始化失败:', e.message);
    }
  }

  /**
   * 上传本地文件到 OSS
   * @param {string} localPath 本地路径
   * @param {string} ossPath OSS 路径 (不含 bucket 名)
   */
  async upload(localPath, ossPath) {
    if (!this.client) throw new Error('OSS 客户端未初始化');
    try {
      const result = await this.client.put(ossPath, path.normalize(localPath));
      return {
        url: result.url, // 注意：如果 bucket 是私有的，此 URL 无法直接访问，需使用 signatureUrl
        name: result.name
      };
    } catch (e) {
      console.error('[OSS] 上传失败:', e.message);
      throw e;
    }
  }

  /**
   * 生成带签名的访问 URL (用于私有桶)
   * @param {string} ossPath OSS 路径
   * @param {number} expires 过期时间 (秒)，默认 1 小时
   */
  getSignatureUrl(ossPath, expires = 3600) {
    if (!this.client) return null;
    try {
      return this.client.signatureUrl(ossPath, { expires });
    } catch (e) {
      console.error('[OSS] 签名失败:', e.message);
      return null;
    }
  }

  /**
   * 获取文件元信息
   */
  async head(ossPath) {
    if (!this.client) return null;
    try {
      return await this.client.head(ossPath);
    } catch (e) {
      return null;
    }
  }
}

module.exports = new OSSService();
