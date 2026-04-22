require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// 捕捉全局未处理的异常，防止进程“无声死亡”
process.on('uncaughtException', (err) => {
  console.error('[FATAL ERROR] 💥 未捕获的异常:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL ERROR] 💥 未处理的 Promise 拒绝:', reason);
});

// 导入业务服务
const taskService = require('./services/TaskService');

const db = require('./lib/db');

// ===== 持久化配置文件 (管理员配置暂时保留 JSON，以便快速热更新) =====
const CONFIG_FILE = path.join(__dirname, 'config.json');

// 确保 uploads 目录存在
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
}

const DEFAULT_SYSTEM_PROMPT = `You are an elite AI art director and prompt engineer with deep expertise in Stable Diffusion, Midjourney, FLUX, and DALL-E prompt crafting.

Analyze the provided image with extreme precision and return ONLY a valid JSON object (no markdown, no prose) with the following structure:

{
  "prompt": "<full English prompt string for image generation, comma-separated tags>",
  "negative_prompt": "<what to avoid in regeneration>",
  "analysis": {
    "subject": "<main subject description>",
    "style": "<art style, medium, technique>",
    "lighting": "<lighting type and quality>",
    "mood": "<emotional tone and atmosphere>",
    "color_palette": "<dominant colors>",
    "composition": "<framing, angle, shot type>",
    "technical": "<camera, lens, quality tags like 8k, hyperrealistic, etc>"
  },
  "cfg_scale": <number 5-12>,
  "steps": <number 20-50>
}

Be exhaustive and technical. The prompt field must be ready to paste directly into any AI image generator.`;

const DEFAULT_CONFIG = {
  vlmConfig: {
    baseUrl: process.env.VLM_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.VLM_API_KEY || process.env.OPENAI_API_KEY || '',
    modelName: process.env.VLM_MODEL || 'gpt-4o',
  },
  vlmSystemPrompt: DEFAULT_SYSTEM_PROMPT,
  modelLibrary: [
    { id: 'sys-vsr', name: 'Video-subtitle-remover (VSR)', baseUrl: 'Internal GPU Cluster', apiKey: 'system-auth', modelName: 'vsr-static-v1', type: 'inpaint' },
    { id: 'sys-propainter', name: 'ProPainter (双流动态消除)', baseUrl: 'Internal GPU Cluster', apiKey: 'system-auth', modelName: 'propainter-v2', type: 'video' },
  ],
  featureRouting: {
    vlm: 'sys-vsr', // 初始默认，后续由管理员改为外部 API
    inpaint: 'sys-vsr',
    video: 'sys-propainter'
  }
};

// 读取或初始化配置文件
let savedConfig;
try {
  savedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  console.log('[Config] 已从 config.json 恢复配置');
} catch {
  savedConfig = DEFAULT_CONFIG;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(savedConfig, null, 2));
  console.log('[Config] 配置文件不存在，已初始化 config.json');
}

let vlmConfig = savedConfig.vlmConfig;
let vlmSystemPrompt = savedConfig.vlmSystemPrompt;
let modelLibrary = savedConfig.modelLibrary;
let featureRouting = savedConfig.featureRouting || DEFAULT_CONFIG.featureRouting;

const saveConfig = () => {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ vlmConfig, vlmSystemPrompt, modelLibrary, featureRouting }, null, 2));
  } catch (e) {
    console.error('[Config] 写入失败:', e.message);
  }
};

// 辅助：根据当前路由同步 VLM 配置
const syncVlmConfigFromRouting = () => {
  const vlmModelId = featureRouting.vlm;
  const provider = modelLibrary.find(m => m.id === vlmModelId);
  if (provider && provider.apiKey && provider.apiKey !== 'system-auth') {
    vlmConfig = {
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      modelName: provider.modelName
    };
    saveConfig();
    console.log(`[VLM Sync] 已根据路由同步配置: ${vlmConfig.modelName}`);
  }
};
syncVlmConfigFromRouting();

console.log(`[VLM] 当前配置: baseUrl=${vlmConfig.baseUrl}, model=${vlmConfig.modelName}, key=${vlmConfig.apiKey ? '已设置' : '⚠️ 未设置'}`);

const app = express();
const port = process.env.PORT || 3000;

// Config Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

const { router: authRouter, authUser } = require('./routes/auth');
app.use('/api', authRouter);

// Setup Multer for disk storage to statically serve back original user images
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, 'uploads/') },
  filename: function (req, file, cb) {
    const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, Date.now() + '-' + safeName);
  }
});
const upload = multer({ storage: storage });

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', region: 'cn' });
});

