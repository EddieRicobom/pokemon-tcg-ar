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

/** Etapas em que a tela mostra a animação de carregamento (o rastreador ainda não achou a carta). */
export type LoadingMode = 'loading' | 'searching';

export function arLoadingMode(stage: ArStage): LoadingMode | null {
  if (stage === 'preparing' || stage === 'compiling' || stage === 'engine') return 'loading';
  if (stage === 'searching') return 'searching';
  return null;
}

/** Título curto da etapa que está rodando (para a animação de carregamento). */
export function arStageTitle(stage: ArStage): string {
  switch (stage) {
    case 'preparing':
      return 'Baixando a carta e o Pokémon';
    case 'compiling':
      return 'Ensinando a câmera a reconhecer a carta';
    case 'engine':
      return 'Ligando o rastreador';
    case 'searching':
      return 'Procurando a carta';
    default:
      return '';
  }
}

/**
 * O que está acontecendo e quanto falta, em uma frase. `seconds` é o tempo desde que a etapa atual começou: passado um
 * tempo a frase passa a explicar a demora (sem prometer prazo que não dá para garantir).
 */
export function arLoadHint(stage: ArStage, seconds: number): string {
  switch (stage) {
    case 'preparing':
      if (seconds >= 25) return 'Está demorando mais que o normal. Confira a internet; se não der, vai aparecer um aviso com o que fazer.';
      if (seconds >= 10) return 'A rede está lenta. Continuo tentando em outros endereços.';
      return 'Buscando a imagem da carta, os dados e o GIF do Pokémon. Na próxima vez isso já estará guardado no aparelho.';
    case 'compiling':
      if (seconds >= 30) return 'Ainda compilando. Em celulares mais lentos pode passar de meio minuto; não feche esta tela.';
      if (seconds >= 12) return 'Quase lá. Esta etapa só acontece uma vez por carta: depois o alvo fica guardado.';
      return 'Transformando a imagem da carta em um alvo que a câmera reconhece. Só acontece uma vez por carta.';
    case 'engine':
      if (seconds >= 15) return 'O motor é pesado na primeira vez. Se travar, feche e abra a câmera de novo.';
      return 'Carregando o rastreador e ligando a câmera nele.';
    case 'searching':
      if (seconds >= 25) return 'Nada ainda. Confira se é a mesma impressão da carta escolhida e tente outro ângulo, sem reflexo.';
      if (seconds >= 10) return 'Chegue mais perto ou afaste um pouco até a carta ocupar boa parte da tela, bem iluminada.';
      return 'Aponte para a carta, inteira e de frente. Assim que eu achar, o Pokémon aparece.';
    default:
      return '';
  }
}

/** Segundos inteiros decorridos entre dois instantes (nunca negativo). */
export function elapsedSeconds(startedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}
