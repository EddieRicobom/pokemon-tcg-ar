/**
 * Leitura tolerante de controles para a Gamepad API.
 *
 * O navegador normaliza controles reconhecidos como `standard`, mas controles
 * DirectInput (inclusive alguns 8BitDo) podem entregar o direcional por eixos
 * extras. A interface desta função é pequena de propósito para ser testável
 * sem WebGL, DOM ou um controle físico.
 */
export type GamepadDirection = 'up' | 'right' | 'down' | 'left';

export interface GamepadInput {
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
  readonly mapping?: string;
}

const AXIS_DEAD_ZONE = 0.55;
const HAT_NEUTRAL_ZONE = 0.08;

const HAT_DIRECTIONS: readonly { readonly value: number; readonly directions: readonly GamepadDirection[] }[] = [
  { value: -1, directions: ['up'] },
  { value: -5 / 7, directions: ['up', 'right'] },
  { value: -3 / 7, directions: ['right'] },
  { value: -1 / 7, directions: ['down', 'right'] },
  { value: 1 / 7, directions: ['down'] },
  { value: 3 / 7, directions: ['down', 'left'] },
  { value: 5 / 7, directions: ['left'] },
  { value: 1, directions: ['up', 'left'] },
];

export function gamepadButtonPressed(pad: GamepadInput, index: number): boolean {
  const button = pad.buttons[index];
  return button ? button.pressed || button.value > AXIS_DEAD_ZONE : false;
}

function addAxisDirections(directions: Set<GamepadDirection>, x: number | undefined, y: number | undefined): void {
  if ((x ?? 0) < -AXIS_DEAD_ZONE) directions.add('left');
  if ((x ?? 0) > AXIS_DEAD_ZONE) directions.add('right');
  if ((y ?? 0) < -AXIS_DEAD_ZONE) directions.add('up');
  if ((y ?? 0) > AXIS_DEAD_ZONE) directions.add('down');
}

function addHatDirections(directions: Set<GamepadDirection>, value: number | undefined): void {
  if (value === undefined || Math.abs(value) < HAT_NEUTRAL_ZONE) return;
  const nearest = HAT_DIRECTIONS.reduce((best, candidate) =>
    Math.abs(candidate.value - value) < Math.abs(best.value - value) ? candidate : best,
  );
  // Evita transformar outro eixo analógico no direcional por acidente.
  if (Math.abs(nearest.value - value) > HAT_NEUTRAL_ZONE) return;
  for (const direction of nearest.directions) directions.add(direction);
}

/**
 * Direções de um controle, incluindo o layout padrão e os layouts genéricos
 * frequentes em controles DirectInput. `axes[0..1]` é sempre o analógico
 * esquerdo; os eixos 6/7 e 9 só são usados quando o navegador não normalizou
 * o dispositivo para o layout padrão.
 */
export function gamepadDirections(pad: GamepadInput): Set<GamepadDirection> {
  const directions = new Set<GamepadDirection>();
  if (gamepadButtonPressed(pad, 12)) directions.add('up');
  if (gamepadButtonPressed(pad, 13)) directions.add('down');
  if (gamepadButtonPressed(pad, 14)) directions.add('left');
  if (gamepadButtonPressed(pad, 15)) directions.add('right');

  addAxisDirections(directions, pad.axes[0], pad.axes[1]);
  if (pad.mapping !== 'standard') {
    addAxisDirections(directions, pad.axes[6], pad.axes[7]);
    addHatDirections(directions, pad.axes[9]);
  }
  return directions;
}
