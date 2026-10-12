export type Finish = 'normal' | 'foil';
export type Variant = 'base' | 'alt' | 'overnumbered' | 'signature' | 'special';

export interface Card {
  id: string;
  rid: string;
  name: string;
  baseName: string;
  key: string;
  code: string;
  set: string;
  setLabel: string;
  type: string;
  supertype: string | null;
  rarity: string;
  domains: string[];
  energy: number | null;
  might: number | null;
  power: number | null;
  text: string;
  flavour: string;
  keywords: string[];
  tags: string[];
  artist: string;
  variant: Variant;
  variantLabel: string;
  finishes: Finish[];
  landscape: boolean;
  remoteImage: string;
  tcgplayerId: string | null;
  img: string | null;
  order: number;
}

export interface CardSet {
  id: string;
  name: string;
  releasedOn: string | null;
  cardCount: number;
}

export interface CardsPayload {
  version: string;
  syncedAt: string | null;
  sets: CardSet[];
  cards: Card[];
}

export interface User {
  id: number;
  username: string;
  isAdmin: boolean;
  defaultLanguage: string;
}

export interface CollectionItem {
  cardId: string;
  finish: Finish;
  language: string;
  qty: number;
}

export type WantFinish = 'any' | Finish;

export interface Want {
  id: number;
  nameKey: string;
  cardId: string | null;
  finish: WantFinish;
  qty: number;
  priority: number;
  note: string;
  createdAt: string;
}

export type DeckSection = 'legend' | 'champion' | 'main' | 'battlefields' | 'runes' | 'sideboard' | 'other';

export interface DeckEntry {
  nameKey: string;
  name: string;
  qty: number;
  section: DeckSection;
}

export interface Deck {
  id: number;
  name: string;
  notes: string;
  listText: string;
  entries: DeckEntry[];
  createdAt: string;
  updatedAt: string;
}
