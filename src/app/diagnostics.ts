import { ref } from 'vue';
import type { LastAttempt } from './scan-controller';

/** Última tentativa de reconhecimento (só números e textos curtos; nenhum quadro de câmera é guardado). */
export const lastAttempt = ref<LastAttempt | null>(null);
