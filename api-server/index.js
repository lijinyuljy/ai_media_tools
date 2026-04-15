const express = require('express');
const cors = require('cors');
const multer = require('multer');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// 导入业务服务
const taskService = require('./services/TaskService');

dotenv.config();

// ===== 持久化配置文件 =====
const CONFIG_FILE = path.join(__dirname, 'config.json');
const TASKS_FILE = path.join(__dirname, 'tasks.json');

// 确保 uploads 目录存在
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
}

// ===== 持久化存储 (任务) =====
const tasksDB = new Map();
const saveTasks = () => {
    try {
        const data = Array.from(tasksDB.entries());
        fs.writeFileSync(TASKS_FILE, JSON.stringify(data, null, 2));
    } catch (e) { console.error('[DB] 任务数据保存失败:', e.message); }
};

// 加载初始任务
try {
    if (fs.existsSync(TASKS_FILE)) {
        const data = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
        data.forEach(([id, task]) => tasksDB.set(id, task));
        console.log('[DB] 已从 tasks.json 恢复', tasksDB.size, '个任务');
    }
    // 初始化任务服务
    taskService.setDatabase(tasksDB, saveTasks);
} catch (e) { console.error('[DB] 加载 tasks.json 失败:', e); }

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

// ===== 鉴权路由 & 数据库引用挂载 =====
const { router: authRouter, authUser, usersDB, creditsLedger, saveUsers, saveLedger } = require('./routes/auth');
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

// GET all Tasks (限当前登录用户)
app.get('/api/tasks', authUser, (req, res) => {
  const userId = req.user.id;
  const allTasks = Array.from(tasksDB.values())
    .filter(t => t.userId === userId)
    .sort((a,b) => b.createdAt - a.createdAt);
  res.json({ tasks: allTasks });
});

/**
 * FC Webhook 回调
 * 云函数处理完成后，通过此接口通知 API Server 更新结果
 */
app.post('/api/webhook/fc', async (req, res) => {
  const { taskId, status, resultUrl, error, progress } = req.body;
  console.log(`[Webhook] 收到 FC 回调: taskId=${taskId}, status=${status}`);
  
  const task = tasksDB.get(taskId);
  if (task) {
    if (status === 'completed') {
      task.status = 'completed';
      task.progress = 100;
      task.resultUrl = resultUrl;
    } else if (status === 'failed') {
      task.status = 'failed';
      task.error = error;
    } else {
      task.progress = progress || task.progress;
    }
    tasksDB.set(taskId, task);
    saveTasks();
  }
  
  res.json({ success: true });
});


