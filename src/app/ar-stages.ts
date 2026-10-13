import type { SpriteLoadState } from '../ar/sprite-loader';

/** Etapas do AR de uma carta, na ordem em que acontecem. 'error' vale para qualquer uma. */
export type ArStage = 'idle' | 'selected' | 'preparing' | 'compiling' | 'engine' | 'searching' | 'tracking' | 'lost' | 'error';

export type StepState = 'done' | 'active' | 'pending' | 'failed';
export interface StepInfo {
  key: string;
  label: string;
  state: StepState;
}

const ORDER: { key: string; label: string; reachedAt: ArStage[] }[] = [
  { key: 'selected', label: 'Carta selecionada', reachedAt: ['selected'] },
  { key: 'preparing', label: 'Dados e imagem de referência', reachedAt: ['preparing'] },
  { key: 'compiling', label: 'Alvo de rastreamento compilado', reachedAt: ['compiling'] },
  { key: 'engine', label: 'Motor de rastreamento iniciado', reachedAt: ['engine'] },
  { key: 'searching', label: 'Procurando a carta física', reachedAt: ['searching'] },
  { key: 'tracking', label: 'Carta rastreada', reachedAt: ['tracking', 'lost'] },
  { key: 'rendering', label: 'Pokémon exibido', reachedAt: [] },
];

/**
 * Lista de etapas para a tela. "Pokémon exibido" só fica concluída quando a carta está rastreada E o sprite
 * (GIF, imagem ou marcador rotulado) está de fato carregado; sucesso nunca é inferido de uma etapa anterior.
 */
export function arStepList(stage: ArStage, sprite: SpriteLoadState['kind'] | undefined, hasSelection: boolean, failedAt?: ArStage): StepInfo[] {
  if (stage === 'idle' && !hasSelection) return [];
  const index = (s: ArStage) => ORDER.findIndex((o) => o.reachedAt.includes(s));
  const spriteReady = sprite === 'animated' || sprite === 'static' || sprite === 'placeholder';
  const current = stage === 'error' ? index(failedAt ?? 'preparing') : index(stage);
  return ORDER.map((step, i) => {
    let state: StepState;
    if (step.key === 'rendering') {
      state = stage === 'tracking' && spriteReady ? 'done' : stage === 'tracking' ? 'active' : 'pending';
    } else if (stage === 'error') {
      state = i < current ? 'done' : i === current ? 'failed' : 'pending';
    } else if (i < current) state = 'done';
    else if (i === current) state = step.key === 'tracking' || step.key === 'selected' ? 'done' : 'active';
    else state = 'pending';
    return { key: step.key, label: step.label, state };
  });
}

/** Texto curto sobre o vídeo. */
export function arStatusText(stage: ArStage, detail: string, sprite: SpriteLoadState['kind'] | undefined): string {
  switch (stage) {
    case 'preparing':
    case 'compiling':
    case 'engine':
      return detail;
    case 'searching':
      return 'Procurando a carta: aponte para a mesma impressão que você escolheu, inteira e bem iluminada.';
    case 'tracking':
      if (sprite === 'animated' || sprite === 'static') return 'Carta rastreada — Pokémon em pé sobre ela.';
      if (sprite === 'placeholder') return 'Carta rastreada — mostrando um marcador no lugar do Pokémon (veja o aviso abaixo).';
      if (sprite === 'error') return 'Carta rastreada, mas o GIF do Pokémon não carregou: mostrando um marcador (veja o aviso abaixo).';
      return 'Carta rastreada — carregando o Pokémon…';
    case 'lost':
      return 'Perdi a carta. Aponte de novo para ela.';
    default:
      return '';
  }
}
