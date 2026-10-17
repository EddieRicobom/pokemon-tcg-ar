/**
 * Organização das cartas em caixas, como a Box dos jogos Pokémon (pedido do dono): caixas de 30 espaços numa grade
 * 6 × 5, com nome, e cada carta num espaço fixo que o jogador escolhe. Só guarda ONDE cada carta está (ids); as
 * cartas em si continuam no cache do aparelho. Puro e testável; a tela fica em `views/CarregarView.vue`.
 */
export const BOX_COLS = 6;
export const BOX_ROWS = 5;
export const BOX_SIZE = BOX_COLS * BOX_ROWS;
export const MAX_BOXES = 32;

export interface Box {
  name: string;
  /** `BOX_SIZE` espaços: id da carta ou null (vazio). */
  slots: (string | null)[];
}

export interface BoxLayout {
  v: 1;
  boxes: Box[];
}

export interface SlotRef {
  box: number;
  slot: number;
}

export function defaultBoxName(index: number): string {
  return `Caixa ${index + 1}`;
}

function emptyBox(index: number): Box {
  return { name: defaultBoxName(index), slots: Array.from({ length: BOX_SIZE }, () => null) };
}

export function emptyLayout(): BoxLayout {
  return { v: 1, boxes: [emptyBox(0)] };
}

/**
 * Lê uma organização salva (talvez velha ou corrompida) e a acerta com as cartas que existem de verdade: cartas que
 * sumiram saem do espaço; cartas novas entram no primeiro espaço livre (criando caixa se precisar); id repetido
 * fica só na primeira posição. Nunca perde carta e nunca inventa uma.
 */
export function reconcileLayout(raw: unknown, cardIds: readonly string[]): BoxLayout {
  const known = new Set(cardIds);
  const placed = new Set<string>();
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<BoxLayout>;
  const boxes: Box[] = [];
  const rawBoxes = Array.isArray(r.boxes) ? r.boxes.slice(0, MAX_BOXES) : [];
  rawBoxes.forEach((b, i) => {
    const name = b && typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 24) : defaultBoxName(i);
    const slots: (string | null)[] = Array.from({ length: BOX_SIZE }, (_, k) => {
      const id = Array.isArray(b?.slots) ? b.slots[k] : null;
      if (typeof id !== 'string' || !known.has(id) || placed.has(id)) return null;
      placed.add(id);
      return id;
    });
    boxes.push({ name, slots });
  });
  if (boxes.length === 0) boxes.push(emptyBox(0));
  for (const id of cardIds) {
    if (placed.has(id)) continue;
    const spot = firstFree(boxes);
    if (spot) {
      boxes[spot.box]!.slots[spot.slot] = id;
    } else if (boxes.length < MAX_BOXES) {
      const box = emptyBox(boxes.length);
      box.slots[0] = id;
      boxes.push(box);
    } else {
      continue; // limite de caixas: a carta segue na lista, só não ganha espaço (32 × 30 = 960 cartas)
    }
    placed.add(id);
  }
  return { v: 1, boxes };
}

function firstFree(boxes: readonly Box[]): SlotRef | null {
  for (let b = 0; b < boxes.length; b++) {
    const slot = boxes[b]!.slots.indexOf(null);
    if (slot >= 0) return { box: b, slot };
  }
  return null;
}

/** Onde está a carta (ou null). */
export function findCard(layout: BoxLayout, id: string): SlotRef | null {
  for (let b = 0; b < layout.boxes.length; b++) {
    const slot = layout.boxes[b]!.slots.indexOf(id);
    if (slot >= 0) return { box: b, slot };
  }
  return null;
}

function valid(layout: BoxLayout, ref: SlotRef): boolean {
  return ref.box >= 0 && ref.box < layout.boxes.length && ref.slot >= 0 && ref.slot < BOX_SIZE;
}

/** Move o que está em `from` para `to`; se `to` estiver ocupado, os dois trocam de lugar (como nos jogos). */
export function moveSlot(layout: BoxLayout, from: SlotRef, to: SlotRef): BoxLayout {
  if (!valid(layout, from) || !valid(layout, to)) return layout;
  if (from.box === to.box && from.slot === to.slot) return layout;
  const boxes = layout.boxes.map((b) => ({ ...b, slots: [...b.slots] }));
  const a = boxes[from.box]!.slots[from.slot] ?? null;
  const b = boxes[to.box]!.slots[to.slot] ?? null;
  boxes[to.box]!.slots[to.slot] = a;
  boxes[from.box]!.slots[from.slot] = b;
  return { v: 1, boxes };
}

export function renameBox(layout: BoxLayout, box: number, name: string): BoxLayout {
  if (box < 0 || box >= layout.boxes.length) return layout;
  const clean = name.trim().slice(0, 24) || defaultBoxName(box);
  return { v: 1, boxes: layout.boxes.map((b, i) => (i === box ? { ...b, name: clean } : b)) };
}

export function addBox(layout: BoxLayout): BoxLayout {
  if (layout.boxes.length >= MAX_BOXES) return layout;
  return { v: 1, boxes: [...layout.boxes, emptyBox(layout.boxes.length)] };
}

/** Apaga uma caixa VAZIA (com carta dentro, não deixa — nada se perde por engano). Sempre sobra pelo menos uma. */
export function removeEmptyBox(layout: BoxLayout, box: number): BoxLayout {
  if (layout.boxes.length <= 1 || box < 0 || box >= layout.boxes.length) return layout;
  if (layout.boxes[box]!.slots.some((s) => s !== null)) return layout;
  return { v: 1, boxes: layout.boxes.filter((_, i) => i !== box) };
}

export type BoxSort = 'pokedex' | 'nome';

/** Arruma as cartas DE UMA caixa (as outras não mudam): número da Pokédex ou nome, com os vazios no fim. */
export function sortBox(layout: BoxLayout, box: number, by: BoxSort, info: (id: string) => { name: string; dex?: number }): BoxLayout {
  if (box < 0 || box >= layout.boxes.length) return layout;
  const ids = layout.boxes[box]!.slots.filter((s): s is string => s !== null);
  ids.sort((x, y) => {
    const a = info(x);
    const b = info(y);
    if (by === 'pokedex') return (a.dex ?? 99999) - (b.dex ?? 99999) || a.name.localeCompare(b.name, 'pt-BR');
    return a.name.localeCompare(b.name, 'pt-BR');
  });
  const slots: (string | null)[] = [...ids, ...Array.from({ length: BOX_SIZE - ids.length }, () => null)];
  return { v: 1, boxes: layout.boxes.map((b, i) => (i === box ? { ...b, slots } : b)) };
}
