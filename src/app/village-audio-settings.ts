import { reactive, watch } from 'vue';
import { normalizeMusicSettings } from '../core/music';

const KEY = 'tcg-ar-village-music-v1';
function read() {
  try { return normalizeMusicSettings(JSON.parse(localStorage.getItem(KEY) ?? 'null')); }
  catch { return normalizeMusicSettings(null); }
}
export const villageAudio = reactive(read());
watch(villageAudio, () => {
  try { localStorage.setItem(KEY, JSON.stringify(villageAudio)); } catch { /* Preferências funcionam sem armazenamento. */ }
});
