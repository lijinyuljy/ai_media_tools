import { useState, useEffect } from 'react';
import AdminLogin from './AdminLogin';
import { API_BASE } from './apiConfig';

// 定义模型供应商类型
interface ModelProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  type: 'vlm' | 'inpaint' | 'video' | 'general';
}

type TopTab = 'system' | 'finance' | 'customer';

const TOP_MENUS = [
  { id: 'system', label: '系统管理', icon: '⚙️' },
  { id: 'finance', label: '财务管理', icon: '💰' },
  { id: 'customer', label: '客户服务', icon: '🎧' }
];

const SIDE_MENUS = {
  system: [
    { id: 'workbench', label: '全站工作台', icon: '📊' },
    { id: 'sys-config', label: '功能配置与调度', icon: '🔧' }
  ],
  finance: [
    { id: 'fin-panel', label: '综合财务面板', icon: '📈' },
    { id: 'fin-orders', label: '订单流水中心', icon: '🧾' },
    { id: 'fin-suppliers', label: '供应商账单管理', icon: '🔌' }
  ],
  customer: [
    { id: 'svc-invoices', label: '电子发票申请', icon: '📑' },
    { id: 'svc-tickets', label: '客服工单工作台', icon: '🎧' }
  ]
};

const AdminDashboard = () => {
  const [topTab, setTopTab] = useState<TopTab>('system');
  const [sideTab, setSideTab] = useState<string>('workbench');

  const [gpuNodes, setGpuNodes] = useState(2);
  const [isScaling, setIsScaling] = useState(false);

  const getLocalDateString = (d: Date) => {
    const pad = (n: number) => n < 10 ? '0' + n : n;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // Default to start of current month
    return getLocalDateString(d);
  });
  const [endDate, setEndDate] = useState(() => getLocalDateString(new Date()));

  const [orderSearchQuery, setOrderSearchQuery] = useState('');

  // KPIs
  const [revenue, setRevenue] = useState(0);
  const [apiCost, setApiCost] = useState(4236.20);
  const [adRevenue, setAdRevenue] = useState(0);

  // System Prompt 编辑器
  const [systemPrompt, setSystemPrompt] = useState('');
  const [promptSaveStatus, setPromptSaveStatus] = useState('');

  // 模型库状态
  const [modelLibrary, setModelLibrary] = useState<ModelProvider[]>([
    { id: 'sys-vsr', name: '静态除水印引擎 (VSR)', baseUrl: 'Internal GPU Cluster', apiKey: 'system-auth', modelName: 'vsr-static-v1', type: 'inpaint' },
    { id: 'sys-propainter', name: '动态除水印引擎 (ProPainter)', baseUrl: 'Internal GPU Cluster', apiKey: 'system-auth', modelName: 'propainter-v2', type: 'video' },
    { id: 'ext-1', name: 'OpenAI 官方 (GPT-4o)', baseUrl: 'https://api.openai.com/v1', apiKey: '', modelName: 'gpt-4o', type: 'vlm' },
  ]);

  // 功能映射
  const [featureMappings, setFeatureMappings] = useState({
    vlm: 'ext-1',
    inpaint: 'sys-vsr',
    video: 'sys-propainter'
  });

  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempModel, setTempModel] = useState<Partial<ModelProvider>>({ type: 'vlm' });

  const [orders, setOrders] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const selectedTicket = tickets.find(t => t.id === selectedTicketId);
  const [replyText, setReplyText] = useState('');
  const [replyFile, setReplyFile] = useState<File | null>(null);

  const fetchBusinessData = async () => {
    const token = localStorage.getItem('admin_token');
    if (!token) return;
    const headers = { 'Authorization': `Bearer ${token}` };
    try {
      const [ordRes, invRes, tikRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/orders`, { headers }),
        fetch(`${API_BASE}/api/admin/invoices`, { headers }),
        fetch(`${API_BASE}/api/admin/tickets`, { headers })
      ]);
      const [ordData, invData, tikData] = await Promise.all([ordRes.json(), invRes.json(), tikRes.json()]);
      const rawOrders = ordData.orders || [];
      setOrders(rawOrders);
      setInvoices(invData.invoices || []);
      setTickets(tikData.tickets || []);
    } catch { /* fail silent */ }
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/admin/vlm-prompt`).then(r => r.json()).then(d => setSystemPrompt(d.prompt || '')).catch(() => { });
    fetch(`${API_BASE}/api/admin/model-library`).then(r => r.json()).then(d => { if (d.modelLibrary) setModelLibrary(d.modelLibrary); }).catch(() => { });
    fetch(`${API_BASE}/api/admin/feature-routing`).then(r => r.json()).then(d => { if (d.featureRouting) setFeatureMappings(d.featureRouting); }).catch(() => { });
    fetchBusinessData();
    const busInterval = setInterval(fetchBusinessData, 5000);
    return () => clearInterval(busInterval);
  }, []);

  // ---------------- 金融逻辑 ----------------
  const isWithinRange = (dateStr: string | number) => {
    const d = new Date(Number(dateStr)).getTime();
    const start = new Date(startDate + 'T00:00:00').getTime();
    const end = new Date(endDate + 'T23:59:59').getTime();
    return d >= start && d <= end;
  };

  const currentFilteredOrders = orders.filter(o => isWithinRange(o.createdAt));
  const currentFilteredInvoices = invoices.filter(i => isWithinRange(i.createdAt));
  const currentFilteredTickets = tickets.filter(t => isWithinRange(t.createdAt));
  
  // 重新核算当前筛选范围内的财务指标
  useEffect(() => {
    const totalPaid = currentFilteredOrders.filter((o:any) => o.paymentMethod !== 'AdReward').reduce((acc:number, o:any) => acc + (o.amount || 0), 0);
    const totalAd = currentFilteredOrders.filter((o:any) => o.paymentMethod === 'AdReward').reduce((acc:number, o:any) => acc + (o.estimatedRevenue || 0), 0);
    setRevenue(totalPaid + totalAd);
    setAdRevenue(totalAd);
    // 模拟成本随着时间区间变大而变多
    const days = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 3600 * 24) + 1;
    setApiCost(68.5 * days + rawOrdersToCost(currentFilteredOrders));
  }, [startDate, endDate, orders]);

  const rawOrdersToCost = (ords: any[]) => ords.length * 2.15; // 模拟每单成本

  const saveModelLibraryToBackend = async (newLib: ModelProvider[]) => {
    try {
      await fetch(`${API_BASE}/api/admin/model-library`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelLibrary: newLib })
      });
    } catch { /* silent */ }
  };

  const openEdit = (m: ModelProvider) => {
    setTempModel(m);
    setEditingId(m.id);
    setModalMode('edit');
  };

  const handleSave = () => {
    let newLib: ModelProvider[];
    if (modalMode === 'add') {
      const id = 'ext-' + Date.now();
      newLib = [...modelLibrary, { ...tempModel, id } as ModelProvider];
    } else {
      newLib = modelLibrary.map(m => m.id === editingId ? { ...m, ...tempModel } as ModelProvider : m);
    }
    setModelLibrary(newLib);
    saveModelLibraryToBackend(newLib);
    setModalMode(null);
    setTempModel({ type: 'vlm' });
  };

  const deleteModel = (id: string) => {
    if (id.startsWith('sys-')) return;
    const newLib = modelLibrary.filter(m => m.id !== id);
    setModelLibrary(newLib);
    saveModelLibraryToBackend(newLib);
  };

  const getStatus = (m: ModelProvider) => {
    if (m.id.startsWith('sys-')) return { label: '内核就绪', color: '#10b981' };
    return m.apiKey && m.apiKey.length > 5 ? { label: '已配置', color: '#10b981' } : { label: '待配置', color: '#64748b' };
  };

  const handleTopTabChange = (tab: TopTab) => {
    setTopTab(tab);
    setSideTab(SIDE_MENUS[tab][0].id);
  };

  const finalOrdersList = currentFilteredOrders.filter(o => 
    (orderSearchQuery ? o.id.includes(orderSearchQuery) || o.userId.includes(orderSearchQuery) : true)
  );

  // 通用时间选择器组件
  const DateRangeSelector = () => (
    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.4rem 0.8rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>统计周期:</span>
      <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '0.85rem', outline: 'none' }} />
      <span style={{ color: '#334155' }}>至</span>
      <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '0.85rem', outline: 'none' }} />
    </div>
  );

  return (
    <div className="animate-fade-in" style={{ padding: '2rem 3rem', color: '#fff', width: '100%', boxSizing: 'border-box' }}>

      {/* 头部控制栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #f472b6, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          WINSPACETIME <span style={{ fontWeight: 300, fontSize: '1.2rem', color: '#64748b', WebkitTextFillColor: '#64748b' }}>/ 后管调度中心</span>
        </h2>
        
        <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.4rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
          {TOP_MENUS.map(menu => (
            <button
              key={menu.id}
              onClick={() => handleTopTabChange(menu.id as TopTab)}
              style={{
                background: topTab === menu.id ? 'var(--accent-primary)' : 'transparent',
                color: topTab === menu.id ? '#fff' : '#94a3b8',
                border: 'none', padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, transition: '0.2s', display: 'flex', gap: '0.5rem', alignItems: 'center'
              }}
            >
              <span>{menu.icon}</span> {menu.label}
            </button>
          ))}
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', marginBottom: '2.5rem' }} />

      <div style={{ display: 'flex', gap: '2.5rem', alignItems: 'flex-start' }}>

        {/* Sidebar */}
        <div style={{ width: '260px', flexShrink: 0 }}>
          <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', position: 'sticky', top: '2rem' }}>
            <div style={{ padding: '0 0.5rem 0.5rem', fontSize: '0.8rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {TOP_MENUS.find(m => m.id === topTab)?.label}
            </div>
            {SIDE_MENUS[topTab].map(item => (
              <button
                key={item.id}
                onClick={() => setSideTab(item.id)}
                style={{
                  textAlign: 'left', padding: '1.1rem', borderRadius: '10px', border: 'none', cursor: 'pointer',
                  background: sideTab === item.id ? 'rgba(167,139,250,0.12)' : 'transparent',
                  color: sideTab === item.id ? '#a78bfa' : '#94a3b8', fontWeight: 600, transition: '0.2s', display: 'flex', gap: '1rem', 
                  borderRight: sideTab === item.id ? '4px solid var(--accent-primary)' : '4px solid transparent'
                }}
              >
                <span style={{ fontSize: '1.2rem' }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Actionable Content Area */}
        <div style={{ flex: 1, minHeight: '80vh' }}>

          {/* ======================= 1. 系统管理 ======================= */}
          {topTab === 'system' && sideTab === 'workbench' && (
            <div className="animate-slide-up">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '2.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  
                  {/* KPI Overview (Small inside workbench) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                     {[
                       { label: '实时节点水位', val: '87%', color: '#10b981' },
                       { label: '今日解析任务', val: orders.length * 3 + 124, color: '#fff' },
                       { label: '外部供应商链路', val: modelLibrary.length, color: '#a78bfa' }
                     ].map((kpi, i) => (
                       <div key={i} className="glass-panel" style={{ padding: '1.2rem', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.4rem' }}>{kpi.label}</div>
                          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: kpi.color }}>{kpi.val}</div>
                       </div>
                     ))}
                  </div>

                  <div className="glass-panel" style={{ padding: '1.8rem', background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(0,0,0,0.3) 100%)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                      <h3 style={{ margin: 0 }}>🛡️ 算力集群物理层状态</h3>
                      <div style={{ color: '#10b981', fontWeight: 700 }}>{gpuNodes} Active Nodes</div>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                      {modelLibrary.filter(m => m.id.startsWith('sys-')).map(sys => (
                        <div key={sys.id} style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <div style={{ fontWeight: 600 }}>{sys.name}</div>
                            <span style={{ fontSize: '0.7rem', color: '#10b981' }}>内核运行中</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        {[
                          { id: 'WS-NODE-01', gpu: 'A100 x 8', load: '72%', temp: '64°C', status: 'Healthy' },
                          { id: 'WS-NODE-02', gpu: 'H100 x 4', load: '45%', temp: '58°C', status: 'Healthy' },
                          { id: 'WS-NODE-03', gpu: 'RTX 4090 x 16', load: '89%', temp: '72°C', status: 'Healthy', bottleneck: true }
                        ].slice(0, gpuNodes).map(node => (
                          <div key={node.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.8rem 1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                              <div style={{ width: '8px', height: '8px', background: node.bottleneck ? '#fbbf24' : '#10b981', borderRadius: '50%' }}></div>
                              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{node.id}</div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{node.gpu}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem' }}>
                              <span>负载: <b>{node.load}</b></span>
                              <span>温度: <b>{node.temp}</b></span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: '1.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                      <h3 style={{ margin: 0 }}>🔌 外部算力供应商配置 (API 链路)</h3>
                      <button onClick={() => { setTempModel({ type: 'vlm' }); setModalMode('add'); }} className="btn-primary" style={{ padding: '0.5rem 1rem' }}>+ 接入网关</button>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                      <thead style={{ textAlign: 'left', color: '#64748b', borderBottom: '1px solid #1e293b' }}>
                        <tr><th style={{ paddingBottom: '0.8rem' }}>服务商</th><th>模型标号</th><th>链路状态</th><th>操作</th></tr>
                      </thead>
                      <tbody>
                        {modelLibrary.filter(m => !m.id.startsWith('sys-')).map(m => (
                          <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td style={{ padding: '1rem 0' }}>{m.name}</td>
                            <td><code>{m.modelName}</code></td>
                            <td><span style={{ color: getStatus(m).color }}>● {getStatus(m).label}</span></td>
                            <td>
                              <button onClick={() => openEdit(m)} style={{ color: 'var(--accent-primary)', background: 'transparent', border: 'none', cursor: 'pointer', marginRight: '1rem' }}>配置</button>
                              <button onClick={() => deleteModel(m.id)} style={{ color: '#f43f5e', background: 'transparent', border: 'none', cursor: 'pointer' }}>下线</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Right Cluster Control */}
                <div>
                   <div className="glass-panel" style={{ padding: '2rem', position: 'sticky', top: '2rem' }}>
                     <h3 style={{ margin: 0, marginBottom: '2rem' }}>⚡ 集群算力快控</h3>
                     <div style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '15px', marginBottom: '1.5rem', border: '1px solid rgba(255,255,255,0.03)' }}>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>资源水位监控</div>
                        <div style={{ height: '12px', background: '#1e293b', borderRadius: '6px', overflow: 'hidden' }}>
                           <div style={{ width: '87%', height: '100%', background: 'var(--btn-gradient)' }}></div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.75rem' }}>
                           <span>目前占用: 87%</span>
                           <span>空闲: 13%</span>
                        </div>
                     </div>
                     <button onClick={() => { setIsScaling(true); setTimeout(() => { setIsScaling(false); setGpuNodes(n => n + 1); }, 1500); }} style={{ width: '100%', padding: '1rem', background: 'var(--btn-gradient)', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>
                        {isScaling ? '算力资源划拨中...' : '🚀 紧急扩容 GPU 节点'}
                     </button>
                   </div>
                </div>
              </div>
            </div>
          )}

          {topTab === 'system' && sideTab === 'sys-config' && (
            <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
                 <h2 style={{ margin: 0 }}>🔧 功能调度与参数配置中心</h2>
                 <p style={{ margin: '0.5rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>管理业务应用与底层模型的路由映射，以及核心 AI 指令预设</p>
              </div>

              {/* Engine Mapping */}
              <div className="glass-panel" style={{ padding: '1.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                   <h3 style={{ margin: 0 }}>🎯 功能引擎分发调度表 (Engine Routing)</h3>
                   <button onClick={async () => {
                      try {
                        await fetch(`${API_BASE}/api/admin/feature-routing`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ featureRouting: featureMappings })
                        });
                        alert('✅ 全站引擎分发规则已同步下发');
                      } catch { alert('❌ 同步失败'); }
                   }} className="btn-primary" style={{ padding: '0.6rem 1.5rem' }}>发布全网调度规则</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                   {[
                     { key: 'vlm', label: 'AI 视觉反推提示词 (VLM) 节点' },
                     { key: 'inpaint', label: '静态除水印 (高级无损) 节点' },
                     { key: 'video', label: '动态除水印 (AI全息追踪) 节点' }
                   ].map(f => (
                     <div key={f.key} style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1rem', fontWeight: 700 }}>{f.label}</div>
                        <select 
                           value={featureMappings[f.key as keyof typeof featureMappings]}
                           onChange={e => setFeatureMappings({...featureMappings, [f.key]: e.target.value})}
                           style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid #334155', padding: '0.8rem', borderRadius: '8px', cursor: 'pointer' }}
                        >
                           {modelLibrary.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                     </div>
                   ))}
                </div>
              </div>

              {/* VLM System Prompt Area */}
              <div className="glass-panel" style={{ padding: '1.8rem', border: '1px solid rgba(167, 139, 250, 0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                   <h3 style={{ margin: 0 }}>✨ AI 提示词核心指令 (VLM 反推逻辑)</h3>
                   <button onClick={async () => {
                      setPromptSaveStatus('Saving...');
                      try {
                        await fetch(`${API_BASE}/api/admin/vlm-prompt`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ prompt: systemPrompt })
                        });
                        setPromptSaveStatus('✅ 已成功落盘持久化');
                        setTimeout(() => setPromptSaveStatus(''), 3000);
                      } catch { setPromptSaveStatus('❌ 保存失败'); }
                   }} className="btn-primary" style={{ padding: '0.6rem 1.2rem' }}>保存并下发 Prompt</button>
                </div>
                <textarea 
                   value={systemPrompt}
                   onChange={e => setSystemPrompt(e.target.value)}
                   style={{ 
                      width: '100%', height: '240px', background: 'rgba(0,0,0,0.3)', border: '1px solid #1e293b', 
                      borderRadius: '12px', padding: '1.5rem', color: '#e2e8f0', fontSize: '0.9rem', lineHeight: 1.6, 
                      fontFamily: 'monospace', outline: 'none', resize: 'vertical'
                   }}
                   placeholder="输入 System Message 指导模型进行视觉反推..."
                />
                {promptSaveStatus && <div style={{ marginTop: '0.8rem', fontSize: '0.8rem', color: '#10b981' }}>{promptSaveStatus}</div>}
              </div>
            </div>
          )}

          {/* ======================= 2. 财务管理 ======================= */}
          {topTab === 'finance' && sideTab === 'fin-panel' && (
            <div className="animate-slide-up">
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem', marginBottom: '2rem' }}>
                  <h2 style={{ margin: 0 }}>📈 综合财务诊断监控面板</h2>
                  <DateRangeSelector />
               </div>

               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem', marginBottom: '2.5rem' }}>
                  <div className="glass-panel" style={{ padding: '2.5rem', border: '1px solid rgba(16,185,129,0.3)', background: 'linear-gradient(180deg, rgba(16,185,129,0.05) 0%, transparent 100%)' }}>
                     <div style={{ color: '#10b981', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.8rem' }}>区间总收入 (Gross Revenue)</div>
                     <div style={{ fontSize: '2.8rem', fontWeight: 900 }}>¥{revenue.toFixed(2)}</div>
                     <div style={{ marginTop: '0.6rem', color: '#64748b', fontSize: '0.8rem' }}>实收: ¥{(revenue - adRevenue).toFixed(2)} | 广告预估: ¥{adRevenue.toFixed(2)}</div>
                  </div>
                  <div className="glass-panel" style={{ padding: '2.5rem', border: '1px solid rgba(244,63,94,0.3)', background: 'linear-gradient(180deg, rgba(244,63,94,0.05) 0%, transparent 100%)' }}>
                     <div style={{ color: '#f43f5e', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.8rem' }}>区间运营成本 (Operation Cost)</div>
                     <div style={{ fontSize: '2.8rem', fontWeight: 900 }}>¥{apiCost.toFixed(2)}</div>
                     <div style={{ marginTop: '0.6rem', color: '#64748b', fontSize: '0.8rem' }}>包含 API 授信与内部 GPU 负载折算</div>
                  </div>
                  <div className="glass-panel" style={{ padding: '2.5rem', border: '1px solid rgba(167,139,250,0.3)', background: 'linear-gradient(180deg, rgba(167,139,250,0.05) 0%, transparent 100%)' }}>
                     <div style={{ color: '#a78bfa', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.8rem' }}>区间净利润 (Net Profit)</div>
                     <div style={{ fontSize: '2.8rem', fontWeight: 900, color: (revenue - apiCost) >= 0 ? '#10b981' : '#f43f5e' }}>¥{(revenue - apiCost).toFixed(2)}</div>
                     <div style={{ marginTop: '0.6rem', color: '#64748b', fontSize: '0.8rem' }}>ROI: {apiCost > 0 ? ((revenue/apiCost)*100).toFixed(1) : 0}%</div>
                  </div>
               </div>
               
               <div className="glass-panel" style={{ padding: '2rem' }}>
                  <h3 style={{ margin: 0, marginBottom: '1.5rem' }}>📊 趋势监控可视化 (模拟)</h3>
                  <div style={{ height: '260px', background: 'rgba(255,255,255,0.01)', borderRadius: '12px', display: 'flex', alignItems: 'flex-end', gap: '5px', padding: '1rem' }}>
                     {Array.from({length: 30}).map((_, i) => (
                        <div key={i} style={{ flex: 1, background: 'var(--accent-primary)', opacity: 0.1 + (Math.random()*0.5), height: `${20 + Math.random()*70}%`, borderRadius: '4px 4px 0 0' }}></div>
                     ))}
                  </div>
                  <div style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.75rem', color: '#475569' }}>24小时流水趋势载入中...</div>
               </div>
            </div>
          )}

          {topTab === 'finance' && sideTab === 'fin-orders' && (
            <div className="glass-panel animate-slide-up" style={{ padding: '2rem' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1.2rem', marginBottom: '1.5rem' }}>
                  <div>
                    <h2 style={{ margin: 0 }}>🧾 用户订单明细审计中心</h2>
                    <p style={{ margin: '0.5rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>追踪每一笔算力发放与对应的收支节点</p>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                     <input type="text" placeholder="🔍 搜索订单 ID 或用户..." value={orderSearchQuery} onChange={e=>setOrderSearchQuery(e.target.value)} style={{ background: '#1e293b', border: '1px solid #334155', color: '#fff', padding: '0.6rem 1rem', borderRadius: '10px', width: '280px' }} />
                     <DateRangeSelector />
                  </div>
               </div>

               <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead style={{ color: '#64748b', borderBottom: '1px solid #1e293b', textAlign: 'left' }}>
                  <tr>
                    <th style={{ padding: '1.2rem 1rem' }}>订单唯一序列号</th>
                    <th>所属用户</th>
                    <th>财务影响 (Rev)</th>
                    <th>算力变动</th>
                    <th>支付源</th>
                    <th>入账时间</th>
                  </tr>
                </thead>
                <tbody>
                  {finalOrdersList.map(o => (
                    <tr key={o.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '1.2rem 1rem' }}><code style={{ color: '#a78bfa' }}>{o.id}</code></td>
                      <td><code style={{ fontSize: '0.8rem' }}>{o.userId}</code></td>
                      <td style={{ fontWeight: 800 }}>
                        {o.paymentMethod === 'AdReward' ? <span style={{ color: '#fbbf24' }}>¥{o.estimatedRevenue} (AD)</span> : `¥${o.amount}`}
                      </td>
                      <td style={{ color: '#10b981', fontWeight: 600 }}>+{o.credits} C</td>
                      <td>{o.paymentMethod === 'AdReward' ? '广告流量池' : o.paymentMethod}</td>
                      <td style={{ color: '#64748b' }}>{new Date(o.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                  {finalOrdersList.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '5rem', color: '#334155' }}>所选时段内无匹配流水记录</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {topTab === 'finance' && sideTab === 'fin-suppliers' && (
             <div className="glass-panel animate-slide-up" style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                   <h2 style={{ margin: 0 }}>🔌 供应商成本控制台</h2>
                   <DateRangeSelector />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
                   {[
                     { name: 'OpenAI / Microsoft Azure', type: 'VLM 授信额度', cost: '$ 1,245', status: '正常运行', color: '#10b981' },
                     { name: '阿里云 / GPU Cluster租赁', type: '硬件基础设施', cost: '¥ 32,500', status: '待结算', color: '#fbbf24' },
                     { name: 'Amazon S3 / Global CDN', type: '数据存储与下行', cost: '¥ 842', status: '正常运行', color: '#10b981' }
                   ].map((s, i) => (
                     <div key={i} style={{ background: 'rgba(255,255,255,0.02)', padding: '1.8rem', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                           <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{s.name}</div>
                           <span style={{ fontSize: '0.75rem', color: s.color }}>● {s.status}</span>
                        </div>
                        <div style={{ color: '#64748b', fontSize: '0.85rem' }}>项目: {s.type}</div>
                        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                           <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>待核销账单:</span>
                           <span style={{ fontSize: '1.8rem', fontWeight: 900, color: '#f43f5e' }}>{s.cost}</span>
                        </div>
                     </div>
                   ))}
                </div>
             </div>
          )}

          {/* ======================= 3. 客户服务 ======================= */}
          {topTab === 'customer' && sideTab === 'svc-invoices' && (
            <div className="glass-panel animate-slide-up" style={{ padding: '2.5rem' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1.2rem', marginBottom: '2rem' }}>
                 <div>
                   <h2 style={{ margin: 0 }}>📑 电子发票代开及柜台</h2>
                   <p style={{ margin: '0.5rem 0 0', color: '#64748b', fontSize: '0.95rem' }}>处理用户提起的高级增值税电子发票申请，上传即分发</p>
                 </div>
                 <DateRangeSelector />
               </div>
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '2rem' }}>
                {currentFilteredInvoices.map(i => (
                  <div key={i.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '1.8rem', borderRadius: '18px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                      <span style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff' }}>¥{i.amount}</span>
                      <span style={{ padding: '0.3rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem', background: i.status === 'sent' ? 'rgba(100,116,139,0.1)' : 'rgba(251,191,36,0.1)', color: i.status === 'sent' ? '#64748b' : '#fbbf24', fontWeight: 700 }}>
                        {i.status === 'sent' ? '已处理' : '等待开具'}
                      </span>
                    </div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>{i.companyName}</div>
                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.8rem' }}>税号: {i.taxId}</div>
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>邮箱: {i.email}</div>
                    
                    {i.fileUrl ? (
                      <div style={{ marginTop: '1.5rem', padding: '0.8rem', background: 'rgba(16,185,129,0.08)', color: '#10b981', borderRadius: '10px', textAlign: 'center', fontSize: '0.9rem', border: '1px solid rgba(16,185,129,0.2)' }}>
                        已送达: <a href={`${API_BASE}${i.fileUrl}`} target="_blank" rel="noreferrer" style={{ color: '#10b981', fontWeight: 700 }}>预览凭证</a>
                      </div>
                    ) : (
                      <div style={{ marginTop: '1.5rem' }}>
                         <label className="btn-primary" style={{ display: 'block', textAlign: 'center', cursor: 'pointer', padding: '0.8rem', borderRadius: '10px' }}>
                            📤 上传发票并发送邮件
                            <input type="file" style={{ display: 'none' }} onChange={async e => {
                               const file = e.target.files?.[0]; if(!file) return;
                               const formData = new FormData(); formData.append('invoice', file);
                               const token = localStorage.getItem('admin_token');
                               await fetch(`${API_BASE}/api/admin/invoices/${i.id}/upload`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
                               fetchBusinessData();
                            }} />
                         </label>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {topTab === 'customer' && sideTab === 'svc-tickets' && (
            <div className="glass-panel animate-slide-up" style={{ padding: '2rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <div>
                   <h2 style={{ margin: 0 }}>🎧 客服工单深度管理中台</h2>
                   <p style={{ margin: '0.5rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>全周期响应用户反馈，确保服务一致性</p>
                </div>
                <DateRangeSelector />
              </div>
              <div style={{ display: 'flex', gap: '2.5rem', flex: 1, minHeight: '600px' }}>
                <div style={{ width: '360px', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', paddingRight: '0.5rem' }}>
                  {currentFilteredTickets.map(t => (
                    <div 
                      key={t.id} onClick={() => setSelectedTicketId(t.id)}
                      style={{ 
                        padding: '1.3rem', borderRadius: '15px', background: selectedTicket?.id === t.id ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.02)', 
                        border: selectedTicket?.id === t.id ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.05)', 
                        cursor: 'pointer', transition: '0.2s' 
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>{t.subject}</div>
                        <span style={{ 
                           fontSize: '0.7rem', padding: '0.1rem 0.5rem', borderRadius: '4px',
                           background: t.status === 'closed' ? 'rgba(100,116,139,0.15)' : (t.status === 'replied' ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)'),
                           color: t.status === 'closed' ? '#64748b' : (t.status === 'replied' ? '#10b981' : '#f43f5e'),
                           fontWeight: 800
                        }}>{t.status === 'closed' ? '已收档' : (t.status === 'replied' ? '已回执' : '待介入')}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.8rem' }}>用户 UID: {t.userId.slice(-8)} · {new Date(t.createdAt).toLocaleDateString()}</div>
                    </div>
                  ))}
                </div>
                
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)', padding: '2rem', maxHeight: '750px', overflow: 'hidden' }}>
                    {selectedTicket ? (
                       <>
                          {selectedTicket.status !== 'closed' ? (
                             <div style={{ marginBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1.5rem' }}>
                                <textarea 
                                   value={replyText} onChange={e => setReplyText(e.target.value)} 
                                   placeholder="输入您的官方回复内容..."
                                   style={{ width: '100%', height: '80px', background: 'rgba(255,255,255,0.01)', border: '1px solid #1e293b', borderRadius: '12px', color: '#fff', padding: '1rem', outline: 'none' }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem', alignItems: 'center' }}>
                                   <label className="btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', background: replyFile ? '#10b981' : '#1e293b', border: '1px solid #334155', cursor: 'pointer' }}>
                                      {replyFile ? `✅ ${replyFile.name.slice(0, 15)}...` : '📎 选中附件'}
                                      <input type="file" style={{ display: 'none' }} onChange={e => setReplyFile(e.target.files?.[0] || null)} />
                                   </label>
                                   <button onClick={async () => {
                                      if (!replyText && !replyFile) return;
                                      const token = localStorage.getItem('admin_token');
                                      const formData = new FormData();
                                      formData.append('content', replyText);
                                      if (replyFile) formData.append('attachment', replyFile);

                                      try {
                                        const res = await fetch(`${API_BASE}/api/admin/tickets/${selectedTicket.id}/reply?type=tickets`, { 
                                          method:'POST', 
                                          headers:{'Authorization':`Bearer ${token}`}, 
                                          body: formData
                                        });
                                        if (res.ok) {
                                          setReplyText(''); 
                                          setReplyFile(null);
                                          fetchBusinessData();
                                        }
                                      } catch (e) { console.error('Reply failed', e); }
                                   }} className="btn-primary" style={{ padding: '0.6rem 2rem' }}>正式发出回复</button>
                                </div>
                             </div>
                          ) : (
                             <div style={{ padding: '1rem', background: 'rgba(100,116,139,0.08)', borderRadius: '12px', color: '#94a3b8', textAlign: 'center', marginBottom: '2rem' }}>🔒 工单已收档，仅限查看历史记录。</div>
                          )}
                          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
                             <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                {[...selectedTicket.replies].reverse().map((r, idx) => (
                                   <div key={idx} style={{ background: r.role === 'admin' ? 'rgba(167,139,250,0.05)' : 'rgba(255,255,255,0.01)', padding: '1.5rem', borderRadius: '15px', borderLeft: `5px solid ${r.role === 'admin' ? '#a78bfa' : '#475569'}` }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem', fontSize: '0.75rem' }}>
                                         <span style={{ fontWeight: 800, color: r.role === 'admin' ? '#a78bfa' : '#94a3b8' }}>{r.role === 'admin' ? '官方人员回复' : '用户追加说明'}</span>
                                         <span style={{ color: '#475569' }}>{new Date(r.createdAt).toLocaleString()}</span>
                                      </div>
                                      <div style={{ fontSize: '0.95rem', lineHeight: 1.7 }}>{r.content}</div>
                                   </div>
                                ))}
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '15px', borderLeft: '5px solid #334155' }}>
                                   <div style={{ fontWeight: 800, color: '#64748b', fontSize: '0.75rem' }}>用户初始提问</div>
                                   <div style={{ marginTop: '1rem' }}>{selectedTicket.content}</div>
                                </div>
                             </div>
                          </div>
                       </>
                    ) : (
                       <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>请点击左侧工单，开启处理线程...</div>
                    )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* 弹窗部分 */}
      {modalMode && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(15px)' }}>
          <div className="glass-panel" style={{ padding: '3rem', width: '550px', border: '1px solid var(--accent-primary)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '2.5rem' }}>{modalMode === 'edit' ? '🛠️ 调整算力节点参数' : '🚀 录入全新 API 供应商'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <input value={tempModel.name || ''} placeholder="服务商名称 (Example: Anthropic)" onChange={e => setTempModel({ ...tempModel, name: e.target.value })} style={{ background: '#0f172a', border: '1px solid #1e293b', color: '#fff', padding: '1rem', borderRadius: '10px' }} />
              <input value={tempModel.baseUrl || ''} placeholder="网关地址 (Base URL)" onChange={e => setTempModel({ ...tempModel, baseUrl: e.target.value })} style={{ background: '#0f172a', border: '1px solid #1e293b', color: '#fff', padding: '1rem', borderRadius: '10px' }} />
              <input value={tempModel.modelName || ''} placeholder="模型标号 (Model Identifier)" onChange={e => setTempModel({ ...tempModel, modelName: e.target.value })} style={{ background: '#0f172a', border: '1px solid #1e293b', color: '#fff', padding: '1rem', borderRadius: '10px' }} />
              <input value={tempModel.apiKey || ''} type="password" placeholder="授权 API Key (加密存储)" onChange={e => setTempModel({ ...tempModel, apiKey: e.target.value })} style={{ background: '#0f172a', border: '1px solid #1e293b', color: '#fff', padding: '1rem', borderRadius: '10px' }} />
              <div style={{ display: 'flex', gap: '1.2rem', marginTop: '1.5rem' }}>
                <button onClick={() => setModalMode(null)} style={{ flex: 1, padding: '1rem', background: '#1e293b', border: 'none', color: '#fff', borderRadius: '10px', cursor: 'pointer' }}>取消</button>
                <button onClick={handleSave} style={{ flex: 1, padding: '1rem', background: 'var(--accent-primary)', border: 'none', color: '#fff', borderRadius: '10px', cursor: 'pointer', fontWeight: 800 }}>保存并生效</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .glass-panel { background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(20px); border-radius: 20px; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 12px 48px rgba(0,0,0,0.5); }
        .btn-primary { background: var(--btn-gradient); border: none; border-radius: 10px; color: #fff; font-weight: 800; cursor: pointer; transition: 0.3s; }
        .btn-primary:hover { filter: brightness(1.2); transform: translateY(-2px); }
        .input-field { background: rgba(255,255,255,0.01); border: 1px solid #1e293b; border-radius: 10px; color: #fff; padding: 0.8rem; outline: none; }
        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

const App = () => {
  const [adminToken, setAdminToken] = useState<string | null>(() => localStorage.getItem('admin_token'));
  const [adminInfo, setAdminInfo] = useState<{ username: string; role: string } | null>(() => { try { return JSON.parse(localStorage.getItem('admin_info') || 'null'); } catch { return null; } });
  const handleLogin = (token: string, admin: { username: string; role: string }) => { setAdminToken(token); setAdminInfo(admin); };
  const handleLogout = () => { localStorage.removeItem('admin_token'); localStorage.removeItem('admin_info'); setAdminToken(null); setAdminInfo(null); };
  if (!adminToken) return <AdminLogin onLogin={handleLogin} />;
  return (
    <div style={{ background: '#070b14', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '0.8rem 2.5rem', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1.2rem' }}>
        <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{adminInfo?.role} · <span style={{ color: '#a78bfa', fontWeight: 700 }}>{adminInfo?.username}</span></span>
        <button onClick={handleLogout} style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', padding: '0.4rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}>退出管理终端</button>
      </div>
      <AdminDashboard />
    </div>
  );
};

export default App;
