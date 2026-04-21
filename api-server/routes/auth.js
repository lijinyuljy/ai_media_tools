/**
 * auth.js — 用户 & 管理员双轨鉴权路由
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const router = express.Router();

// ===== Multer Configuration for Invoices & Tickets =====
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const type = req.query.type || 'others';
    const uploadPath = path.join(__dirname, '..', 'uploads', type);
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, Date.now() + '-' + safeName);
  }
});
const upload = multer({ storage: storage });

// ⚠️ JWT 密钥必须来自环境变量，无 fallback
const JWT_USER_SECRET = process.env.JWT_USER_SECRET;
const JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET;

if (!JWT_USER_SECRET || !JWT_ADMIN_SECRET) {
  console.error('[SECURITY] ❌ JWT_USER_SECRET 或 JWT_ADMIN_SECRET 未设置！请检查 .env 文件，服务拒绝启动。');
  process.exit(1);
}

const USER_TOKEN_TTL = '7d';
const ADMIN_TOKEN_TTL = '4h';

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');

// ===== 登录失败频率限制（防暴力破解 - 内存保留或后续迁至 Redis）=====
const loginAttempts = new Map(); // key -> { count, resetAt }
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15分钟

const checkRateLimit = (key) => {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (record && now < record.resetAt && record.count >= MAX_ATTEMPTS) {
    const remaining = Math.ceil((record.resetAt - now) / 60000);
    return { blocked: true, remaining };
  }
  return { blocked: false };
};

const recordFailedAttempt = (key) => {
  const now = Date.now();
  const record = loginAttempts.get(key) || { count: 0, resetAt: now + LOCKOUT_MS };
  if (now >= record.resetAt) { record.count = 0; record.resetAt = now + LOCKOUT_MS; }
  record.count++;
  loginAttempts.set(key, record);
};

const clearAttempts = (key) => loginAttempts.delete(key);

const SUPER_ADMIN_ID = 'adm_super';
const SUPER_ADMIN_USERNAME = process.env.ADMIN_INIT_USERNAME || 'superadmin';

// 初始化超管检测 (确保管理员表中有超管)
(async () => {
  try {
    const { rows } = await db.query('SELECT * FROM admins WHERE id = $1', [SUPER_ADMIN_ID]);
    if (rows.length === 0) {
      const pwdFile = path.join(__dirname, '..', 'ADMIN_INITIAL_PASSWORD.txt');
      let hash;
      const adminPwdFile = path.join(__dirname, '..', 'admin_hash.secret');
      
      if (fs.existsSync(adminPwdFile)) {
        hash = fs.readFileSync(adminPwdFile, 'utf8').trim();
      } else if (fs.existsSync(pwdFile)) {
        const content = fs.readFileSync(pwdFile, 'utf8');
        const match = content.match(/初始密码: (.+)/);
        if (match) {
          hash = await bcrypt.hash(match[1].trim(), 12);
          fs.writeFileSync(adminPwdFile, hash);
        }
      }

      if (hash) {
        await db.query(
          'INSERT INTO admins (id, username, password_hash, role, created_at) VALUES ($1, $2, $3, $4, $5)',
          [SUPER_ADMIN_ID, SUPER_ADMIN_USERNAME, hash, 'SuperAdmin', Date.now()]
        );
        console.log(`[Auth] 管理员表初始化: ${SUPER_ADMIN_USERNAME} 已入库`);
      }
    }
  } catch (e) {
    console.error('[Auth] 初始化 RDS 管理员失败:', e.message);
  }
})();



// ─── 工具函数 ─────────────────────────────────────────

const signUserToken = (user) =>
  jwt.sign({ id: user.id, role: 'user' }, JWT_USER_SECRET, { expiresIn: USER_TOKEN_TTL });

const signAdminToken = (admin) =>
  jwt.sign({ id: admin.id, role: admin.role }, JWT_ADMIN_SECRET, { expiresIn: ADMIN_TOKEN_TTL });

// ─── 中间件：用户鉴权 ─────────────────────────────────

const authUser = (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '未登录，请先获取 token' });
  try {
    req.user = jwt.verify(token, JWT_USER_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'token 无效或已过期' });
  }
};

// ─── 中间件：管理员鉴权 ───────────────────────────────

const authAdmin = (required_role) => (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '管理员未登录' });
  try {
    req.admin = jwt.verify(token, JWT_ADMIN_SECRET);
    if (required_role && req.admin.role !== 'SuperAdmin' && req.admin.role !== required_role) {
      return res.status(403).json({ error: `权限不足，需要 ${required_role} 角色` });
    }
    next();
  } catch {
    return res.status(401).json({ error: '管理员 token 无效或已过期' });
  }
};

// ─── 用户注册 ─────────────────────────────────────────

router.post('/auth/register', async (req, res) => {
  const { email, password, nickname } = req.body;
  if (!email || !password) return res.status(400).json({ error: '邮箱和密码不能为空' });
  if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });

  try {
    const { rows: existing } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existing.length > 0) return res.status(409).json({ error: '该邮箱已注册' });

    const id = 'usr_' + Date.now();
    const passwordHash = await bcrypt.hash(password, 10);
    const initialCredits = 50;

    await db.query(
      'INSERT INTO users (id, email, nickname, password_hash, credits, role, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, email, nickname || email.split('@')[0], passwordHash, initialCredits, 'user', Date.now()]
    );

    // 写入赠送积分流水
    await db.query(
      'INSERT INTO ledger (id, user_id, amount, type, note, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      ['txn_' + Date.now(), id, initialCredits, 'gift', '新用户注册赠送', Date.now()]
    );

    const token = signUserToken({ id, role: 'user' });
    res.status(201).json({
      token,
      user: { id, email, nickname: nickname || email.split('@')[0], credits: initialCredits, role: 'user' }
    });
  } catch (err) {
    console.error('[Auth] 注册失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ─── 用户登录 ─────────────────────────────────────────

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: '邮箱和密码不能为空' });

  const rl = checkRateLimit(`login:${email}`);
  if (rl.blocked) return res.status(429).json({ error: `登录尝试次数过多，请 ${rl.remaining} 分钟后再试` });

  try {
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user) { recordFailedAttempt(`login:${email}`); return res.status(401).json({ error: '邮箱或密码错误' }); }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) { recordFailedAttempt(`login:${email}`); return res.status(401).json({ error: '邮箱或密码错误' }); }

    clearAttempts(`login:${email}`);
    const token = signUserToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, nickname: user.nickname, credits: user.credits, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: '登录服务异常' });
  }
});

// ─── 获取当前用户信息 ──────────────────────────────────

router.get('/auth/me', authUser, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, email, nickname, credits, role FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// ─── 获取用户积分流水 ──────────────────────────────────

router.get('/user/credits/ledger', authUser, async (req, res) => {
  try {
    const { rows: ledger } = await db.query('SELECT * FROM ledger WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    const { rows: userRows } = await db.query('SELECT credits FROM users WHERE id = $1', [req.user.id]);
    res.json({ credits: userRows[0]?.credits || 0, ledger });
  } catch (err) {
    res.status(500).json({ error: '读取流水失败' });
  }
});

// ─── 管理员登录（独立密码体系） ────────────────────────

router.post('/admin/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '账号和密码不能为空' });

  const rl = checkRateLimit(`admin:${username}`);
  if (rl.blocked) return res.status(429).json({ error: `登录尝试次数过多，请 ${rl.remaining} 分钟后再试` });

  try {
    const { rows } = await db.query('SELECT * FROM admins WHERE username = $1', [username]);
    const admin = rows[0];
    if (!admin) { recordFailedAttempt(`admin:${username}`); return res.status(401).json({ error: '账号或密码错误' }); }

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) { recordFailedAttempt(`admin:${username}`); return res.status(401).json({ error: '账号或密码错误' }); }

    clearAttempts(`admin:${username}`);
    const token = signAdminToken(admin);
    res.json({
      token,
      admin: { id: admin.id, username: admin.username, role: admin.role }
    });
  } catch (err) {
    res.status(500).json({ error: '管理员登录异常' });
  }
});

// ─── 获取当前管理员信息 ────────────────────────────────

router.get('/admin/auth/me', authAdmin(), async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, username, role FROM admins WHERE id = $1', [req.admin.id]);
    const admin = rows[0];
    if (!admin) return res.status(404).json({ error: '管理员不存在' });
    res.json(admin);
  } catch (err) {
    res.status(500).json({ error: '获取信息失败' });
  }
});

// ─── 管理员：查看所有用户 ──────────────────────────────

router.get('/admin/users', authAdmin('Operator'), async (req, res) => {
  try {
    const { rows: users } = await db.query('SELECT id, email, nickname, credits, created_at FROM users ORDER BY created_at DESC');
    res.json({ users, total: users.length });
  } catch (err) {
    res.status(500).json({ error: '读取用户列表失败' });
  }
});

// ─── 管理员：调整用户积分（需 SuperAdmin） ─────────────

router.patch('/admin/users/:userId/credits', authAdmin('SuperAdmin'), async (req, res) => {
  const { userId } = req.params;
  const { delta, note } = req.body;
  if (typeof delta !== 'number') return res.status(400).json({ error: 'delta 必须是数字' });

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    
    const { rows } = await client.query('UPDATE users SET credits = credits + $1 WHERE id = $2 RETURNING credits', [delta, userId]);
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '用户不存在' });
    }

    const txnId = 'txn_' + Date.now();
    await client.query(
      'INSERT INTO ledger (id, user_id, amount, type, note, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [txnId, userId, delta, delta > 0 ? 'admin_credit' : 'admin_debit', note || '管理员手动调整', Date.now()]
    );

    await client.query('COMMIT');
    res.json({ success: true, newCredits: rows[0].credits, txnId });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: '调整积分失败' });
  } finally {
    client.release();
  }
});

// ─── 扩展：手机验证码登录 (Mock) ─────────────────────────

router.post('/auth/sms/send', (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: '手机号不能为空' });
  console.log(`[SMS] 模拟向 ${phone} 发送验证码: 123456`);
  res.json({ success: true, message: '验证码已发送' });
});

router.post('/auth/sms/login', async (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) return res.status(400).json({ error: '手机号和验证码不能为空' });
  if (code !== '123456') return res.status(401).json({ error: '验证码错误' });

  let user = [...usersDB.values()].find(u => u.phone === phone);
  if (!user) {
    // 自动注册
    user = {
      id: 'usr_' + Date.now(),
      email: `${phone}@phone.user`, // 降级处理
      phone,
      nickname: `手机用户_${phone.slice(-4)}`,
      passwordHash: 'SMS_LOGIN_NO_PWD',
      credits: 50, // 初始赠送
      role: 'User',
      createdAt: Date.now()
    };
    usersDB.set(user.id, user);
    saveUsers();
  }

  const token = signUserToken(user);
  res.json({
    token,
    user: { id: user.id, phone: user.phone, nickname: user.nickname, credits: user.credits, role: user.role }
  });
});

// ─── 扩展：微信扫码登录 (Mock) ──────────────────────────

router.get('/auth/wechat/qrcode', (req, res) => {
  const sceneId = 'scene_' + Math.random().toString(36).substr(2, 9);
  res.json({ 
    sceneId, 
    qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=WINSPACE_AUTH_${sceneId}`
  });
});

router.get('/auth/wechat/check', (req, res) => {
  const { sceneId } = req.query;
  // 模拟轮询逻辑：如果 sceneId 的最后一位是数字且偶数，模拟成功；否则模拟等待。
  // 实际开发中可以通过 Redis 存储扫码状态。
  const lastChar = sceneId.slice(-1);
  const isReady = !isNaN(parseInt(lastChar)) && parseInt(lastChar) % 2 === 0;

  if (isReady) {
    // 模拟一个固定微信用户
    let user = usersDB.get('usr_wechat_mock');
    if (!user) {
      user = {
        id: 'usr_wechat_mock',
        email: 'wechat@winspace.ai',
        nickname: '微信扫码用户',
        passwordHash: 'WECHAT_LOGIN_NO_PWD',
        credits: 88,
        role: 'User',
        createdAt: Date.now()
      };
      usersDB.set(user.id, user);
      saveUsers();
    }
    const token = signUserToken(user);
    res.json({ status: 'success', token, user: { id: user.id, nickname: user.nickname, credits: user.credits } });
  } else {
    res.json({ status: 'waiting' });
  }
});

// ─── 扩展：计费与充值 (Mock) ──────────────────────────

router.post('/billing/recharge', authUser, async (req, res) => {
  const userId = req.user.id;
  const amount = 100; // 模拟固定充值包
  const price = 9.9;

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query('UPDATE users SET credits = credits + $1 WHERE id = $2 RETURNING credits', [amount, userId]);
    const txnId = 'txn_' + Date.now();
    await client.query(
      'INSERT INTO ledger (id, user_id, amount, type, note, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [txnId, userId, amount, 'recharge', '微信/支付宝充值', Date.now()]
    );

    const orderId = 'ord_' + Date.now();
    await client.query(
      'INSERT INTO orders (id, user_id, amount, credits, status, payment_method, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [orderId, userId, price, amount, 'paid', 'WeChatPay', Date.now()]
    );

    await client.query('COMMIT');
    res.json({ success: true, newCredits: rows[0].credits, message: `成功充值 ${amount} 点数` });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: '充值处理失败' });
  } finally {
    client.release();
  }
});

router.post('/billing/watch-ad', authUser, async (req, res) => {
  const userId = req.user.id;
  const reward = 5;

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('UPDATE users SET credits = credits + $1 WHERE id = $2 RETURNING credits', [reward, userId]);
    
    await client.query(
      'INSERT INTO ledger (id, user_id, amount, type, note, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      ['txn_' + Date.now(), userId, reward, 'ad_reward', '观看广告激励', Date.now()]
    );

    await client.query(
      'INSERT INTO orders (id, user_id, amount, credits, status, payment_method, estimated_revenue, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      ['ord_ad_' + Date.now(), userId, 0, reward, 'paid', 'AdReward', 0.8, Date.now()]
    );

    await client.query('COMMIT');
    res.json({ success: true, newCredits: rows[0].credits, message: `观看完成，获得 ${reward} 点数奖励` });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: '奖励发放失败' });
  } finally {
    client.release();
  }
});

// ─── 新增：订单系统 ──────────────────────────────────────

router.get('/user/orders', authUser, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json({ orders: rows });
  } catch (err) {
    res.status(500).json({ error: '获取订单失败' });
  }
});

router.get('/admin/orders', authAdmin('Operator'), async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM orders ORDER BY created_at DESC');
    res.json({ orders: rows });
  } catch (err) {
    res.status(500).json({ error: '读取订单库失败' });
  }
});

router.patch('/admin/orders/:id', authAdmin('SuperAdmin'), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    await db.query('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '更新订单失败' });
  }
});

// ─── 新增：发票系统 ──────────────────────────────────────

router.post('/user/invoices', authUser, async (req, res) => {
  const { orderId, companyName, taxId, email } = req.body;
  if (!orderId || !companyName || !taxId) return res.status(400).json({ error: '信息不完整' });

  try {
    const { rows: orderRows } = await db.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [orderId, req.user.id]);
    const order = orderRows[0];
    if (!order) return res.status(404).json({ error: '订单无效' });

    const { rows: exists } = await db.query('SELECT * FROM invoices WHERE order_id = $1', [orderId]);
    if (exists.length > 0) return res.status(409).json({ error: '该订单已申请过发票' });

    const id = 'inv_' + Date.now();
    await db.query(
      'INSERT INTO invoices (id, order_id, user_id, amount, company_name, tax_id, email, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [id, orderId, req.user.id, order.amount, companyName, taxId, email, 'pending', Date.now()]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '申报发票失败' });
  }
});

router.get('/user/invoices', authUser, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM invoices WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json({ invoices: rows });
  } catch (err) {
    res.status(500).json({ error: '获取发票列表失败' });
  }
});

router.get('/admin/invoices', authAdmin('Operator'), async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM invoices ORDER BY created_at DESC');
    res.json({ invoices: rows });
  } catch (err) {
    res.status(500).json({ error: '读取发票库失败' });
  }
});

router.patch('/admin/invoices/:id', authAdmin('Operator'), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    await db.query('UPDATE invoices SET status = $1 WHERE id = $2', [status, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '修改发票状态失败' });
  }
});

router.post('/admin/invoices/:id/upload', authAdmin('Operator'), upload.single('invoice'), async (req, res) => {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ error: '请选择文件上传' });
  
  const fileUrl = `/uploads/invoices/${req.file.filename}`;
  try {
    await db.query('UPDATE invoices SET file_url = $1, status = $2 WHERE id = $3', [fileUrl, 'sent', id]);
    res.json({ success: true, fileUrl });
  } catch (err) {
    res.status(500).json({ error: '上传发票文件失败' });
  }
});

// ─── 新增：工单系统 ──────────────────────────────────────

router.post('/user/tickets', authUser, async (req, res) => {
  const { subject, content } = req.body;
  if (!subject || !content) return res.status(400).json({ error: '基本信息缺失' });

  try {
    const { rows } = await db.query('SELECT COUNT(*) FROM tickets WHERE user_id = $1 AND status != $2', [req.user.id, 'closed']);
    if (parseInt(rows[0].count) >= 3) {
      return res.status(429).json({ error: '您已有 3 个工单处理中，请先耐心等待客服回复或解决旧工单' });
    }

    const id = 'tk_' + Date.now();
    await db.query(
      'INSERT INTO tickets (id, user_id, subject, content, status, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, req.user.id, subject, content, 'open', Date.now()]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '创建工单失败' });
  }
});

router.get('/user/tickets', authUser, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM tickets WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json({ tickets: rows });
  } catch (err) {
    res.status(500).json({ error: '获取工单列表失败' });
  }
});

router.post('/user/tickets/:id/reply', authUser, upload.single('attachment'), async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  
  try {
    const { rows } = await db.query('SELECT replies FROM tickets WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (rows.length === 0) return res.status(404).json({ error: '工单未找到' });

    const reply = { role: 'user', content, createdAt: Date.now() };
    if (req.file) reply.attachment = `/uploads/tickets/${req.file.filename}`;

    const newReplies = [...(rows[0].replies || []), reply];
    await db.query('UPDATE tickets SET replies = $1, status = $2 WHERE id = $3', [JSON.stringify(newReplies), 'open', id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '回复工单失败' });
  }
});

router.get('/admin/tickets', authAdmin('Operator'), async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM tickets ORDER BY created_at DESC');
    res.json({ tickets: rows });
  } catch (err) {
    res.status(500).json({ error: '读取工单库失败' });
  }
});

router.post('/user/tickets/:id/close', authUser, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('UPDATE tickets SET status = $1 WHERE id = $2 AND user_id = $3', ['closed', id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '关闭工单失败' });
  }
});

router.post('/admin/tickets/:id/reply', authAdmin('Operator'), upload.single('attachment'), async (req, res) => {
  const { id } = req.params;
  const { content, status } = req.body;

  try {
    const { rows } = await db.query('SELECT replies FROM tickets WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: '工单未找到' });

    const reply = { role: 'admin', content, adminId: req.admin.id, createdAt: Date.now() };
    if (req.file) reply.attachment = `/uploads/tickets/${req.file.filename}`;

    const newReplies = [...(rows[0].replies || []), reply];
    const finalStatus = status || 'replied';

    await db.query('UPDATE tickets SET replies = $1, status = $2 WHERE id = $3', [JSON.stringify(newReplies), finalStatus, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '管理员回复失败' });
  }
});

// 导出路由和中间件供其他路由使用
module.exports = { router, authUser, authAdmin };
