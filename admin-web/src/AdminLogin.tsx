import { useState } from 'react';
import { API_BASE } from './apiConfig';

interface AdminLoginProps {
  onLogin: (token: string, admin: { username: string; role: string }) => void;
}

const AdminLogin = ({ onLogin }: AdminLoginProps) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '登录失败');
        return;
      }
      localStorage.setItem('admin_token', data.token);
      localStorage.setItem('admin_info', JSON.stringify(data.admin));
      onLogin(data.token, data.admin);
    } catch {
      setError('无法连接到后端服务，请确认 api-server 已启动 (port 3000)');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', width: '100vw',
      background: 'radial-gradient(ellipse at 30% 40%, rgba(139,92,246,0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(244,114,182,0.1) 0%, transparent 60%), #070b14',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{ width: '400px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #f472b6, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.4rem' }}>
            WINSPACETIME
          </div>
          <div style={{ color: '#64748b', fontSize: '0.9rem' }}>内部运营管理系统 · 仅限授权员工访问</div>
        </div>

        {/* Login Card */}
        <div className="glass-panel" style={{ padding: '2.5rem', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 style={{ margin: '0 0 1.8rem', fontSize: '1.2rem', fontWeight: 700 }}>管理员登录</h2>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.4rem' }}>账号</label>
              <input
                id="admin-username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="输入管理员账号"
                required
                autoFocus
                style={{ width: '100%', background: '#0f172a', border: '1px solid #1e293b', color: '#fff', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.4rem' }}>密码</label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="输入密码"
                required
                style={{ width: '100%', background: '#0f172a', border: '1px solid #1e293b', color: '#fff', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>

            {error && (
              <div style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', padding: '0.7rem 1rem', borderRadius: '6px', color: '#f43f5e', fontSize: '0.85rem' }}>
                ⚠️ {error}
              </div>
            )}

            <button
              id="admin-login-btn"
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: '0.85rem', background: loading ? '#334155' : 'var(--btn-gradient)', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 700, fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer', marginTop: '0.5rem', transition: 'opacity 0.2s' }}
            >
              {loading ? '验证中...' : '登录后管系统'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', color: '#334155', fontSize: '0.75rem' }}>
          此入口不对外开放 · 登录行为将被记录
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
