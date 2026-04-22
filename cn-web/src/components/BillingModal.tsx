import { useState } from 'react';
import { API_BASE } from '../apiConfig';

interface BillingModalProps {
  onClose: () => void;
  onRefresh: () => void;
  token: string | null;
}

const BillingModal = ({ onClose, onRefresh, token }: BillingModalProps) => {
  const [loading, setLoading] = useState(false);
  const [adLoading, setAdLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleRecharge = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/billing/recharge`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setSuccessMsg(`✅ ${data.message}`);
      onRefresh();
      setTimeout(onClose, 1500);
    } catch {
      alert('充值失败，请检查网络');
    } finally {
      setLoading(false);
    }
  };

  const handleWatchAd = async () => {
    if (!token) return;
    setAdLoading(true);
    // 模拟看广告 3 秒
    setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/billing/watch-ad`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        setSuccessMsg(`✅ ${data.message}`);
        onRefresh();
        setTimeout(() => {
          setSuccessMsg('');
          setAdLoading(false);
        }, 2000);
      } catch {
        alert('领取失败');
        setAdLoading(false);
      }
    }, 3000);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
      animation: 'fadeIn 0.3s ease'
    }}>
      <div className="glass-panel" style={{ width: '450px', padding: '2.5rem', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}>✕</button>
        
        <h2 style={{ margin: '0 0 1.5rem 0' }}>获取算力点数</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '12px' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent-primary)' }}>💎 快速充值包</h4>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>支付 ¥9.9 即可获得 100 种子积分</p>
            <button 
              onClick={handleRecharge}
              disabled={loading || adLoading}
              className="btn-primary" 
              style={{ width: '100%' }}
            >
              {loading ? '支付处理中...' : '立即充值 ¥9.9'}
            </button>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '12px' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#fbbf24' }}>📺 免费领取</h4>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>观看一段 15s 激励视频广告，免费领 5 点</p>
            <button 
              onClick={handleWatchAd}
              disabled={loading || adLoading}
              style={{ 
                width: '100%', padding: '0.8rem', borderRadius: '8px', 
                background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)',
                cursor: (loading || adLoading) ? 'not-allowed' : 'pointer'
              }}
            >
              {adLoading ? '正在观看广告 (3s)...' : '看视频领积分'}
            </button>
          </div>

          {successMsg && (
            <div style={{ textAlign: 'center', color: '#10b981', fontSize: '0.9rem', fontWeight: 600 }}>
              {successMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BillingModal;