// Mock VLM Reverse Prompt Endpoint
app.post('/api/tasks/prompt', upload.single('image'), async (req, res) => {
  try {
    // Expected behavior: sending to VLM here. 
    // MOCK RESPONSE
    res.json({
        taskId: `t_${Date.now()}`,
        status: 'completed',
        data: {
          global_overview: {
             theme: "Cyberpunk neon portrait",
             medium: "Digital Photography",
             style: "Hyper-realistic",
             mood: "Edgy, futuristic"
          },
          composition_and_camera: {
             angle: "Eye-level",
             shot_type: "Medium close-up",
             lighting: "Neon rim lighting"
          }
        }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process prompt extraction' });
  }
});

/**
 * [TEST ONLY] 免密去水印测试接口
 * 直接传入一个视频 URL 触发 FC 流程，跳过登录和上传
 */
app.post('/api/test/watermark', async (req, res) => {
  const { inputUrl, taskId = `test_${Date.now()}` } = req.body;
  if (!inputUrl) return res.status(400).json({ error: '需要输入 inputUrl' });

  console.log(`[Test] 收到测试请求, taskId=${taskId}, url=${inputUrl}`);

  try {
    const functionName = 'watermark-remover';
    const payload = {
      taskId,
      inputUrl,
      type: 'clean',
      engine: 'vsr',
      callbackUrl: `${process.env.API_CALLBACK_URL}?token=${process.env.WEBHOOK_SECRET}`
    };

    console.log(`[Test] 正在触发云函数: ${functionName}`);
    await require('./lib/fc').invokeAsync(functionName, payload);
    
    res.json({
      success: true,
      message: '测试指令已发出，请观察终端日志中的 Webhook 回调',
      taskId
    });
  } catch (err) {
    console.error('[Test] 触发失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 管理台读取 / 保存功能路由
app.get('/api/admin/feature-routing', (req, res) => {
  res.json({ featureRouting });
});
app.post('/api/admin/feature-routing', (req, res) => {
  const { featureRouting: newRouting } = req.body;
  if (!newRouting || typeof newRouting !== 'object') return res.status(400).json({ error: '无效的路由配置' });
  
  featureRouting = { ...featureRouting, ...newRouting };
  saveConfig();
  
  // 关键：保存路由时，如果是 VLM 变了，需要同步 vlmConfig
  syncVlmConfigFromRouting();
  
  console.log('[Routing] 功能路由已更新并持久化');
  res.json({ success: true, featureRouting });
});

// 管理台读取 / 更新 System Prompt
app.get('/api/admin/vlm-prompt', (req, res) => {
  res.json({ prompt: vlmSystemPrompt });
});
app.post('/api/admin/vlm-prompt', (req, res) => {
  const { prompt } = req.body;
  if (!prompt || prompt.trim().length < 10) return res.status(400).json({ error: 'prompt 内容不能为空' });
  vlmSystemPrompt = prompt.trim();
  saveConfig();
  console.log('[VLM Prompt] 已更新并持久化');
  res.json({ success: true, length: vlmSystemPrompt.length });
});

// 管理台读取 / 保存模型库
app.get('/api/admin/model-library', (req, res) => {
  res.json({ modelLibrary });
});
app.post('/api/admin/model-library', (req, res) => {
  const { modelLibrary: newLib } = req.body;
  if (!Array.isArray(newLib)) return res.status(400).json({ error: 'modelLibrary 必须是数组' });
  modelLibrary = newLib;
  saveConfig();
  console.log('[ModelLib] 模型库已更新并持久化, 共', newLib.length, '项');
  res.json({ success: true, count: newLib.length });
});

// 管理台保存 VLM 配置（持久化）
app.post('/api/admin/vlm-config', (req, res) => {
  const { baseUrl, apiKey, modelName } = req.body;
  if (!baseUrl || !apiKey || !modelName) {
    return res.status(400).json({ error: 'baseUrl, apiKey, modelName 均为必填项' });
  }
  vlmConfig = { baseUrl, apiKey, modelName };
  saveConfig();
  console.log(`[VLM] 配置已更新并持久化: baseUrl=${baseUrl}, model=${modelName}`);
  res.json({ success: true, config: { baseUrl, modelName } });
});

// 管理台读取当前 VLM 配置（不返回 key 明文）
app.get('/api/admin/vlm-config', (req, res) => {
  res.json({ baseUrl: vlmConfig.baseUrl, modelName: vlmConfig.modelName, hasKey: !!vlmConfig.apiKey });
});

app.get('/api/tasks', authUser, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC', 
      [req.user.id]
    );
    res.json({ tasks: rows });
  } catch (err) {
    res.status(500).json({ error: '获取任务列表失败' });
  }
});

/**
 * FC Webhook 回调
 * 云函数处理完成后，通过此接口通知 API Server 更新结果
 */
app.post('/api/webhook/fc', async (req, res) => {
  const { taskId, status, resultUrl, error, progress } = req.body;
  const { token } = req.query;

  // 安全校验：令牌不匹配则拒绝处理
  if (!token || token !== process.env.WEBHOOK_SECRET) {
    console.warn(`[Webhook] ❌ 非法请求拦截: taskId=${taskId}, 来源IP=${req.ip}`);
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }

  console.log(`[Webhook] ✅ 收到合法的 FC 回调: taskId=${taskId}, status=${status}`);
  
  try {
    await taskService.updateTask(taskId, {
      status,
      resultUrl,
      error,
      progress: progress || (status === 'completed' ? 100 : undefined)
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Webhook 更新失败' });
  }
});


// 路由：批量去水印 (已接入 TaskService 与 FC 调度)
app.post('/api/tasks/watermark/batch', authUser, upload.any(), async (req, res) => {
  const client = await db.getClient();
  try {
    const files = req.files;
    const body = req.body;
    const userId = req.user.id;

    // 1. 预计算总计费
    let checkIndex = 0;
    let totalCost = 0;
    while(body[`type_${checkIndex}`]) {
       const type = body[`type_${checkIndex}`];
       const engine = body[`engine_${checkIndex}`];
       totalCost += (type === 'video' ? (engine === 'dynamic' ? 25 : 5) : 1);
       checkIndex++;
    }

    await client.query('BEGIN');

    // 2. 预检积分并执行事务扣款
    const { rows: userRows } = await client.query('SELECT credits FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const userCredits = userRows[0]?.credits || 0;

    if (userCredits < totalCost) {
       await client.query('ROLLBACK');
       return res.status(402).json({ error: `积分不足 (需要 ${totalCost}, 当前 ${userCredits})` });
    }

    await client.query('UPDATE users SET credits = credits - $1 WHERE id = $2', [totalCost, userId]);
    await client.query(
      'INSERT INTO ledger (id, user_id, amount, type, note, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      ['txn_' + Date.now(), userId, -totalCost, 'consume', `批量去水印任务 (${checkIndex}项)`, Date.now()]
    );

    await client.query('COMMIT');

    // 3. 调度任务 (TaskService 内部会进行数据库 INSERT)
    let createdTasks = [];
    let index = 0;
    while(body[`type_${index}`]) {
       const file = files.find(f => f.fieldname === `media_${index}`);
       if (file) {
          const taskId = `task_${Date.now()}_${index}`;
          const type = body[`type_${index}`];
          const engine = body[`engine_${index}`];
          const cost = type === 'video' ? (engine === 'dynamic' ? 25 : 5) : 1;

          const newTask = await taskService.createWatermarkTask({
             taskId, userId, file, type, engine, cost
          });
          createdTasks.push(newTask);
       }
       index++;
    }

    res.json({ success: true, tasks: createdTasks, message: `${createdTasks.length} 个任务已成功进入云处理队列` });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to queue watermark task' });
  } finally {
    if (client) client.release();
  }
});

// Mock Async Queue Endpoint for Batch Prompt Extraction
app.post('/api/tasks/prompt/batch', authUser, upload.any(), async (req, res) => {
  const client = await db.getClient();
  try {
    const files = req.files;
    const body = req.body;
    const userId = req.user.id;

    let index = 0;
    let totalCount = 0;
    while(body[`type_${index + totalCount}`]) { totalCount++; }

    const perTaskCost = 1;
    const totalCost = totalCount * perTaskCost;

    await client.query('BEGIN');
    const { rows: userRows } = await client.query('SELECT credits FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const currentCredits = userRows[0]?.credits || 0;

    if (currentCredits < totalCost) {
      await client.query('ROLLBACK');
      return res.status(402).json({ error: `积分不足 (需要 ${totalCost}, 当前 ${currentCredits})` });
    }

    await client.query('UPDATE users SET credits = credits - $1 WHERE id = $2', [totalCost, userId]);
    await client.query(
      'INSERT INTO ledger (id, user_id, amount, type, note, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      ['txn_' + Date.now(), userId, -totalCost, 'consume', `批量AI反推任务 (${totalCount}项)`, Date.now()]
    );
    await client.query('COMMIT');

    let createdTasks = [];
    index = 0;
    while(body[`type_${index}`]) {
       const file = files.find(f => f.fieldname === `media_${index}`);
       if (file && file.originalname) {
          const taskId = `task_${Date.now()}_p${index}`;
          const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');

          await db.query(
            'INSERT INTO tasks (task_id, user_id, file_name, type, status, progress, cost, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [taskId, userId, decodedName, 'prompt', 'queuing', 0, perTaskCost, Date.now()]
          );
          
          createdTasks.push({ taskId, status: 'queuing' });
          
          // --- 异步 VLM 调用流程 ---
          app._runVlmPromptLogic(taskId, file);
       }
       index++;
    }

    res.json({ success: true, tasks: createdTasks });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to queue prompt task' });
  } finally {
    if (client) client.release();
  }
});

// 辅助方法：处理 VLM 反推逻辑
app._runVlmPromptLogic = async (taskId, file) => {
    try {
        await taskService.updateTask(taskId, { status: 'processing', progress: 20 });
        
        let finalPrompt = '';
        if (vlmConfig.apiKey && vlmConfig.apiKey.length > 5) {
            try {
                const fs = require('fs');
                const imageAsBase64 = fs.readFileSync(file.path, 'base64');
                const endpoint = `${vlmConfig.baseUrl.replace(/\/$/, '')}/chat/completions`;
                const response = await fetch(endpoint, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${vlmConfig.apiKey}`
                    },
                    body: JSON.stringify({
                        model: vlmConfig.modelName,
                        messages: [
                            { "role": "system", "content": vlmSystemPrompt },
                            {
                                "role": "user",
                                "content": [
                                    { "type": "text", "text": "Please analyze this image and generate the output strictly following instructions." },
                                    { "type": "image_url", "image_url": { "url": `data:${file.mimetype};base64,${imageAsBase64}` } }
                                ]
                            }
                        ],
                        max_tokens: 1000
                    })
                });
                const data = await response.json();
                if (data.choices && data.choices[0]) {
                    finalPrompt = data.choices[0].message.content.trim().replace(/^```[a-z]*\n/i, '').replace(/\n```$/m, '').trim();
                } else {
                    finalPrompt = `ERROR: ${JSON.stringify(data)}`;
                }
            } catch (e) {
                finalPrompt = "API Request failed: " + String(e);
            }
        } else {
            finalPrompt = "⚠️ No API Key configured. [Mock Result] Cinematic shot of a futuristic city.";
        }

        await taskService.updateTask(taskId, { 
            status: 'completed', 
            progress: 100, 
            resultText: finalPrompt 
        });
    } catch (err) {
        console.error(`[VLM Error] task ${taskId}:`, err.message);
    }
};
// ===== 前端静态文件托管 =====
// Admin SPA: 挂载在 /admin/ 路径下
const adminDistPath = path.join(__dirname, '..', 'admin-web', 'dist');
if (fs.existsSync(adminDistPath)) {
  app.use('/admin', express.static(adminDistPath));
  // SPA fallback: 所有 /admin/* 非 API 路径都返回 index.html
  app.get('/admin/{*splat}', (req, res) => {
    res.sendFile(path.join(adminDistPath, 'index.html'));
  });
  console.log('[Static] ✅ Admin 前端已挂载: /admin/');
} else {
  console.warn('[Static] ⚠️ admin-web/dist 不存在，请先执行 npm run build');
}

// CN (用户端) SPA: 挂载在根路径 /
const cnDistPath = path.join(__dirname, '..', 'cn-web', 'dist');
if (fs.existsSync(cnDistPath)) {
  app.use(express.static(cnDistPath));
  // SPA fallback: 非 API 且非 admin 的所有路径返回用户端 index.html
  app.get('{*splat}', (req, res, next) => {
    // 排除 API 路由和 admin 路由
    if (req.path.startsWith('/api/') || req.path.startsWith('/admin') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(cnDistPath, 'index.html'));
  });
  console.log('[Static] ✅ 用户端前端已挂载: /');
} else {
  console.warn('[Static] ⚠️ cn-web/dist 不存在，请先执行 npm run build');
}

// Listen on port
app.listen(port, () => {
  console.log(`[CN API] Server running on http://localhost:${port}`);
});

// 强行保持 Node.js 事件循环活跃，防止在某些 WebShell 容器下因缺少常规 handle 而自动退出
process.stdin.resume();

