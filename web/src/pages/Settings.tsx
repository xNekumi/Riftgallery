import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useData } from '../store';
import type { User } from '../types';
import { LANGUAGE_NAMES, cardLabel } from '../lib/cards';

export function Settings() {
  const { user, setUser, toast, collection, cardById, syncedAt } = useData();
  return (
    <div className="page narrow">
      <h1>Settings</h1>
      <section className="panel form">
        <h2>Account</h2>
        <p>
          Logged in as <b>{user.username}</b>
          {user.isAdmin ? ' (admin)' : ''}
        </p>
        <label>
          Default language for new cards
          <select
            value={user.defaultLanguage}
            onChange={async (e) => {
              try {
                const res = await api.patch<{ user: User }>('/me', { defaultLanguage: e.target.value });
                setUser(res.user);
              } catch (err) {
                toast((err as Error).message);
              }
            }}
          >
            {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <PasswordForm />
      </section>

      <BackupSection
        onCsv={() => {
          const rows = [['code', 'name', 'set', 'rarity', 'finish', 'language', 'quantity']];
          for (const it of collection) {
            const c = cardById.get(it.cardId);
            if (c) rows.push([c.code, cardLabel(c), c.set, c.rarity, it.finish, it.language, String(it.qty)]);
          }
          rows.sort((a, b) => a[0].localeCompare(b[0]));
          const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
          download(new Blob([csv], { type: 'text/csv' }), `riftgallery-${user.username}.csv`);
        }}
      />

      {user.isAdmin && <AdminSection />}

      <p className="muted small">
        Card data from riftcodex.com, last updated {syncedAt ? new Date(syncedAt).toLocaleString() : 'never'}. RiftGallery is a fan
        project and not affiliated with Riot Games.
      </p>
    </div>
  );
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PasswordForm() {
  const { toast } = useData();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api.post('/me/password', { currentPassword: current, newPassword: next });
          setCurrent('');
          setNext('');
          toast('Password changed');
        } catch (err) {
          toast((err as Error).message);
        }
      }}
    >
      <h3>Change password</h3>
      <input type="password" autoComplete="current-password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      <input type="password" autoComplete="new-password" placeholder="New password (min. 8 characters)" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} />
      <button className="btn" disabled={!current || next.length < 8}>
        Change password
      </button>
    </form>
  );
}

function BackupSection({ onCsv }: { onCsv: () => void }) {
  const { toast, reload } = useData();
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');

  const exportJson = async () => {
    try {
      const data = await api.get<unknown>('/me/export');
      download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `riftgallery-backup-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (mode === 'replace' && !confirm('Replace your whole collection, want list and decks with this backup?')) return;
      const res = await api.post<{ stats: Record<string, number> }>('/me/import', { data, mode });
      await reload();
      toast(`Imported ${res.stats.collection} collection entries, ${res.stats.wants} wants, ${res.stats.decks} decks`);
    } catch (e) {
      toast(`Import failed: ${(e as Error).message}`);
    }
  };

  return (
    <section className="panel form">
      <h2>Backup</h2>
      <div className="row gap wrap">
        <button className="btn" onClick={exportJson}>
          Download backup (JSON)
        </button>
        <button className="btn ghost" onClick={onCsv}>
          Export collection as CSV
        </button>
      </div>
      <h3>Restore a backup</h3>
      <div className="row gap wrap">
        <select value={mode} onChange={(e) => setMode(e.target.value as 'merge' | 'replace')}>
          <option value="merge">Add to my current data</option>
          <option value="replace">Replace my current data</option>
        </select>
        <input type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
      </div>
    </section>
  );
}

interface Overview {
  users: { id: number; username: string; isAdmin: number; createdAt: string; cards: number }[];
  invites: { code: string; note: string; createdAt: string; usedAt: string | null; usedBy: string | null }[];
  sync: { running: boolean; phase: string; imagesDone: number; imagesTotal: number; lastError: string | null; lastSync: string | null };
}

function AdminSection() {
  const { toast, user, reload } = useData();
  const [data, setData] = useState<Overview | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api.get<Overview>('/admin/overview'));
    } catch (e) {
      toast((e as Error).message);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while a sync is running so progress is visible.
  useEffect(() => {
    if (!data?.sync.running) return;
    const t = setTimeout(async () => {
      await load();
    }, 2000);
    return () => clearTimeout(t);
  }, [data, load]);

  // Reload the card list once a running sync finishes.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (!data) return;
    if (wasRunning.current && !data.sync.running) reload();
    wasRunning.current = data.sync.running;
  }, [data, reload]);

  const act = async (p: Promise<unknown>, msg?: string) => {
    try {
      await p;
      if (msg) toast(msg);
      load();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const inviteLink = (code: string) => `${location.origin}/register?invite=${code}`;

  if (!data) return null;
  return (
    <section className="panel form">
      <h2>Admin</h2>

      <h3>Invite friends</h3>
      <p className="muted small">Each invite link can be used once to create an account.</p>
      <div className="row gap wrap">
        <input placeholder="Who is it for? (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={100} />
        <button
          className="btn"
          onClick={async () => {
            try {
              const res = await api.post<{ code: string }>('/admin/invites', { note });
              setNote('');
              await navigator.clipboard?.writeText(inviteLink(res.code)).catch(() => {});
              toast('Invite link created and copied');
              load();
            } catch (e) {
              toast((e as Error).message);
            }
          }}
        >
          Create invite link
        </button>
      </div>
      <ul className="plain admin-list">
        {data.invites.map((i) => (
          <li key={i.code}>
            <code>{inviteLink(i.code)}</code> {i.note && <span className="muted">({i.note})</span>}{' '}
            {i.usedBy ? (
              <span className="status good">used by {i.usedBy}</span>
            ) : (
              <button className="btn ghost small" onClick={() => act(api.del(`/admin/invites/${i.code}`))}>
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>

      <h3>Users</h3>
      <ul className="plain admin-list">
        {data.users.map((u) => (
          <li key={u.id}>
            <b>{u.username}</b> {u.isAdmin ? <span className="muted">(admin)</span> : null} <span className="muted">· {u.cards} cards</span>
            {u.id !== user.id && (
              <>
                {' '}
                <button
                  className="btn ghost small"
                  onClick={async () => {
                    if (!confirm(`Reset the password of ${u.username}?`)) return;
                    try {
                      const res = await api.post<{ password: string }>(`/admin/users/${u.id}/reset-password`);
                      prompt(`New temporary password for ${u.username} (they can change it in Settings):`, res.password);
                    } catch (e) {
                      toast((e as Error).message);
                    }
                  }}
                >
                  Reset password
                </button>
                <button
                  className="btn ghost small danger"
                  onClick={() => confirm(`Delete ${u.username} and their whole collection?`) && act(api.del(`/admin/users/${u.id}`), 'User deleted')}
                >
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <h3>Card database</h3>
      <p className="small">
        Last sync: {data.sync.lastSync ? new Date(data.sync.lastSync).toLocaleString() : 'never'}
        {data.sync.running && (
          <>
            {' '}
            · <b>running</b> ({data.sync.phase}
            {data.sync.phase === 'images' ? ` ${data.sync.imagesDone}/${data.sync.imagesTotal}` : ''})
          </>
        )}
      </p>
      {data.sync.lastError && <p className="warn">{data.sync.lastError}</p>}
      <button className="btn ghost" disabled={data.sync.running} onClick={() => act(api.post('/admin/sync'), 'Sync started')}>
        Update cards now
      </button>
    </section>
  );
}
