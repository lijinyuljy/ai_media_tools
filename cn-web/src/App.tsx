import { useState, useEffect } from 'react';
import './index.css';
import FabricMaskEditor from './components/FabricMaskEditor';
import PromptUploader from './components/PromptUploader';
import AuthModal from './components/AuthModal';
import BillingModal from './components/BillingModal';
import UserCenterModal from './components/UserCenterModal';

const API_BASE = '';

declare global {
  interface Window { refreshTasks: any; }
}

function App() {
  const [activeTab, setActiveTab] = useState<'watermark' | 'prompt'>('watermark');
  const [tasks, setTasks] = useState<any[]>([]);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('winspace_token'));
  const [user, setUser] = useState<any>(() => {
    try { return JSON.parse(localStorage.getItem('winspace_user') || 'null'); } catch { return null; }
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [showUserCenter, setShowUserCenter] = useState(false);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });

  const showToast = (message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 2000);
  };

  // 同步最新用户信息（包含余额）
  const refreshUserInfo = async (authToken: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        localStorage.setItem('winspace_user', JSON.stringify(data));
      } else if (res.status === 401) {
        handleLogout();
      }
    } catch {}
  };

  const fetchTasks = async () => {
      if (!token) {
        setTasks([]);
        return;
      }
      try {
          const res = await fetch(`${API_BASE}/api/tasks`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          setTasks(data.tasks || []);
          // 顺便刷新一下余额，确保提交后实时同步显示
          if (tasks.length > 0) refreshUserInfo(token);
      } catch (err) {}
  };

  const handleAuthSuccess = (newToken: string, newUser: any) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('winspace_token', newToken);
    localStorage.setItem('winspace_user', JSON.stringify(newUser));
    setShowAuthModal(false);
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('winspace_token');
    localStorage.removeItem('winspace_user');
  };

  useEffect(() => {
      if (token) {
        fetchTasks();
        refreshUserInfo(token);
      }
      window.refreshTasks = fetchTasks;
      const interval = setInterval(fetchTasks, 3000); 
      return () => clearInterval(interval);
  }, [token]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-color)', position: 'relative' }}>
      {showAuthModal && (
        <AuthModal 
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
        />
      )}

      {showBillingModal && (
        <BillingModal 
          token={token}
          onClose={() => setShowBillingModal(false)}
          onRefresh={() => token && refreshUserInfo(token)}
        />
      )}

      {showUserCenter && (
        <UserCenterModal 
          token={token}
          onClose={() => setShowUserCenter(false)}
        />
      )}

      <div className="animate-fade-in" style={{ padding: '3rem 2rem', maxWidth: '1000px', margin: '0 auto' }}>
      {/* 顶部导航栏 / Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem', padding: '0 1.5rem' }}>
        <h1 style={{ 
          background: 'linear-gradient(45deg, #f472b6, #a78bfa)', 
          WebkitBackgroundClip: 'text', 
          WebkitTextFillColor: 'transparent', 
          fontSize: '1.8rem', 
          fontWeight: 900,
          margin: 0,
          letterSpacing: '-1px'
        }}>
          winspacetime
        </h1>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          {user ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', background: 'var(--bg-surface)', padding: '0.4rem 1rem', borderRadius: '99px', border: '1px solid var(--accent-glow)' }}>
                <span 
                  onClick={() => setShowBillingModal(true)}
                  style={{ color: 'var(--accent-primary)', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  ⚡ {user.credits} <span style={{ fontSize: '0.7rem', opacity: 0.8, textDecoration: 'underline' }}>[获取]</span>
                </span>
                <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                <span 
                  onClick={() => setShowUserCenter(true)}
                  style={{ color: '#fff', fontSize: '0.9rem', cursor: 'pointer', borderBottom: '1px dashed rgba(255,255,255,0.2)' }}
                >
                  {user.nickname || (user.phone ? user.phone.slice(-4) : user.email.split('@')[0])}
                </span>
              </div>
              <button 
                onClick={handleLogout}
                style={{ background: 'transparent', border: '1px solid #334155', color: '#64748b', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                退出
              </button>
            </>
          ) : (
            <button 
              className="btn-primary" 
              onClick={() => setShowAuthModal(true)}
              style={{ padding: '0.6rem 1.5rem' }}
            >
              登录 / 注册
            </button>
          )}
        </div>
      </header>

      {/* 上半部分：核心工作区 (Workspace) */}
      <section className="glass-panel" style={{ padding: '2rem', textAlign: 'center', marginBottom: '3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '3rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
           <h2 
             style={{ margin: 0, cursor: 'pointer', color: activeTab === 'watermark' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
             onClick={() => setActiveTab('watermark')}
           >
             高级无损去水印
           </h2>
           <h2 
             style={{ margin: 0, cursor: 'pointer', color: activeTab === 'prompt' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
             onClick={() => setActiveTab('prompt')}
           >
             AI 视觉反推提示词
           </h2>
        </div>

        {/* 动态装载交互式画布区 */}
        {activeTab === 'watermark' ? (
           <FabricMaskEditor token={token} onMaskExtract={(coords) => console.log('截取到坐标：', coords)} />
        ) : (
           <PromptUploader token={token} />
        )}
      </section>

      {/* 下半部分：沉浸式卡片流任务队列 (Task Queue) */}
      <section>
        <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', color: 'var(--text-primary)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          历史生成任务列队
          <span style={{ background: 'var(--accent-glow)', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.8rem' }}>{tasks.length}</span>
        </h3>
        
        {/* 方块卡片网格布局 */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
          gap: '1.5rem' 
        }}>
          
          {tasks.map((task) => {
             // 针对反推完成的任务，采用上下完全分离的图文排版
             if (task.status === 'completed' && task.type === 'prompt' && task.result_text) {
                return (
                   <div key={task.taskId} className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column' }}>
                      {/* 上半部：原图缩略带放大入口 */}
                      <div style={{ width: '100%', height: '120px', background: '#1e293b', borderRadius: '8px', marginBottom: '1rem', backgroundImage: task.originalUrl ? `url(${API_BASE}${task.originalUrl})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative', overflow: 'hidden' }}>
                         {/* 底部暗角色渐变加深层，确保白色文字/按钮不论在什么图片上都高度清晰 */}
                         <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', background: 'linear-                          {task.originalUrl && (
                            <a href={`${API_BASE}${task.originalUrl}`} target="_blank" rel="noreferrer" 
                               style={{ 
                                   position: 'absolute', 
                                   bottom: '0.4rem', 
                                   right: '0.4rem', 
                                   background: 'rgba(255,255,255,0.15)', 
                                   backdropFilter: 'blur(8px)',
                                   color: '#fff', 
                                   textDecoration: 'none', 
                                   fontWeight: 'bold', 
                                   fontSize: '0.75rem',
                                   padding: '0.25rem 0.6rem',
                                   borderRadius: '12px',
                                   border: '1px solid rgba(255,255,255,0.3)',
                                   boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                                   display: 'flex',
                                   alignItems: 'center',
                                   gap: '0.3rem',
                                   transition: 'background 0.2s ease'
                               }}
                               onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                               onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                            >
                               🔍 展开原图
                            </a>
                         )}                             }}
                               onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                               onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                            >
                               🔍 展开原图
                            </a>
                         )}
                      </div>

                      {/* 标题栏 */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                         <span style={{ fontWeight: 600, fontSize: '0.9rem', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.fileName}</span>
                         <span style={{ color: '#10b981', fontSize: '0.75rem', border: '1px solid #10b981', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>完成</span>
                      </div>

                      {/* 文本渲染区 */}
                      <div style={{ background: 'rgba(0,0,0,0.4)', padding: '0.8rem', borderRadius: '6px', border: '1px dashed var(--border-color)', marginBottom: '1rem', flex: 1, minHeight: '80px', maxHeight: '120px', overflowY: 'auto' }}>
                         <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, wordBreak: 'break-word' }}>
                            {(() => {
                               try {
                                   const parsed = JSON.parse(task.result_text);
                                   return parsed.prompt || task.result_text;
                               } catch (e) {
                                   return task.result_text;
                               }
                            })()}
                         </p>
                      </div>

                      {/* 操作控制区 */}
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                        <button 
                           onClick={() => {
                              try {
                                  const parsed = JSON.parse(task.result_text);
                                  navigator.clipboard.writeText(parsed.prompt || task.result_text);
                              } catch (e) {
                                  navigator.clipboard.writeText(task.result_text);
                              }
                              showToast('✅ 提示词已成功复制到剪贴板！');
                           }}
                           style={{ flex: 1, background: 'var(--btn-gradient)', color: 'white', border: 'none', padding: '0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize:'0.85rem' }}>
                           📄 一键复制指令
                        </button>
                        <a href={`${API_BASE}${task.result_url}`} download target="_blank" rel="noreferrer" style={{ flex: 1, background: '#10b981', color: 'white', textDecoration: 'none', textAlign: 'center', padding: '0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize:'0.85rem' }}>
                           📦 下载结果
                        </a>
                      </div>
                   </div>
                );
             }

             // 常规排版 (排队中、常规图像/视频修补完成)
             return (
               <div key={task.taskId} className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', border: task.status === 'processing' ? '1px solid var(--accent-primary)' : '1px solid transparent' }}>
                  
                  {/* 预览图区域 */}
                  <div style={{ width: '100%', height: '160px', background: '#1e293b', borderRadius: '8px', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                     {task.status === 'completed' && task.result_url ? (
                        <img src={`${API_BASE}${task.result_url}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Result" />
                     ) : (
                        <div style={{ color: task.status === 'processing' ? 'var(--accent-primary)' : 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                           <span style={{ fontSize: '2rem', animation: task.status === 'processing' ? 'fadeIn 1s infinite alternate' : 'none' }}>
                              {task.type === 'video' ? '🎬' : '🖼️'}
                           </span>
                           <span>{task.status === 'queuing' ? '⏳ 队列排队中' : '⚡ 算力执行中'}</span>
                        </div>
                     )}
                     {task.status === 'processing' && (
                        <div style={{ position: 'absolute', bottom: 0, left: 0, height: '6px', background: 'var(--btn-gradient)', width: `${task.progress}%`, transition: 'width 0.5s ease' }}></div>
                     )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {task.fileName}
                    </span>
                    {task.status === 'completed' ? (
                      <span style={{ color: '#10b981', fontSize: '0.75rem', border: '1px solid #10b981', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>完成</span>
                    ) : task.status === 'processing' ? (
                      <span style={{ color: 'var(--accent-primary)', fontSize: '0.75rem', fontWeight: 'bold' }}>ETA: {Math.max(0, Math.floor(task.eta_seconds * (1 - task.progress/100)))}s</span>
                    ) : (
                      <span style={{ color: '#ec4899', fontSize: '0.75rem' }}>等待分发</span>
                    )}
                  </div>

                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '0.5rem' }}>
                     {task.engine === 'dynamic' ? '🚀 AI全息漂浮追踪引擎' : '常规无损节点'} (-{task.cost} C)
                  </span>

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                    {task.status === 'completed' ? (
                      <>
                        <button style={{ flex: 1, background: 'var(--btn-gradient)', color: 'white', border: 'none', padding: '0.5rem', borderRadius: '6px', cursor: 'pointer', fontSize:'0.85rem' }}>⬇️ 下载结果</button>
                        <button style={{ flex: 1, background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', padding: '0.5rem', borderRadius: '6px', cursor: 'pointer', fontSize:'0.85rem' }}>🔍 放大查看</button>
                      </>
                    ) : (
                      <button style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: '#666', border: 'none', padding: '0.5rem', borderRadius: '6px', cursor: 'not-allowed', fontSize:'0.85rem' }}>处理完可下载</button>
                    )}
                  </div>

               </div>
             );
          })}

        </div>
      </section>

      </div>
      {/* 全局 Toast 提示 */}
      <div className={`toast-container ${toast.visible ? 'visible' : ''}`}>
        {toast.message}
      </div>
    </div>
  )
}

export default App;
