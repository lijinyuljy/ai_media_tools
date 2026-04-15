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

// ===== 持久化文件路径 =====
const USERS_FILE = path.join(__dirname, '..', 'users.json');
const LEDGER_FILE = path.join(__dirname, '..', 'ledger.json');
const ORDERS_FILE = path.join(__dirname, '..', 'orders.json');
const INVOICES_FILE = path.join(__dirname, '..', 'invoices.json');
const TICKETS_FILE = path.join(__dirname, '..', 'tickets.json');

// ===== In-Memory Stores (由文件恢复) =====
const usersDB = new Map();
const adminsDB = new Map();
let creditsLedger = [];
let ordersDB = [];
let invoicesDB = [];
let ticketsDB = [];

// 数据持久化核心函数
const saveUsers = () => {
    try {
        const data = Array.from(usersDB.entries());
        fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
    } catch (e) { console.error('[DB] 用户数据保存失败:', e.message); }
};

const saveLedger = () => {
    try {
        fs.writeFileSync(LEDGER_FILE, JSON.stringify(creditsLedger, null, 2));
    } catch (e) { console.error('[DB] 流水数据保存失败:', e.message); }
};

const saveOrders = () => {
    try { fs.writeFileSync(ORDERS_FILE, JSON.stringify(ordersDB, null, 2)); }
    catch (e) { console.error('[DB] 订单数据保存失败:', e.message); }
};

const saveInvoices = () => {
    try { fs.writeFileSync(INVOICES_FILE, JSON.stringify(invoicesDB, null, 2)); }
    catch (e) { console.error('[DB] 发票数据保存失败:', e.message); }
};

const saveTickets = () => {
    try { fs.writeFileSync(TICKETS_FILE, JSON.stringify(ticketsDB, null, 2)); }
    catch (e) { console.error('[DB] 工单数据保存失败:', e.message); }
};

// 数据加载初始化
try {
    if (fs.existsSync(USERS_FILE)) {
        const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        data.forEach(([id, user]) => usersDB.set(id, user));
        console.log('[DB] 已从 users.json 恢复', usersDB.size, '个用户');
    }
} catch (e) { console.error('[DB] 加载 users.json 失败:', e); }

try {
    if (fs.existsSync(LEDGER_FILE)) {
        creditsLedger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
        console.log('[DB] 已从 ledger.json 恢复', creditsLedger.length, '条流水');
    }
} catch (e) { console.error('[DB] 加载 ledger.json 失败:', e); }

const loadDB = (file, dbName) => {
    try {
        if (fs.existsSync(file)) {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            console.log(`[DB] 已从 ${path.basename(file)} 恢复 ${data.length} 条${dbName}`);
            return data;
        }
    } catch (e) { console.error(`[DB] 加载 ${file} 失败:`, e.message); }
    return [];
};

ordersDB = loadDB(ORDERS_FILE, '订单');
invoicesDB = loadDB(INVOICES_FILE, '发票');
ticketsDB = loadDB(TICKETS_FILE, '工单');

// ===== 登录失败频率限制（防暴力破解）=====
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

// ===== 初始化超管账号（密码来自 ADMIN_INITIAL_PASSWORD.txt，非硬编码）=====
const SUPER_ADMIN_ID = 'adm_super';
const SUPER_ADMIN_USERNAME = process.env.ADMIN_INIT_USERNAME || 'superadmin';

// 从 config.json 读取已保存的 admin hash，否则使用生成的初始 hash
const adminPwdFile = path.join(__dirname, '..', 'admin_hash.secret');

