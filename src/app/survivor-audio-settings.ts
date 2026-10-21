import { reactive, watch } from 'vue';
import { normalizeSurvivorMusicSettings } from '../core/survivor-music';

const KEY = 'tcg-ar-survivor-music-v1';
function read() {
  try { return normalizeSurvivorMusicSettings(JSON.parse(localStorage.getItem(KEY) ?? 'null')); }
  catch { return normalizeSurvivorMusicSettings(null); }
}
export const survivorAudio = reactive(read());
watch(survivorAudio, () => {
  try { localStorage.setItem(KEY, JSON.stringify(survivorAudio)); } catch { /* Som continua disponível sem armazenamento. */ }
});
