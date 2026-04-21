const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

// 1. 加载配置
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

const DATA_DIR = path.join(__dirname, '..');

async function migrate() {
  console.log('🚀 开始从 JSON 迁移数据到 RDS...');

  try {
    // A. 迁移用户 (users.json)
    const usersFile = path.join(DATA_DIR, 'users.json');
    if (fs.existsSync(usersFile)) {
      const usersData = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
      console.log(`- 正在处理 ${usersData.length} 个用户...`);
      for (const [id, user] of usersData) {
        await pool.query(
          `INSERT INTO users (id, email, nickname, password_hash, credits, role, created_at) 
           VALUES ($1, $2, $3, $4, $5, $6, $7) 
           ON CONFLICT (id) DO NOTHING`,
          [user.id, user.email, user.nickname, user.passwordHash, user.credits, user.role, user.createdAt]
        );
      }
    }

    // B. 迁移任务 (tasks.json)
    const tasksFile = path.join(DATA_DIR, 'tasks.json');
    if (fs.existsSync(tasksFile)) {
      const tasksData = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
      console.log(`- 正在处理 ${tasksData.length} 个任务...`);
      for (const [id, task] of tasksData) {
        await pool.query(
          `INSERT INTO tasks (task_id, user_id, file_name, type, engine, status, progress, eta_seconds, cost, result_url, created_at) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
           ON CONFLICT (task_id) DO NOTHING`,
          [task.taskId, task.userId, task.fileName, task.type, task.engine, task.status, task.progress, task.eta_seconds, task.cost, task.resultUrl, task.createdAt]
        );
      }
    }

    // C. 迁移流水 (ledger.json)
    const ledgerFile = path.join(DATA_DIR, 'ledger.json');
    if (fs.existsSync(ledgerFile)) {
      const ledgerData = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
      console.log(`- 正在处理 ${ledgerData.length} 条流水...`);
      for (const entry of ledgerData) {
        await pool.query(
          `INSERT INTO ledger (id, user_id, amount, type, note, created_at) 
           VALUES ($1, $2, $3, $4, $5, $6) 
           ON CONFLICT (id) DO NOTHING`,
          [entry.id, entry.userId, entry.amount, entry.type, entry.note, entry.createdAt]
        );
      }
    }

    // D. 迁移订单 (orders.json)
    const ordersFile = path.join(DATA_DIR, 'orders.json');
    if (fs.existsSync(ordersFile)) {
      const ordersData = JSON.parse(fs.readFileSync(ordersFile, 'utf8'));
      console.log(`- 正在处理 ${ordersData.length} 条订单...`);
      for (const order of ordersData) {
        await pool.query(
          `INSERT INTO orders (id, user_id, amount, credits, status, payment_method, estimated_revenue, created_at) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
           ON CONFLICT (id) DO NOTHING`,
          [order.id, order.userId, order.amount, order.credits, order.status, order.paymentMethod, order.estimatedRevenue || 0, order.createdAt]
        );
      }
    }

    console.log('✅ 迁移完成！');
  } catch (err) {
    console.error('❌ 迁移过程中出错:', err);
  } finally {
    await pool.end();
  }
}

migrate();