(async () => {
  let hash;
  if (fs.existsSync(adminPwdFile)) {
    hash = fs.readFileSync(adminPwdFile, 'utf8').trim();
    console.log('[Auth] 超管账号已从安全文件恢复');
  } else {
    // 首次启动：读取初始密码文件生成 hash
    const pwdFile = path.join(__dirname, '..', 'ADMIN_INITIAL_PASSWORD.txt');
    if (fs.existsSync(pwdFile)) {
      const content = fs.readFileSync(pwdFile, 'utf8');
      const match = content.match(/初始密码: (.+)/);
      if (match) {
        hash = await bcrypt.hash(match[1].trim(), 12);
        fs.writeFileSync(adminPwdFile, hash);
        console.log(`[Auth] 超管账号已初始化: ${SUPER_ADMIN_USERNAME} (查看 ADMIN_INITIAL_PASSWORD.txt)`);
      }
    }
    if (!hash) {
      console.error('[Auth] ❌ 无法初始化超管账号，请确保 ADMIN_INITIAL_PASSWORD.txt 存在');
      process.exit(1);
    }
  }

  adminsDB.set(SUPER_ADMIN_ID, {
    id: SUPER_ADMIN_ID,
    username: SUPER_ADMIN_USERNAME,
    passwordHash: hash,
    role: 'SuperAdmin',
    createdAt: Date.now()
  });
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

  const existing = [...usersDB.values()].find(u => u.email === email);
  if (existing) return res.status(409).json({ error: '该邮箱已注册' });

  const id = 'usr_' + Date.now();
  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id,
    email,
    nickname: nickname || email.split('@')[0],
    passwordHash,
    credits: 50,   // 初始赠送 50 Credits
    role: 'user',
    createdAt: Date.now()
  };
  usersDB.set(id, user);
  saveUsers();

  // 写入赠送积分流水
  creditsLedger.push({ id: 'txn_' + Date.now(), userId: id, amount: +50, type: 'gift', note: '新用户注册赠送', createdAt: Date.now() });
  saveLedger();

  const token = signUserToken(user);
  res.status(201).json({
    token,
    user: { id, email, nickname: user.nickname, credits: user.credits, role: user.role }
  });
});

// ─── 用户登录 ─────────────────────────────────────────

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: '邮箱和密码不能为空' });

  const rl = checkRateLimit(`login:${email}`);
  if (rl.blocked) return res.status(429).json({ error: `登录尝试次数过多，请 ${rl.remaining} 分钟后再试` });

  const user = [...usersDB.values()].find(u => u.email === email);
  if (!user) { recordFailedAttempt(`login:${email}`); return res.status(401).json({ error: '邮箱或密码错误' }); }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) { recordFailedAttempt(`login:${email}`); return res.status(401).json({ error: '邮箱或密码错误' }); }

  clearAttempts(`login:${email}`);
  const token = signUserToken(user);
  res.json({
    token,
    user: { id: user.id, email: user.email, nickname: user.nickname, credits: user.credits, role: user.role }
  });
});

// ─── 获取当前用户信息 ──────────────────────────────────

router.get('/auth/me', authUser, (req, res) => {
  const user = usersDB.get(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ id: user.id, email: user.email, nickname: user.nickname, credits: user.credits, role: user.role });
});

// ─── 获取用户积分流水 ──────────────────────────────────

router.get('/user/credits/ledger', authUser, (req, res) => {
  const userLedger = creditsLedger
    .filter(t => t.userId === req.user.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  const user = usersDB.get(req.user.id);
  res.json({ credits: user?.credits || 0, ledger: userLedger });
});

// ─── 管理员登录（独立密码体系） ────────────────────────

router.post('/admin/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '账号和密码不能为空' });

  const rl = checkRateLimit(`admin:${username}`);
  if (rl.blocked) return res.status(429).json({ error: `登录尝试次数过多，请 ${rl.remaining} 分钟后再试` });

  const admin = [...adminsDB.values()].find(a => a.username === username);
  if (!admin) { recordFailedAttempt(`admin:${username}`); return res.status(401).json({ error: '账号或密码错误' }); }

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) { recordFailedAttempt(`admin:${username}`); return res.status(401).json({ error: '账号或密码错误' }); }

  clearAttempts(`admin:${username}`);
  const token = signAdminToken(admin);
  console.log(`[Auth] 管理员登录成功: ${username} [${new Date().toISOString()}]`);
  res.json({
    token,
    admin: { id: admin.id, username: admin.username, role: admin.role }
  });
});

// ─── 获取当前管理员信息 ────────────────────────────────

router.get('/admin/auth/me', authAdmin(), (req, res) => {
  const admin = adminsDB.get(req.admin.id);
  if (!admin) return res.status(404).json({ error: '管理员不存在' });
  res.json({ id: admin.id, username: admin.username, role: admin.role });
});

// ─── 管理员：查看所有用户 ──────────────────────────────

router.get('/admin/users', authAdmin('Operator'), (req, res) => {
  const users = [...usersDB.values()].map(u => ({
    id: u.id, email: u.email, nickname: u.nickname, credits: u.credits, createdAt: u.createdAt
  }));
  res.json({ users, total: users.length });
});

// ─── 管理员：调整用户积分（需 SuperAdmin） ─────────────

