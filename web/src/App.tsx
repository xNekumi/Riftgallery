import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api } from './api';
import type { User } from './types';
import { DataProvider, useData } from './store';
import { Login } from './pages/Login';
import { Gallery } from './pages/Gallery';
import { Decks, DeckView } from './pages/Decks';
import { Wants } from './pages/Wants';
import { Booster } from './pages/Booster';
import { Settings } from './pages/Settings';

export function App() {
  const [status, setStatus] = useState<{ needsSetup: boolean; user: User | null } | null>(null);
  const [error, setError] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number>(undefined);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 3500);
  }, []);

  useEffect(() => {
    api
      .get<{ needsSetup: boolean; user: User | null }>('/auth/status')
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="center-screen">Cannot reach the server: {error}</div>;
  if (!status) return <div className="center-screen">Loading…</div>;

  const toastEl = toastMsg && (
    <div className="toast" role="status" onClick={() => setToastMsg(null)}>
      {toastMsg}
    </div>
  );

  if (!status.user) {
    return <Login needsSetup={status.needsSetup} onLogin={(user) => setStatus({ needsSetup: false, user })} />;
  }

  return (
    <BrowserRouter>
      <DataProvider user={status.user} toast={toast}>
        <Shell onLogout={() => setStatus({ needsSetup: false, user: null })} />
      </DataProvider>
      {toastEl}
    </BrowserRouter>
  );
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const { wants, decks } = useData();
  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    onLogout();
  };
  return (
    <>
      <header className="topbar">
        <NavLink to="/" className="logo">
          <img src="/favicon.svg" alt="" /> <span>RiftGallery</span>
        </NavLink>
        <nav>
          <NavLink to="/" end>
            <span className="nav-ico">▦</span>
            <span>Gallery</span>
          </NavLink>
          <NavLink to="/booster">
            <span className="nav-ico">✚</span>
            <span>Boosters</span>
          </NavLink>
          <NavLink to="/decks">
            <span className="nav-ico">▤</span>
            <span>Decks{decks.length ? ` (${decks.length})` : ''}</span>
          </NavLink>
          <NavLink to="/wants">
            <span className="nav-ico">♥</span>
            <span>Wants{wants.length ? ` (${wants.length})` : ''}</span>
          </NavLink>
          <NavLink to="/settings">
            <span className="nav-ico">⚙</span>
            <span>Settings</span>
          </NavLink>
        </nav>
        <button className="btn ghost small logout" onClick={logout}>
          Log out
        </button>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Gallery />} />
          <Route path="/booster" element={<Booster />} />
          <Route path="/decks" element={<Decks />} />
          <Route path="/decks/:id" element={<DeckView />} />
          <Route path="/wants" element={<Wants />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
