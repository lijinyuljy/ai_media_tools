-- ============================================================
-- Winspacetime AI Platform: RDS (PostgreSQL) 初始化脚本
-- ============================================================

-- 1. 用户表
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    nickname VARCHAR(100),
    password_hash VARCHAR(255) NOT NULL,
    credits INTEGER DEFAULT 50,
    role VARCHAR(20) DEFAULT 'user',
    created_at BIGINT NOT NULL
);

-- 2. 积分流水表
CREATE TABLE IF NOT EXISTS ledger (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id),
    amount INTEGER NOT NULL,
    type VARCHAR(20) NOT NULL, -- recharge, consume, gift, admin_credit, etc.
    note TEXT,
    created_at BIGINT NOT NULL
);

-- 3. 任务表
CREATE TABLE IF NOT EXISTS tasks (
    task_id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id),
    file_name VARCHAR(255),
    type VARCHAR(20) NOT NULL, -- watermark, prompt, asr, etc.
    engine VARCHAR(50),
    status VARCHAR(20) DEFAULT 'queuing',
    progress INTEGER DEFAULT 0,
    eta_seconds INTEGER,
    cost INTEGER,
    result_url TEXT,
    result_text TEXT,
    error TEXT,
    created_at BIGINT NOT NULL
);

-- 4. 订单表
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id),
    amount NUMERIC(10, 2) NOT NULL,
    credits INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    payment_method VARCHAR(50),
    estimated_revenue NUMERIC(10, 2),
    created_at BIGINT NOT NULL
);

-- 5. 发票表
CREATE TABLE IF NOT EXISTS invoices (
    id VARCHAR(50) PRIMARY KEY,
    order_id VARCHAR(50) REFERENCES orders(id),
    user_id VARCHAR(50) REFERENCES users(id),
    amount NUMERIC(10, 2) NOT NULL,
    company_name VARCHAR(255),
    tax_id VARCHAR(100),
    email VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending',
    file_url TEXT,
    created_at BIGINT NOT NULL
);

-- 6. 工单系统
CREATE TABLE IF NOT EXISTS tickets (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id),
    subject VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'open',
    replies JSONB DEFAULT '[]', -- 存储对话数组
    created_at BIGINT NOT NULL
);

-- 7. 管理员表 (如果有独立体系)
CREATE TABLE IF NOT EXISTS admins (
    id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'Operator',
    created_at BIGINT NOT NULL
);

-- 索引加速
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_user_id ON ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);