router.patch('/admin/users/:userId/credits', authAdmin('SuperAdmin'), (req, res) => {
  const { userId } = req.params;
  const { delta, note } = req.body;
  if (typeof delta !== 'number') return res.status(400).json({ error: 'delta 必须是数字' });

  const user = usersDB.get(userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  user.credits += delta;
  usersDB.set(userId, user);
  saveUsers();

  const txn = { id: 'txn_' + Date.now(), userId, amount: delta, type: delta > 0 ? 'admin_credit' : 'admin_debit', note: note || '管理员手动调整', operatorId: req.admin.id, createdAt: Date.now() };
  creditsLedger.push(txn);
  saveLedger();

  res.json({ success: true, newCredits: user.credits, txn });
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

router.post('/billing/recharge', authUser, (req, res) => {
  const user = usersDB.get(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const amount = 100; // 模拟固定充值包
  user.credits += amount;
  usersDB.set(user.id, user);
  saveUsers();

  const txnId = 'txn_' + Date.now();
  const txn = { id: txnId, userId: user.id, amount, type: 'recharge', note: '微信/支付宝充值', createdAt: Date.now() };
  creditsLedger.push(txn);
  saveLedger();

  // 创建同步订单记录
  const order = { id: 'ord_' + Date.now(), userId: user.id, amount: 9.9, credits: amount, status: 'paid', paymentMethod: 'WeChatPay', createdAt: Date.now() };
  ordersDB.push(order);
  saveOrders();

  res.json({ success: true, newCredits: user.credits, message: `成功充值 ${amount} 点数`, order });
});

router.post('/billing/watch-ad', authUser, (req, res) => {
  const user = usersDB.get(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const reward = 5; // 每次广告奖励 5 点
  user.credits += reward;
  usersDB.set(user.id, user);
  saveUsers();

  // 记录点数流水
  const txn = { id: 'txn_' + Date.now(), userId: user.id, amount: reward, type: 'ad_reward', note: '观看广告激励', createdAt: Date.now() };
  creditsLedger.push(txn);
  saveLedger();

  // 记录广告订单 (账目对齐与收益预估)
  const adOrder = {
    id: 'ord_ad_' + Date.now(),
    userId: user.id,
    amount: 0, // 用户实付
    credits: reward,
    status: 'paid',
    paymentMethod: 'AdReward',
    estimatedRevenue: 0.8, // 管理侧预估收益 (¥0.8/次)
    createdAt: Date.now()
  };
  ordersDB.push(adOrder);
  saveOrders();

  console.log('[DEBUG] WATCH-AD SUCCESS: userId=%s, reward=%d, orderId=%s', user.id, reward, adOrder.id);
  res.json({ success: true, newCredits: user.credits, message: `观看完成，获得 ${reward} 点数奖励` });
});

// ─── 新增：订单系统 ──────────────────────────────────────

router.get('/user/orders', authUser, (req, res) => {
  const list = ordersDB.filter(o => o.userId === req.user.id).sort((a,b) => b.createdAt - a.createdAt);
  res.json({ orders: list });
});

router.get('/admin/orders', authAdmin('Operator'), (req, res) => {
  res.json({ orders: ordersDB.slice().sort((a,b) => b.createdAt - a.createdAt) });
});

router.patch('/admin/orders/:id', authAdmin('SuperAdmin'), (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const order = ordersDB.find(o => o.id === id);
  if (!order) return res.status(404).json({ error: '订单未找到' });
  order.status = status;
  saveOrders();
  res.json({ success: true });
});

// ─── 新增：发票系统 ──────────────────────────────────────

router.post('/user/invoices', authUser, (req, res) => {
  const { orderId, companyName, taxId, email } = req.body;
  if (!orderId || !companyName || !taxId) return res.status(400).json({ error: '信息不完整' });

  const order = ordersDB.find(o => o.id === orderId && o.userId === req.user.id);
  if (!order) return res.status(404).json({ error: '订单无效' });

  // 检查是否已开票
  const exists = invoicesDB.find(i => i.orderId === orderId);
  if (exists) return res.status(409).json({ error: '该订单已申请过发票' });

  const invoice = {
    id: 'inv_' + Date.now(),
    orderId,
    userId: req.user.id,
    amount: order.amount,
    companyName,
    taxId,
    email,
    status: 'pending',
    createdAt: Date.now()
  };
  invoicesDB.push(invoice);
  saveInvoices();
  res.json({ success: true, invoice });
});

router.get('/user/invoices', authUser, (req, res) => {
  const list = invoicesDB.filter(i => i.userId === req.user.id).sort((a,b) => b.createdAt - a.createdAt);
  res.json({ invoices: list });
});

router.get('/admin/invoices', authAdmin('Operator'), (req, res) => {
  res.json({ invoices: invoicesDB.slice().sort((a,b) => b.createdAt - a.createdAt) });
});

router.patch('/admin/invoices/:id', authAdmin('Operator'), (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const inv = invoicesDB.find(i => i.id === id);
  if (!inv) return res.status(404).json({ error: '发票记录未找到' });
  inv.status = status;
  saveInvoices();
  res.json({ success: true });
});

router.post('/admin/invoices/:id/upload', authAdmin('Operator'), upload.single('invoice'), (req, res) => {
  const { id } = req.params;
  const inv = invoicesDB.find(i => i.id === id);
  if (!inv) return res.status(404).json({ error: '发票记录未找到' });
  
  if (!req.file) return res.status(400).json({ error: '请选择文件上传' });
  
  inv.fileUrl = `/uploads/invoices/${req.file.filename}`;
  inv.status = 'sent';
  saveInvoices();
  res.json({ success: true, fileUrl: inv.fileUrl });
});

// ─── 新增：工单系统 ──────────────────────────────────────

router.post('/user/tickets', authUser, (req, res) => {
  const { subject, content } = req.body;
  if (!subject || !content) return res.status(400).json({ error: '基本信息缺失' });

  // 限制同时在线工单数
  const openCount = ticketsDB.filter(t => t.userId === req.user.id && t.status !== 'closed').length;
  if (openCount >= 3) {
    return res.status(429).json({ error: '您已有 3 个工单处理中，请先耐心等待客服回复或解决旧工单' });
  }

  const ticket = {
    id: 'tk_' + Date.now(),
    userId: req.user.id,
    subject,
    content,
    status: 'open',
    replies: [],
    createdAt: Date.now()
  };
  ticketsDB.push(ticket);
  saveTickets();
  res.json({ success: true, ticket });
});

router.get('/user/tickets', authUser, (req, res) => {
  const list = ticketsDB.filter(t => t.userId === req.user.id).sort((a,b) => b.createdAt - a.createdAt);
  res.json({ tickets: list });
});

router.post('/user/tickets/:id/reply', authUser, upload.single('attachment'), (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  const ticket = ticketsDB.find(t => t.id === id && t.userId === req.user.id);
  if (!ticket) return res.status(404).json({ error: '工单未找到' });

  const reply = { role: 'user', content, createdAt: Date.now() };
  if (req.file) {
    reply.attachment = `/uploads/tickets/${req.file.filename}`;
  }

  ticket.replies.push(reply);
  ticket.status = 'open'; // 重置为 open 待处理
  saveTickets();
  res.json({ success: true });
});

router.get('/admin/tickets', authAdmin('Operator'), (req, res) => {
  res.json({ tickets: ticketsDB.slice().sort((a,b) => b.createdAt - a.createdAt) });
});

router.post('/user/tickets/:id/close', authUser, (req, res) => {
  const { id } = req.params;
  const ticket = ticketsDB.find(t => t.id === id && t.userId === req.user.id);
  if (!ticket) return res.status(404).json({ error: '工单未找到' });

  ticket.status = 'closed';
  saveTickets();
  res.json({ success: true });
});

router.post('/admin/tickets/:id/reply', authAdmin('Operator'), upload.single('attachment'), (req, res) => {
  const { id } = req.params;
  const { content, status } = req.body;
  const ticket = ticketsDB.find(t => t.id === id);
  if (!ticket) return res.status(404).json({ error: '工单未找到' });

  const reply = { 
    role: 'admin', 
    content, 
    adminId: req.admin.id, 
    createdAt: Date.now() 
  };
  
  if (req.file) {
    reply.attachment = `/uploads/tickets/${req.file.filename}`;
  }

  ticket.replies.push(reply);
  if (status) ticket.status = status;
  else ticket.status = 'replied'; // 默认标记为已回复
  
  saveTickets();
  res.json({ success: true });
});

// 导出路由和中间件供其他路由使用
module.exports = { router, authUser, authAdmin, usersDB, creditsLedger, saveUsers, saveLedger, saveOrders, saveInvoices, saveTickets };
