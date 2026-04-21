require('dotenv').config();
const { Pool } = require('pg');

async function initDatabase() {
    console.log('[DB] 正在尝试连接 RDS 数据库...');
    
    if (!process.env.DATABASE_URL) {
        console.error('[DB] ❌ 错误: 环境变量 DATABASE_URL 未设置');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL
    });

    const initSql = `
    -- 创建任务表
    CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        task_id VARCHAR(50) UNIQUE NOT NULL,
        user_id VARCHAR(50),
        file_name TEXT,
        type VARCHAR(20),
        engine VARCHAR(20),
        status VARCHAR(20),
        progress INT DEFAULT 0,
        cost DECIMAL(10, 2),
        error TEXT,
        result_url TEXT,
        result_text TEXT,
        created_at BIGINT
    );

    -- 索引优化
    CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_task_id ON tasks(task_id);
    `;

    try {
        const client = await pool.connect();
        console.log('[DB] ✅ 已成功连接到 RDS');
        
        console.log('[DB] 正在同步表结构...');
        await client.query(initSql);
        
        console.log('[DB] ✨ 数据库表结构初始化/检查完成！');
        
        client.release();
    } catch (err) {
        console.error('[DB] ❌ 初始化失败:', err.message);
        if (err.message.includes('password authentication failed')) {
            console.error('[DB] 💡 提示: 请检查 .env 中的数据库密码是否正确');
        } else if (err.message.includes('ETIMEDOUT')) {
            console.error('[DB] 💡 提示: 请检查 RDS 白名单是否已允许你的 ECS 公网 IP');
        }
    } finally {
        await pool.end();
    }
}

initDatabase();
