import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import type { Card, CardSet, CardsPayload, CollectionItem, Deck, Finish, User, Want } from './types';

export interface Owned {
  normal: number;
  foil: number;
  total: number;
  /** finish|language -> qty */
  detail: Map<string, number>;
}

export interface CollectionChange {
  cardId: string;
  finish: Finish;
  language: string;
  qty?: number;
  delta?: number;
}

interface DataState {
  user: User;
  setUser: (u: User) => void;
  cards: Card[];
  cardById: Map<string, Card>;
  cardsByKey: Map<string, Card[]>;
  sets: CardSet[];
  syncedAt: string | null;
  collection: CollectionItem[];
  owned: Map<string, Owned>;
  ownedByKey: Map<string, number>;
  wants: Want[];
  decks: Deck[];
  /** Resolves to false (after showing a toast) when the server rejected the change. */
  changeCollection: (changes: CollectionChange[]) => Promise<boolean>;
  setWants: (w: Want[]) => void;
  setDecks: (d: Deck[]) => void;
  reload: () => Promise<void>;
  toast: (msg: string) => void;
}

const DataContext = createContext<DataState | null>(null);

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData outside DataProvider');
  return ctx;
}

const EMPTY_OWNED: Owned = { normal: 0, foil: 0, total: 0, detail: new Map() };
export const ownedOf = (owned: Map<string, Owned>, id: string) => owned.get(id) ?? EMPTY_OWNED;

export function DataProvider({
  user: initialUser,
  children,
  toast,
}: {
  user: User;
  children: ReactNode;
  toast: (msg: string) => void;
}) {
  const [user, setUser] = useState(initialUser);
  const [payload, setPayload] = useState<CardsPayload | null>(null);
  const [collection, setCollection] = useState<CollectionItem[]>([]);
  const [wants, setWants] = useState<Want[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [p, c, w, d] = await Promise.all([
        api.get<CardsPayload>('/cards'),
        api.get<{ items: CollectionItem[] }>('/collection'),
        api.get<{ items: Want[] }>('/wants'),
        api.get<{ items: Deck[] }>('/decks'),
      ]);
      setPayload(p);
      setCollection(c.items);
      setWants(w.items);
      setDecks(d.items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const cards = payload?.cards ?? [];
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const cardsByKey = useMemo(() => {
    const m = new Map<string, Card[]>();
    for (const c of cards) {
      if (!m.has(c.key)) m.set(c.key, []);
      m.get(c.key)!.push(c);
    }
    return m;
  }, [cards]);

  const owned = useMemo(() => {
    const m = new Map<string, Owned>();
    for (const it of collection) {
      let o = m.get(it.cardId);
      if (!o) m.set(it.cardId, (o = { normal: 0, foil: 0, total: 0, detail: new Map() }));
      o[it.finish] += it.qty;
      o.total += it.qty;
      o.detail.set(`${it.finish}|${it.language}`, it.qty);
    }
    return m;
  }, [collection]);

  const ownedByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, o] of owned) {
      const card = cardById.get(id);
      if (card) m.set(card.key, (m.get(card.key) ?? 0) + o.total);
    }
    return m;
  }, [owned, cardById]);

  const changeCollection = useCallback(
    async (changes: CollectionChange[]) => {
      try {
        const res = await api.post<{ items: CollectionItem[] }>('/collection', { changes });
        setCollection((prev) => {
          const map = new Map(prev.map((it) => [`${it.cardId}|${it.finish}|${it.language}`, it]));
          for (const it of res.items) {
            const k = `${it.cardId}|${it.finish}|${it.language}`;
            if (it.qty > 0) map.set(k, it);
            else map.delete(k);
          }
          return [...map.values()];
        });
        return true;
      } catch (e) {
        toast((e as Error).message);
        return false;
      }
    },
    [toast],
  );

  if (error && !payload) {
    return (
      <div className="center-screen">
        <p>Could not load data: {error}</p>
        <button className="btn" onClick={reload}>
          Retry
        </button>
      </div>
    );
  }
  if (!payload) return <div className="center-screen">Loading cards…</div>;
  if (payload.cards.length === 0) {
    return (
      <div className="center-screen">
        <p>The card database is still being downloaded for the first time. This takes a minute.</p>
        <button className="btn" onClick={reload}>
          Check again
        </button>
      </div>
    );
  }

  const value: DataState = {
    user,
    setUser,
    cards,
    cardById,
    cardsByKey,
    sets: payload.sets,
    syncedAt: payload.syncedAt,
    collection,
    owned,
    ownedByKey,
    wants,
    decks,
    changeCollection,
    setWants,
    setDecks,
    reload,
    toast,
  };
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
