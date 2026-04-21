const { Pool } = require('pg');

/**
 * DB 适配器 - 用于连接阿里云 RDS (PostgreSQL)
 */
class DBService {
  constructor() {
    this.pool = null;
    this.init();
  }

  init() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      console.warn('[DB] ⚠️ 环境变量 DATABASE_URL 未设置，正在回退到 Mock 模式（或本地 JSON 模式）');
      return;
    }

    try {
      this.pool = new Pool({
        connectionString: connectionString,
        ssl: false, // 阿里云部分 RDS 入口可能未启用 SSL，先禁用以确保连通
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      this.pool.on('error', (err) => {
        console.error('[DB] ❌ 数据库连接池错误:', err.message);
      });

      console.log('[DB] 已初始化数据连接池');
    } catch (e) {
      console.error('[DB] ❌ 初始化失败:', e.message);
    }
  }

  /**
   * 执行 SQL 查询
   */
  async query(text, params) {
    if (!this.pool) throw new Error('数据库未连接');
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
      if (duration > 500) {
        console.warn(`[DB] 🐢 慢查询探测: ${duration}ms - ${text}`);
      }
      return res;
    } catch (e) {
      console.error('[DB] ❌ 查询出错:', e.message, `SQL: ${text}`);
      throw e;
    }
  }

  /**
   * 获取 Client 进行事务操作
   */
  async getClient() {
    if (!this.pool) throw new Error('数据库未连接');
    return await this.pool.connect();
  }

  /**
   * 关闭连接池
   */
  async close() {
    if (this.pool) await this.pool.end();
  }
}

module.exports = new DBService();
