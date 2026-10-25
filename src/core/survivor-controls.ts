/** Zona neutra evita movimento involuntário ao apoiar o dedo; o restante mantém a direção do gesto. */
export function survivorStick(dx: number, dy: number, radius: number): { dx: number; dy: number } {
  const distance = Math.hypot(dx, dy);
  const deadzone = 5;
  if (distance <= deadzone || radius <= deadzone) return { dx: 0, dy: 0 };
  const strength = Math.min(1, (distance - deadzone) / (radius - deadzone));
  return { dx: dx / distance * strength, dy: dy / distance * strength };
}
