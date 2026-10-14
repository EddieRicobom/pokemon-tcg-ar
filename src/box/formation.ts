/** Formação da equipe: os Pokémon em fila de frente para a câmera (modo "ver todos ao mesmo tempo"). */

export interface Slot {
  x: number;
  z: number;
}

/**
 * Posições (relativas ao centro da caixa) de `count` Pokémon numa fila perpendicular à direção centro → câmera
 * (`towardX`, `towardZ`), levemente curvada para trás nas pontas. O espaçamento encolhe se a fila não coubesse na caixa.
 */
export function formationSlots(count: number, half: number, towardX: number, towardZ: number, preferredSpacing = 0.42): Slot[] {
  if (count <= 0) return [];
  const length = Math.hypot(towardX, towardZ);
  const tx = length > 1e-6 ? towardX / length : 0;
  const tz = length > 1e-6 ? towardZ / length : 1;
  const lx = tz; // eixo lateral = "direita" olhando do centro para a câmera
  const lz = -tx;
  const limit = half * 0.9;
  const spacing = count > 1 ? Math.min(preferredSpacing, (2 * limit) / (count - 1)) : 0;
  const slots: Slot[] = [];
  for (let i = 0; i < count; i++) {
    const k = i - (count - 1) / 2;
    const side = k * spacing;
    const back = -0.05 * k * k; // pontas um pouco atrás, formando um arco
    const x = Math.max(-limit, Math.min(limit, lx * side + tx * back));
    const z = Math.max(-limit, Math.min(limit, lz * side + tz * back));
    slots.push({ x, z });
  }
  return slots;
}
