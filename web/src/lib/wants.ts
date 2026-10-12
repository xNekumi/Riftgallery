import type { Card, Want } from '../types';
import { cardLabel } from './cards';

export const PRIORITIES: Record<number, string> = { 1: 'High', 2: 'Normal', 3: 'Low' };

export function wantsForCard(card: Card, wants: Want[]): Want[] {
  return wants.filter((w) => (w.cardId ? w.cardId === card.id : w.nameKey === card.key));
}

export function wantTitle(w: Want, cardById: Map<string, Card>, cardsByKey: Map<string, Card[]>): string {
  if (w.cardId) {
    const c = cardById.get(w.cardId);
    if (c) return cardLabel(c);
  }
  return cardsByKey.get(w.nameKey)?.[0]?.baseName ?? w.nameKey;
}

/** Plain text want list, ready to paste into a chat with a trade partner. */
export function wantsToText(wants: Want[], cardById: Map<string, Card>, cardsByKey: Map<string, Card[]>): string {
  const lines = ['Want list', ''];
  for (const prio of [1, 2, 3]) {
    const group = wants.filter((w) => w.priority === prio);
    if (!group.length) continue;
    lines.push(`${PRIORITIES[prio]} priority:`);
    for (const w of group) {
      const card = w.cardId ? cardById.get(w.cardId) : undefined;
      const extras = [
        card ? card.code : 'any version',
        w.finish !== 'any' ? w.finish : null,
        w.note || null,
      ].filter(Boolean);
      lines.push(`${w.qty}x ${wantTitle(w, cardById, cardsByKey)} (${extras.join(', ')})`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}
