/**
 * Regra da pausa automática ao sair do app. Pura para poder ser testada sem o componente: nenhuma tela de escolha,
 * resumo, evolução ou chefe em andamento deve ser interrompida por ela, e uma corrida já pausada fica como está.
 */

export interface SurvivorAutoPauseFlags {
  hidden: boolean;
  ready: boolean;
  over: boolean;
  paused: boolean;
  summary: boolean;
  pendingUpgrade: boolean;
  leaveConfirm: boolean;
  evolving: boolean;
  trainerPresentation: boolean;
  specialModal: boolean;
  blackChest: boolean;
  typeAffinity: boolean;
}

export function shouldSurvivorAutoPause(flags: SurvivorAutoPauseFlags): boolean {
  if (!flags.hidden || !flags.ready || flags.over || flags.paused) return false;
  return !flags.summary && !flags.pendingUpgrade && !flags.leaveConfirm && !flags.evolving
    && !flags.trainerPresentation && !flags.specialModal && !flags.blackChest && !flags.typeAffinity;
}