// 路由：批量去水印 (已接入 TaskService 与 FC 调度)
app.post('/api/tasks/watermark/batch', authUser, upload.any(), async (req, res) => {
  try {
    const files = req.files;
    const body = req.body;
    const userId = req.user.id;
    const user = usersDB.get(userId);

    if (!user) return res.status(404).json({ error: '用户不存在' });
    
    let createdTasks = [];
    let totalCost = 0;

    // 1. 预检总计费
    let checkIndex = 0;
    while(body[`type_${checkIndex}`]) {
       const type = body[`type_${checkIndex}`];
       const engine = body[`engine_${checkIndex}`];
       totalCost += (type === 'video' ? (engine === 'dynamic' ? 25 : 5) : 1);
       checkIndex++;
    }

    if (user.credits < totalCost) {
       return res.status(402).json({ error: `积分不足 (需要 ${totalCost}, 当前 ${user.credits})`, required: totalCost, current: user.credits });
    }

    // 2. 执行扣款
    user.credits -= totalCost;
    usersDB.set(userId, user);
    saveUsers();
    creditsLedger.push({ id: 'txn_' + Date.now(), userId, amount: -totalCost, type: 'consume', note: `批量去水印任务 (${checkIndex}项)`, createdAt: Date.now() });
    saveLedger();

    // 3. 调度任务
    let index = 0;
    while(body[`type_${index}`]) {
       const file = files.find(f => f.fieldname === `media_${index}`);
       if (file) {
          const taskId = `task_${Date.now()}_${index}`;
          const type = body[`type_${index}`];
          const engine = body[`engine_${index}`];
          const cost = type === 'video' ? (engine === 'dynamic' ? 25 : 5) : 1;

          // 调用任务中心进行真实异步调度
          const newTask = await taskService.createWatermarkTask({
             taskId,
             userId,
             file,
             type,
             engine,
             cost
          });
          
          createdTasks.push(newTask);
       }
       index++;
    }

    res.json({
      success: true,
      tasks: createdTasks,
      message: `${createdTasks.length} 个任务已成功进入云处理队列`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to queue watermark task' });
  }
});

// Mock Async Queue Endpoint for Batch Prompt Extraction
app.post('/api/tasks/prompt/batch', authUser, upload.any(), async (req, res) => {
  try {
    const files = req.files;
    const body = req.body;
    const userId = req.user.id;
    const user = usersDB.get(userId);

    if (!user) return res.status(404).json({ error: '用户不存在' });

    let createdTasks = [];
    let index = 0;

    // 视频 VLM 可能计费更高，这里暂时统一 1 Credits/张
    const perTaskCost = 1;
    let totalCount = 0;
    while(body[`type_${index + totalCount}`]) { totalCount++; }

    const totalCost = totalCount * perTaskCost;
    if (user.credits < totalCost) {
       return res.status(402).json({ error: `积分不足 (需要 ${totalCost}, 当前 ${user.credits})` });
    }

    // 执行扣款
    user.credits -= totalCost;
    usersDB.set(userId, user);
    saveUsers();
    creditsLedger.push({ id: 'txn_' + Date.now(), userId, amount: -totalCost, type: 'consume', note: `批量AI反推任务 (${totalCount}项)`, createdAt: Date.now() });
    saveLedger();

    index = 0;
    while(body[`type_${index}`]) {
       const file = files.find(f => f.fieldname === `media_${index}`);
       if (file && file.originalname) {
          const taskId = `task_${Date.now()}_p${index}`;
          const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
          const cost = perTaskCost;

          const newTask = {
             taskId,
             userId, // 绑定用户 ID
             fileName: decodedName,
             originalUrl: `http://localhost:3000/uploads/${file.filename}`, // 保存公开静态链接
             type: 'prompt',
             status: 'queuing', 
             progress: 0,
             eta_seconds: 15,
             cost,
             createdAt: Date.now(),
             resultText: null 
          };
          
          tasksDB.set(taskId, newTask);
          createdTasks.push(newTask);
          saveTasks();
          
          // --- 动态 VLM 调用（读取管理台配置）---
          setTimeout(async () => {
              const t = tasksDB.get(taskId);
              if(t) { t.status = 'processing'; t.progress = 20; tasksDB.set(taskId, t); saveTasks(); }
              
              let finalPrompt = '';

              if (vlmConfig.apiKey && vlmConfig.apiKey.length > 5) {
                  const fs = require('fs');
                  const imageAsBase64 = fs.readFileSync(file.path, 'base64');
                  const endpoint = `${vlmConfig.baseUrl.replace(/\/$/, '')}/chat/completions`;
                  console.log(`[VLM] -> ${endpoint}, model=${vlmConfig.modelName}`);
                  try {
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
                                      { "type": "text", "text": "Please analyze this image and generate the output strictly following the system instructions provided." },
                                      { "type": "image_url", "image_url": { "url": `data:${file.mimetype};base64,${imageAsBase64}` } }
                                    ]
                                  }
                                ],
                                max_tokens: 1000
                            })
                        });
                            const data = await response.json();
                            console.log('[VLM] 响应片段:', JSON.stringify(data).slice(0, 300));
                            if (data.choices && data.choices[0]) {
                                let raw = data.choices[0].message.content.trim();
                                
                                // 移除 Markdown 代码块包裹 (如 ```json ... ```)
                                raw = raw.replace(/^```[a-z]*\n/i, '').replace(/\n```$/m, '').trim();

                                // 智能解析：如果内容看起来像 JSON，尝试美化；否则直接作为文本输出
                                try {
                                    if (raw.startsWith('{') && raw.endsWith('}')) {
                                        const parsed = JSON.parse(raw);
                                        // 兼容性逻辑：如果用户依然输出了包含 prompt 字段的简单 JSON，直接提取其内容
                                        if (parsed.prompt && Object.keys(parsed).length <= 3) {
                                            finalPrompt = parsed.prompt;
                                        } else {
                                            finalPrompt = JSON.stringify(parsed, null, 2);
                                        }
                                    } else {
                                        finalPrompt = raw;
                                    }
                                } catch {
                                    finalPrompt = raw;
                                }
                            } else {
                                finalPrompt = `模型返回异常:\n${JSON.stringify(data, null, 2)}`;
                            }
                        } catch (e) {
                            console.error('[VLM] 请求失败:', e);
                            finalPrompt = "API 请求失败: " + String(e);
                        }
              } else {
                  await new Promise(r => setTimeout(r, 2000));
                  finalPrompt = `⚠️ 未在管理后台配置有效的 API Key。\n请前往 后管调度中心 → 外部 API 提供商 → 编辑 → 填入密钥后点击"保存全局路由规则"。\n\n[Mock 结果] A visually stunning cinematic shot, intricate details, neon light volumetric rendering...`;
              }

              // Set completion status
              const ft = tasksDB.get(taskId);
              if(ft) { 
                 ft.status = 'completed'; 
                 ft.progress = 100; 
                 ft.resultText = finalPrompt;
                 tasksDB.set(taskId, ft); 
                 saveTasks();
              }
          }, 1500 + (index * 1000));
       }
       index++;
    }

    res.json({ success: true, tasks: createdTasks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to queue prompt task' });
  }
});

// Listen on port
app.listen(port, () => {
  console.log(`[CN API] Server running on http://localhost:${port}`);
});
