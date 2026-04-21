const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

// 1. 加载配置
dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error('❌ 错误: DATABASE_URL 未在 .env 文件中设置');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

const sqlPath = path.join(__dirname, 'init_db.sql');

async function initDB() {
  console.log('🚀 准备初始化 RDS 数据库架构...');
  
  try {
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`找不到 SQL 文件: ${sqlPath}`);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('- 正在连接并执行 SQL...');
    await pool.query(sql);
    
    console.log('✅ 数据库架构初始化成功！');
  } catch (err) {
    console.error('❌ 初始化失败！请检查：');
    console.error('1. 您是否已在阿里云 RDS 后台将当前电脑的 IP 加入白名单？');
    console.error('2. .env 中的 DATABASE_URL 是否正确？');
    console.error('\n错误详情:', err.message);
  } finally {
    await pool.end();
  }
}

initDB();
