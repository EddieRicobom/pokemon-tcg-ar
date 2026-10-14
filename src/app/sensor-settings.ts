import { reactive, watch } from 'vue';

/** Ajustes do giroscópio, compartilhados entre o AR da carta e a Caixa. */
export interface SensorSettings {
  /** Usar o giroscópio para acompanhar o giro do celular entre as leituras do rastreador. */
  gyro: boolean;
  /** Atraso (ms) da imagem da câmera em relação ao sensor: o Pokémon usa a orientação de "agora − atraso". */
  latencyMs: number;
}

export const LATENCY_RANGE = { min: 0, max: 160 } as const;
const KEY = 'tcg-ar-sensor-v1';
const DEFAULTS: SensorSettings = { gyro: true, latencyMs: 70 };

export function normalizeSensor(raw: Partial<SensorSettings> | null | undefined): SensorSettings {
  const latency = Number(raw?.latencyMs);
  return {
    gyro: raw?.gyro !== false,
    latencyMs: Number.isFinite(latency) ? Math.min(LATENCY_RANGE.max, Math.max(LATENCY_RANGE.min, Math.round(latency))) : DEFAULTS.latencyMs,
  };
}

function read(): SensorSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeSensor(JSON.parse(raw) as Partial<SensorSettings>);
  } catch {
    // Sem armazenamento local: usa o padrão.
  }
  return { ...DEFAULTS };
}

export const sensorSettings = reactive<SensorSettings>(read());

watch(sensorSettings, () => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ gyro: sensorSettings.gyro, latencyMs: sensorSettings.latencyMs }));
  } catch {
    // Só não lembra da escolha na próxima vez.
  }
});
