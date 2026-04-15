import { useState, useEffect, useRef } from 'react';

interface AuthModalProps {
  onClose: () => void;
  onSuccess: (token: string, user: any) => void;
}

const AuthModal = ({ onClose, onSuccess }: AuthModalProps) => {
  const [method, setMethod] = useState<'email' | 'phone' | 'wechat'>('email');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 邮箱登录状态
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');

  // 手机登录状态
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [countdown, setCountdown] = useState(0);

  // 微信登录状态
  const [wechatQr, setWechatQr] = useState('');
  const [sceneId, setSceneId] = useState('');
  const pollTimer = useRef<any>(null);

  // 处理邮箱注册登录
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    const payload = isLogin ? { email, password } : { email, password, nickname };
    try {
      const res = await fetch(`http://localhost:3000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失败');
      onSuccess(data.token, data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 发送验证码
  const sendCode = async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) return setError('请输入正确的手机号');
    setLoading(true);
    try {
      await fetch('http://localhost:3000/api/auth/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      setCountdown(60);
      setError('');
    } catch {
      setError('发送失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3000/api/auth/sms/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: smsCode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '验证码错误');
      onSuccess(data.token, data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 微信扫码逻辑
  const startWechatAuth = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/auth/wechat/qrcode');
      const data = await res.json();
      setWechatQr(data.qrUrl);
      setSceneId(data.sceneId);
      
      // 开始轮询
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = setInterval(async () => {
        const checkRes = await fetch(`http://localhost:3000/api/auth/wechat/check?sceneId=${data.sceneId}`);
        const checkData = await checkRes.json();
        if (checkData.status === 'success') {
          clearInterval(pollTimer.current);
          onSuccess(checkData.token, checkData.user);
        }
      }, 2000);
    } catch {
      setError('获取二维码失败');
    }
  };

  useEffect(() => {
    if (method === 'wechat') startWechatAuth();
    else if (pollTimer.current) clearInterval(pollTimer.current);
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [method]);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      animation: 'fadeIn 0.3s ease'
    }}>
      <div className="glass-panel" style={{ width: '420px', padding: '2.5rem', position: 'relative', border: '1px solid rgba(255,255,255,0.1)' }}>
        <button 
          onClick={onClose}
          style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: '#64748b', fontSize: '1.2rem', cursor: 'pointer' }}
        >
          ✕
        </button>

        <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.8rem' }}>
          {['email', 'phone', 'wechat'].map((m: any) => (
             <span 
               key={m}
               onClick={() => { setMethod(m); setError(''); }}
               style={{ 
                 cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
                 color: method === m ? 'var(--accent-primary)' : '#64748b',
                 position: 'relative'
               }}
             >
               {m === 'email' ? '邮箱登录' : m === 'phone' ? '手机端' : '微信扫码'}
               {method === m && <div style={{ position: 'absolute', bottom: '-0.8rem', left: 0, right: 0, height: '2px', background: 'var(--accent-primary)' }}></div>}
             </span>
          ))}
        </div>

        {method === 'email' && (
           <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
             <h3 style={{ margin: 0 }}>{isLogin ? '邮箱登录' : '邮箱注册'}</h3>
             {!isLogin && (
               <input
                 type="text" value={nickname} onChange={e => setNickname(e.target.value)}
                 placeholder="昵称 (可选)" className="input-field"
               />
             )}
             <input
               type="email" required value={email} onChange={e => setEmail(e.target.value)}
               placeholder="example@email.com" className="input-field"
             />
             <input
               type="password" required value={password} onChange={e => setPassword(e.target.value)}
               placeholder="请输入密码" minLength={6} className="input-field"
             />
             <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', padding: '0.8rem' }}>
               {loading ? '处理中...' : (isLogin ? '登录' : '注册')}
             </button>
             <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8' }}>
               {isLogin ? '没有账号？' : '已有账号？'}
               <span onClick={() => setIsLogin(!isLogin)} style={{ color: 'var(--accent-primary)', cursor: 'pointer', marginLeft: '0.4rem' }}>
                 {isLogin ? '去注册' : '去登录'}
               </span>
             </div>
           </form>
        )}

        {method === 'phone' && (
          <form onSubmit={handlePhoneSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <h3 style={{ margin: 0 }}>手机号快速登录</h3>
            <input
              type="tel" required value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="请输入手机号" className="input-field"
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text" required value={smsCode} onChange={e => setSmsCode(e.target.value)}
                placeholder="验证码" className="input-field" style={{ flex: 1 }}
              />
              <button 
                type="button" disabled={loading || countdown > 0} 
                onClick={sendCode}
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '8px', padding: '0 1rem', fontSize: '0.8rem', minWidth: '100px' }}
              >
                {countdown > 0 ? `${countdown}s` : '获取验证码'}
              </button>
            </div>
            <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', padding: '0.8rem' }}>
              登录 / 注册
            </button>
            <p style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'center' }}>未注册手机号验证后将自动创建账号</p>
          </form>
        )}

        {method === 'wechat' && (
           <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <h3 style={{ margin: '0 0 1.5rem 0' }}>微信扫码登录</h3>
              <div style={{ background: '#fff', padding: '1rem', borderRadius: '12px', display: 'inline-block', marginBottom: '1.5rem' }}>
                {wechatQr ? <img src={wechatQr} width={180} height={180} /> : <div style={{ width: 180, height: 180, background: '#f5f5f5' }}></div>}
              </div>
              <p style={{ fontSize: '0.9rem', color: '#94a3b8' }}>请使用微信扫描二维码安全登录</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                 <div className="dot-loading"></div>
                 <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary)' }}>等待扫码中...</span>
              </div>
           </div>
        )}

        {error && (
          <div style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', padding: '0.7rem', borderRadius: '6px', color: '#f43f5e', fontSize: '0.85rem', marginTop: '1rem' }}>
            ⚠️ {error}
          </div>
        )}
      </div>
      
      <style>{`
        .input-field {
          width: 100%; 
          background: rgba(0,0,0,0.3); 
          border: 1px solid #1e293b; 
          color: #fff; 
          padding: 0.8rem; 
          border-radius: 8px; 
          box-sizing: border-box;
          outline: none;
          transition: border-color 0.2s;
        }
        .input-field:focus { border-color: var(--accent-primary); }
        .dot-loading {
          width: 8px; height: 8px; border-radius: 50%; background: var(--accent-primary);
          animation: dot-pulse 1.5s infinite ease-in-out;
        }
        @keyframes dot-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
};

export default AuthModal;
