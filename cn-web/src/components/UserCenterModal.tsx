import { useState, useEffect } from 'react';

interface UserCenterModalProps {
  onClose: () => void;
  token: string | null;
}

const UserCenterModal = ({ onClose, token }: UserCenterModalProps) => {
  const [activeTab, setActiveTab] = useState<'account' | 'orders' | 'invoices' | 'tickets'>('account');
  const [orders, setOrders] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [_loading, setLoading] = useState(false);
  const [showApplyInvoice, setShowApplyInvoice] = useState<string | null>(null); // orderId

  // 发票表单
  const [invoiceForm, setInvoiceForm] = useState({ companyName: '', taxId: '', email: '' });
  // 工单详情及回复
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const selectedTicket = tickets.find(t => t.id === selectedTicketId);
  const [ticketForm, setTicketForm] = useState({ subject: '', content: '' });
  const [supplementText, setSupplementText] = useState('');
  const [supplementFileStatus, setSupplementFileStatus] = useState<string | null>(null);

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [ordRes, invRes, tikRes] = await Promise.all([
        fetch('/api/user/orders', { headers }),
        fetch('/api/user/invoices', { headers }),
        fetch('/api/user/tickets', { headers })
      ]);
      const [ordData, invData, tikData] = await Promise.all([ordRes.json(), invRes.json(), tikRes.json()]);
      setOrders(ordData.orders || []);
      setInvoices(invData.invoices || []);
      setTickets(tikData.tickets || []);
    } catch (e) { console.error('Data fetch failed', e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [token]);

  const handleApplyInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !showApplyInvoice) return;
    try {
      const res = await fetch('/api/user/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orderId: showApplyInvoice, ...invoiceForm })
      });
      if (res.ok) {
        setShowApplyInvoice(null);
        fetchData();
        alert('申请成功，请耐心等待审核');
      } else {
        const d = await res.json();
        alert(d.error || '申请失败');
      }
    } catch { alert('网络错误'); }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !ticketForm.subject || !ticketForm.content) return;
    try {
      const res = await fetch('/api/user/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(ticketForm)
      });
      if (res.ok) {
        setTicketForm({ subject: '', content: '' });
        fetchData();
        alert('工单已提交');
      } else {
        const d = await res.json();
        alert(d.error || '提交失败');
      }
    } catch { alert('提交失败'); }
  };

  const handleCloseTicket = async (id: string) => {
    if(!confirm('确认该问题已解决并关闭工单吗？')) return;
    try {
        const res = await fetch(`/api/user/tickets/${id}/close`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            await fetchData();
            alert('工单已办结');
        }
    } catch (e) { console.error(e); }
  };

  const handleSupplement = async (id: string) => {
    if (!supplementText && !supplementFileStatus) return;
    const fileInput = document.getElementById(`user-file-${id}`) as HTMLInputElement;
    const formData = new FormData();
    formData.append('content', supplementText);
    if (fileInput?.files?.[0]) formData.append('attachment', fileInput.files[0]);

    try {
      const res = await fetch(`/api/user/tickets/${id}/reply?type=tickets`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        setSupplementText('');
        setSupplementFileStatus(null);
        if (fileInput) fileInput.value = '';
        fetchData();
      }
    } catch (e) { console.error(e); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, animation: 'fadeIn 0.4s ease'
    }}>
      <div className="glass-panel" style={{ width: '95vw', height: '90vh', maxWidth: '1400px', display: 'flex', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
        
        {/* 侧边导航 */}
        <div style={{ width: '220px', background: 'rgba(255,255,255,0.03)', borderRight: '1px solid rgba(255,255,255,0.05)', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1.2rem', margin: '0 0 2rem 0', color: '#fff' }}>用户中心</h2>
          {[
            { id: 'account', label: '账户概览', icon: '👤' },
            { id: 'orders', label: '订单历史', icon: '💳' },
            { id: 'invoices', label: '发票管理', icon: '📄' },
            { id: 'tickets', label: '技术支持', icon: '🛠️' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                textAlign: 'left', padding: '0.8rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: activeTab === tab.id ? 'var(--accent-primary)' : 'transparent',
                color: activeTab === tab.id ? '#fff' : '#64748b', fontSize: '0.9rem', transition: 'all 0.2s', display: 'flex', gap: '0.8rem'
              }}
            >
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
          <button onClick={onClose} style={{ marginTop: 'auto', background: 'transparent', border: '1px solid #334155', color: '#94a3b8', padding: '0.6rem', borderRadius: '8px', cursor: 'pointer' }}>返回工作台</button>
        </div>

        {/* 主内容区 */}
        <div style={{ flex: 1, padding: '2.5rem', overflowY: 'auto', background: 'rgba(0,0,0,0.2)' }}>
          {activeTab === 'account' && (
            <div className="animate-slide-up">
              <h3 style={{ margin: '0 0 2rem 0' }}>账户概览</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.5rem', borderRadius: '12px' }}>
                   <div style={{ color: '#64748b', fontSize: '0.8rem' }}>当前可用算力 (Credits)</div>
                   <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent-primary)', marginTop: '0.5rem' }}>⚡ 余额已同步</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.5rem', borderRadius: '12px' }}>
                   <div style={{ color: '#64748b', fontSize: '0.8rem' }}>会员等级</div>
                   <div style={{ fontSize: '1.2rem', fontWeight: 600, color: '#fff', marginTop: '0.5rem' }}>钻石级用户 (Mock)</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="animate-slide-up">
              <h3 style={{ margin: '0 0 2rem 0' }}>订单记录</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '1px solid #1e293b' }}>
                    <th style={{ padding: '0.8rem' }}>订单号</th>
                    <th>金额</th>
                    <th>点数</th>
                    <th>状态</th>
                    <th>时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '1rem 0.8rem' }}><code style={{ fontSize: '0.75rem' }}>{o.id}</code></td>
                      <td style={{ fontWeight: 600 }}>{o.paymentMethod === 'AdReward' ? <span style={{ color: '#64748b' }}>¥0.00</span> : `¥${o.amount}`}</td>
                      <td style={{ color: '#fbbf24' }}>+{o.credits || (o.amount * 10)}</td>
                      <td><span style={{ color: o.status === 'paid' ? '#10b981' : '#fbbf24' }}>{o.status === 'paid' ? '已支付' : o.status}</span></td>
                      <td style={{ color: '#64748b' }}>{new Date(o.createdAt).toLocaleDateString()}</td>
                      <td>
                         {o.paymentMethod !== 'AdReward' ? (
                            <button onClick={() => setShowApplyInvoice(o.id)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.8rem' }}>申请发票</button>
                         ) : (
                            <span style={{ color: '#64748b', fontSize: '0.8rem' }}>激励充值</span>
                         )}
                      </td>
                    </tr>
                  ))}
                  {orders.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: '#334155' }}>暂无订单记录</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'invoices' && (
            <div className="animate-slide-up">
              <h3 style={{ margin: '0 0 2rem 0' }}>发票进度</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {invoices.map(i => (
                  <div key={i.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '1.2rem', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{i.companyName}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.3rem' }}>税号: {i.taxId} | 金额: ¥{i.amount}</div>
                    </div>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {i.fileUrl && (
                           <a href={`${i.fileUrl}`} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: '#10b981', textDecoration: 'underline' }}>下载原件</a>
                        )}
                        <span style={{ 
                          padding: '0.3rem 0.8rem', borderRadius: '4px', fontSize: '0.8rem',
                          background: i.status === 'sent' ? 'rgba(16,185,129,0.1)' : 'rgba(251,191,36,0.1)',
                          color: i.status === 'sent' ? '#10b981' : '#fbbf24'
                        }}>
                          {i.status === 'sent' ? '已完成' : '待处理'}
                        </span>
                     </div>
                  </div>
                ))}
                {invoices.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: '#334155' }}>暂无开票申请</div>}
              </div>
            </div>
          )}

          {activeTab === 'tickets' && (
            <div className="animate-slide-up" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0 }}>🎧 技术支持工单</h3>
                <button onClick={() => fetchData()} style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', fontSize: '0.85rem', cursor: 'pointer' }}>刷新数据</button>
              </div>

              <div style={{ flex: 1, display: 'flex', gap: '1.5rem', overflow: 'hidden' }}>
                 {/* 左侧列表 */}
                 <div style={{ width: '300px', display: 'flex', flexDirection: 'column', gap: '0.8rem', overflowY: 'auto', paddingRight: '0.5rem' }}>
                    {/* 新增工单触发器 */}
                    <button 
                      onClick={() => setSelectedTicketId(null)}
                      style={{ 
                        padding: '1rem', borderRadius: '10px', border: '1px dashed #334155', background: selectedTicketId === null ? 'rgba(167,139,250,0.1)' : 'transparent',
                        color: selectedTicketId === null ? 'var(--accent-primary)' : '#94a3b8', cursor: 'pointer', textAlign: 'left', fontWeight: 600
                      }}
                    >
                      + 提交新工单
                    </button>
                    {tickets.map(t => (
                      <div 
                        key={t.id}
                        onClick={() => setSelectedTicketId(t.id)}
                        style={{ 
                          padding: '1rem', borderRadius: '10px', background: selectedTicketId === t.id ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                          border: selectedTicketId === t.id ? '1px solid var(--accent-primary)' : '1px solid transparent',
                          cursor: 'pointer', transition: '0.2s'
                        }}
                      >
                         <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>{t.subject}</div>
                         <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', alignItems: 'center' }}>
                            <span style={{ 
                               fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px',
                               background: t.status === 'closed' ? 'rgba(100,116,139,0.1)' : (t.status === 'replied' ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)'),
                               color: t.status === 'closed' ? '#64748b' : (t.status === 'replied' ? '#10b981' : '#f43f5e') 
                            }}>{t.status === 'closed' ? '已办结' : (t.status === 'replied' ? '已回复' : '待处理')}</span>
                            <span style={{ fontSize: '0.7rem', color: '#475569' }}>{new Date(t.createdAt).toLocaleDateString()}</span>
                         </div>
                      </div>
                    ))}
                 </div>

                 {/* 右侧工作区 */}
                 <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.05)', padding: '1.5rem', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {selectedTicketId === null ? (
                       <div style={{ flex: 1, overflowY: 'auto' }}>
                          <h4 style={{ marginTop: 0 }}>提交新咨询</h4>
                          {tickets.filter(t => t.status !== 'closed').length >= 3 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: '#fbbf24', background: 'rgba(251,191,36,0.05)', borderRadius: '12px', border: '1px solid rgba(251,191,36,0.1)' }}>
                               您已有 3 个处理中的工单，请先等待解决后再提新单。
                            </div>
                          ) : (
                            <form onSubmit={handleCreateTicket} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                               <input value={ticketForm.subject} onChange={e => setTicketForm({...ticketForm, subject: e.target.value})} placeholder="工单标题" className="input-field" required />
                               <textarea value={ticketForm.content} onChange={e => setTicketForm({...ticketForm, content: e.target.value})} placeholder="问题描述..." className="input-field" rows={8} required />
                               <button type="submit" className="btn-primary" style={{ padding: '1rem' }}>发布工单</button>
                            </form>
                          )}
                       </div>
                    ) : selectedTicket ? (
                       <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', paddingBottom: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                             <div style={{ fontWeight: 700 }}>{selectedTicket.subject}</div>
                             {selectedTicket.status !== 'closed' && (
                                <button type="button" onClick={() => handleCloseTicket(selectedTicket.id)} style={{ background: 'rgba(244,63,94,0.1)', color: '#f43f5e', border: 'none', padding: '0.4rem 1rem', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}>确认解决并结单</button>
                             )}
                          </div>

                          {/* 回复框 - 仅在未结单时显示 */}
                          {selectedTicket.status !== 'closed' ? (
                             <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '1.5rem', alignItems: 'flex-end', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '1.2rem' }}>
                                <div style={{ flex: 1 }}>
                                   <textarea 
                                      value={supplementText} 
                                      onChange={e => setSupplementText(e.target.value)} 
                                      placeholder="输入补充内容..." 
                                      className="input-field" 
                                      style={{ height: '60px', padding: '0.8rem' }}
                                   />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                   <label className="btn-primary" style={{ padding: '0.3rem 0.8rem', fontSize: '0.75rem', cursor: 'pointer', textAlign: 'center', background: supplementFileStatus ? '#10b981' : '#334155' }}>
                                      <span>{supplementFileStatus ? '✅ 已选' : '📎 附件'}</span>
                                      <input 
                                         id={`user-file-${selectedTicket.id}`}
                                         type="file" 
                                         style={{ display: 'none' }} 
                                         onChange={(e) => setSupplementFileStatus(e.target.files?.[0]?.name || null)} 
                                      />
                                   </label>
                                   <button onClick={() => handleSupplement(selectedTicket.id)} className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>发送追问</button>
                                </div>
                             </div>
                          ) : (
                             <div style={{ padding: '1rem', background: 'rgba(100,116,139,0.05)', borderRadius: '10px', color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', marginBottom: '1.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                                🔒 该工单已办结，无法继续追加内容。若有新问题请提交新工单。
                             </div>
                          )}

                          {/* 历史线索 (倒序) */}
                          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
                             <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                {[...selectedTicket.replies].reverse().map((r: any, idx: number) => (
                                   <div key={idx} style={{ borderLeft: `3px solid ${r.role === 'admin' ? 'var(--accent-primary)' : '#475569'}`, paddingLeft: '1rem', background: 'rgba(255,255,255,0.01)', padding: '1rem', borderRadius: '8px' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                         <span style={{ fontSize: '0.75rem', fontWeight: 800, color: r.role === 'admin' ? 'var(--accent-primary)' : '#94a3b8' }}>{r.role === 'admin' ? '官方回复' : '我的补充'}</span>
                                         <span style={{ fontSize: '0.7rem', color: '#475569' }}>{new Date(r.createdAt).toLocaleString()}</span>
                                      </div>
                                      <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#e2e8f0' }}>{r.content}</div>
                                      {r.attachment && (
                                         <div style={{ marginTop: '0.8rem' }}>
                                            <img src={`${r.attachment}`} alt="attachment" style={{ maxWidth: '100%', borderRadius: '4px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)' }} onClick={() => window.open(`${r.attachment}`)} />
                                         </div>
                                      )}
                                   </div>
                                ))}
                                <div style={{ borderLeft: '3px solid #334155', paddingLeft: '1rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px' }}>
                                   <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: '0.5rem' }}>发起描述</div>
                                   <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#CBD5E1' }}>{selectedTicket.content}</div>
                                   <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '0.5rem' }}>{new Date(selectedTicket.createdAt).toLocaleString()}</div>
                                </div>
                             </div>
                          </div>
                       </>
                    ) : null}
                 </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 扫码申请发票小弹窗 */}
      {showApplyInvoice && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300 }}>
          <div className="glass-panel" style={{ padding: '2rem', width: '380px' }}>
            <h3 style={{ marginTop: 0 }}>申请发票</h3>
            <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1.5rem' }}>订单: {showApplyInvoice}</p>
            <form onSubmit={handleApplyInvoice} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
               <input value={invoiceForm.companyName} onChange={e => setInvoiceForm({...invoiceForm, companyName: e.target.value})} placeholder="公司完整名称" className="input-field" required />
               <input value={invoiceForm.taxId} onChange={e => setInvoiceForm({...invoiceForm, taxId: e.target.value})} placeholder="纳税人识别号" className="input-field" required />
               <input type="email" value={invoiceForm.email} onChange={e => setInvoiceForm({...invoiceForm, email: e.target.value})} placeholder="接收邮箱" className="input-field" required />
               <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                 <button type="button" onClick={() => setShowApplyInvoice(null)} style={{ flex: 1, padding: '0.7rem', background: 'transparent', border: '1px solid #334155', color: '#fff', borderRadius: '8px' }}>取消</button>
                 <button type="submit" className="btn-primary" style={{ flex: 1 }}>提交申请</button>
               </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .input-field { width: 100%; background: rgba(0,0,0,0.3); border: 1px solid #1e293b; color: #fff; padding: 0.8rem; border-radius: 8px; box-sizing: border-box; outline: none; transition: border-color 0.2s; }
        .input-field:focus { border-color: var(--accent-primary); }
        .animate-slide-up { animation: slideUp 0.4s ease-out; }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default UserCenterModal;
