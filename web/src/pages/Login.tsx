import { useState } from 'react';
import { api } from '../api';
import type { User } from '../types';

type Mode = 'login' | 'register' | 'setup';

export function Login({ needsSetup, onLogin }: { needsSetup: boolean; onLogin: (u: User) => void }) {
  const params = new URLSearchParams(location.search);
  const initialInvite = params.get('invite') ?? '';
  const [mode, setMode] = useState<Mode>(needsSetup ? 'setup' : initialInvite || location.pathname === '/register' ? 'register' : 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [invite, setInvite] = useState(initialInvite);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode !== 'login' && password !== password2) return setError('The passwords do not match');
    setBusy(true);
    try {
      const res =
        mode === 'login'
          ? await api.post<{ user: User }>('/auth/login', { username, password })
          : await api.post<{ user: User }>('/auth/register', { username, password, inviteCode: invite });
      history.replaceState(null, '', '/');
      onLogin(res.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-box" onSubmit={submit}>
        <div className="logo big">
          <img src="/favicon.svg" alt="" /> RiftGallery
        </div>
        {mode === 'setup' && (
          <p className="muted">Welcome! Create the first account. It becomes the admin and can invite friends.</p>
        )}
        {mode === 'register' && <p className="muted">Create your account with the invite code you were given.</p>}
        <input autoFocus autoComplete="username" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <input
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={mode === 'login' ? undefined : 8}
        />
        {mode !== 'login' && (
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Repeat password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            required
          />
        )}
        {mode === 'register' && <input placeholder="Invite code" value={invite} onChange={(e) => setInvite(e.target.value)} required />}
        {error && <p className="error">{error}</p>}
        <button className="btn big" disabled={busy}>
          {mode === 'login' ? 'Log in' : 'Create account'}
        </button>
        {mode === 'login' && (
          <button type="button" className="link" onClick={() => setMode('register')}>
            I have an invite code
          </button>
        )}
        {mode === 'register' && (
          <button type="button" className="link" onClick={() => setMode('login')}>
            I already have an account
          </button>
        )}
      </form>
    </div>
  );
}
