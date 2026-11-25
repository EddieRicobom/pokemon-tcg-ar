import { pokemonSpriteUrl, pokemonStaticSpriteUrls } from '../ar/sprite-url';
import { TYPE_COLORS } from '../core/pokemon-data';
import { activateKartAbility, createKartRace, kartPlacementOrder, KART_CUP_ROUNDS, stepKartRace, TRACK_HALF_WIDTH, trackPoint, trackTangent, useKartItem, type KartInput, type KartRaceState } from '../core/kart-race';
import type { Object3D } from 'three';

export interface KartStanding { id: number; place: number; finishedMs: number | null; hits: number }
export interface KartFinish {
  position: number;
  elapsedMs: number;
  total: number;
  completed: boolean;
  order: number[];
  laps?: number[];
  /** Acertos de item causados pelo jogador. */
  hits?: number;
  /** Melhor volta do jogador, em ms. */
  bestLapMs?: number;
  /** Classificação completa, inclusive quem não terminou. */
  standings?: KartStanding[];
}
export interface KartRaceHandle {
  setInput(input: KartInput): void;
  useAbility(): boolean;
  /** Usa o item da mão (casca, concha, turbo...). */
  useItem(): boolean;
  dispose(): void;
}

/** Cena carregada só ao abrir o jogo. Pokémon são GIFs 2D sobre os karts. */
export async function startKartRace(
  host: HTMLElement,
  playerDexId: number,
  opponentDexIds: number[],
  onUpdate: (state: KartRaceState) => void,
  onFinish: (result: KartFinish) => void,
  rivalId: number | null = null,
  themeIndex = 0,
): Promise<KartRaceHandle> {
  const THREE = await import('three');
  const state = createKartRace(opponentDexIds.length, [playerDexId, ...opponentDexIds], rivalId, { items: true, seed: Date.now(), countdown: 3 });
  const palette = [
    { sky: '#8ccfed', ground: '#67a75d' },
    { sky: '#ecc593', ground: '#a19a64' },
    { sky: '#8ba8d9', ground: '#557e70' },
  ][themeIndex] ?? { sky: '#8ccfed', ground: '#67a75d' };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.sky);
  scene.fog = new THREE.Fog(palette.sky, 125, 275);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 300);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = false;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
  host.append(renderer.domElement);
  const spriteLayer = document.createElement('div');
  spriteLayer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none';
  host.append(spriteLayer);

  scene.add(new THREE.HemisphereLight('#fff8e4', '#557a60', 2));
  const sun = new THREE.DirectionalLight('#fff0ca', 2.1);
  sun.position.set(30, 70, -40);
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: palette.ground }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  scene.add(ground);

  const makeStrip = (halfWidth: number, color: string, y: number): void => {
    const vertices: number[] = [];
    const count = 192;
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2;
      const b = (i + 1) / count * Math.PI * 2;
      for (const angle of [a, b]) {
        const center = trackPoint(angle);
        const { x: tx, z: tz } = trackTangent(angle);
        const len = Math.hypot(tx, tz);
        const nx = tz / len;
        const nz = -tx / len;
        vertices.push(center.x + nx * halfWidth, y, center.z + nz * halfWidth);
        vertices.push(center.x - nx * halfWidth, y, center.z - nz * halfWidth);
      }
    }
    const triangles: number[] = [];
    for (let i = 0; i < count; i++) {
      const j = i * 12;
      triangles.push(...vertices.slice(j, j + 3), ...vertices.slice(j + 3, j + 6), ...vertices.slice(j + 6, j + 9));
      triangles.push(...vertices.slice(j + 3, j + 6), ...vertices.slice(j + 9, j + 12), ...vertices.slice(j + 6, j + 9));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles, 3));
    geometry.computeVertexNormals();
    scene.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })));
  };
  makeStrip(TRACK_HALF_WIDTH + 2.8, '#9a8d71', 0.005);
  makeStrip(TRACK_HALF_WIDTH + 1.15, '#eee8d8', 0.015);
  makeStrip(TRACK_HALF_WIDTH, '#414854', 0.025);
  // Faixas vermelhas e brancas marcam o limite transitável do asfalto.
  const dummy = new THREE.Object3D();
  const kerbGeometry = new THREE.BoxGeometry(1.9, 0.055, 1.2);
  const kerbMaterials = [new THREE.MeshLambertMaterial({ color: '#f9eee4' }), new THREE.MeshLambertMaterial({ color: '#d94e47' })];
  const kerbs = kerbMaterials.map((material) => new THREE.InstancedMesh(kerbGeometry, material, 112));
  for (let i = 0; i < 112; i++) {
    const angle = i / 112 * Math.PI * 2;
    const point = trackPoint(angle);
    const { x: tx, z: tz } = trackTangent(angle);
    const length = Math.hypot(tx, tz);
    for (const side of [-1, 1]) {
      dummy.position.set(point.x + side * tz / length * (TRACK_HALF_WIDTH - 0.55), 0.07, point.z - side * tx / length * (TRACK_HALF_WIDTH - 0.55));
      dummy.rotation.y = Math.atan2(tx, tz);
      dummy.updateMatrix();
      kerbs[i % 2]!.setMatrixAt(Math.floor(i / 2) * 2 + (side === -1 ? 0 : 1), dummy.matrix);
    }
  }
  scene.add(...kerbs);
  const markerGeometry = new THREE.BoxGeometry(0.35, 0.04, 3);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: '#fcebb0' });
  for (let i = 0; i < 64; i++) {
    if (i % 2) continue;
    const a = i / 64 * Math.PI * 2;
    const p = trackPoint(a);
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.set(p.x, 0.06, p.z);
    const tangent = trackTangent(a);
    marker.rotation.y = Math.atan2(tangent.x, tangent.z);
    scene.add(marker);
  }
  const start = trackPoint(0);
  for (let i = -7; i <= 7; i++) {
    const tile = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.9), new THREE.MeshBasicMaterial({ color: i % 2 ? '#ffffff' : '#1e2330' }));
    tile.position.set(start.x + i, 0.07, start.z);
    scene.add(tile);
  }
  // Muretas baixas e árvores deixam clara a forma da pista sem bloquear os sprites.
  const postGeometry = new THREE.BoxGeometry(0.6, 0.8, 0.6);
  const postMaterials = [new THREE.MeshLambertMaterial({ color: '#fff2db' }), new THREE.MeshLambertMaterial({ color: '#e9705e' })];
  const posts = postMaterials.map((material) => new THREE.InstancedMesh(postGeometry, material, 48));
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * Math.PI * 2;
    const p = trackPoint(a);
    const { x: tx, z: tz } = trackTangent(a);
    const len = Math.hypot(tx, tz);
    for (const side of [-1, 1]) {
      dummy.position.set(p.x + side * tz / len * (TRACK_HALF_WIDTH + 3.5), 0.4, p.z - side * tx / len * (TRACK_HALF_WIDTH + 3.5));
      dummy.rotation.y = 0;
      dummy.updateMatrix();
      posts[i % 2]!.setMatrixAt(Math.floor(i / 2) * 2 + (side === -1 ? 0 : 1), dummy.matrix);
    }
  }
  scene.add(...posts);
  // Silhuetas de árvores ao redor da pista: instâncias mantêm o custo baixo no celular.
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.45, 0.65, 3, 5), new THREE.MeshLambertMaterial({ color: '#755e44' }), 46);
  const foliage = new THREE.InstancedMesh(new THREE.ConeGeometry(2.7, 7, 6), new THREE.MeshLambertMaterial({ color: '#2e815b', flatShading: true }), 46);
  for (let i = 0; i < 46; i++) {
    const angle = i / 46 * Math.PI * 2 + 0.025 * Math.sin(i * 17);
    const point = trackPoint(angle);
    const radius = i % 3 === 0 ? 25 : 18;
    const x = point.x + Math.cos(angle) * radius;
    const z = point.z + Math.sin(angle) * radius;
    dummy.position.set(x, 1.5, z);
    dummy.scale.setScalar(0.85 + (i % 5) * 0.09);
    dummy.updateMatrix();
    trunk.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 5.4;
    dummy.updateMatrix();
    foliage.setMatrixAt(i, dummy.matrix);
  }
  scene.add(trunk, foliage);
  const archMaterial = new THREE.MeshLambertMaterial({ color: '#f5d283' });
  const archPostGeometry = new THREE.BoxGeometry(0.8, 7, 0.8);
  const archGroup = new THREE.Group();
  const archPoint = trackPoint(0.25);
  const archTangent = trackTangent(0.25);
  archGroup.position.set(archPoint.x, 0, archPoint.z);
  archGroup.rotation.y = Math.atan2(archTangent.x, archTangent.z);
  for (const x of [-12, 12]) {
    const post = new THREE.Mesh(archPostGeometry, archMaterial);
    post.position.set(x, 3.5, 0);
    archGroup.add(post);
  }
  const arch = new THREE.Mesh(new THREE.BoxGeometry(25, 1.3, 1.3), archMaterial);
  arch.position.set(0, 7.3, 0);
  archGroup.add(arch);
  const archBanner = new THREE.Mesh(new THREE.BoxGeometry(22, 0.45, 1.45), new THREE.MeshLambertMaterial({ color: KART_CUP_ROUNDS[themeIndex]?.accent ?? '#cf554e' }));
  archBanner.position.set(0, 7.25, 0);
  archGroup.add(archBanner);
  // Semáforo da largada: três luzes que mudam com a contagem.
  const startLightMaterials = [-3, 0, 3].map(() => new THREE.MeshBasicMaterial({ color: '#e64b45' }));
  startLightMaterials.forEach((material, index) => {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), material);
    light.position.set(index === 0 ? -2.8 : index === 1 ? 0 : 2.8, 6.35, 0.8);
    archGroup.add(light);
  });
  scene.add(archGroup);

  // Arquibancadas simples: base, torcida colorida e bandeiras. Instâncias mantêm o custo baixo.
  const crowdCount = 84;
  const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.75, 0.45), new THREE.MeshLambertMaterial(), crowdCount);
  const crowdColors = ['#e8565d', '#4799e5', '#e9bc47', '#9c6dda', '#49b69d', '#f2efe6'];
  const crowdColor = new THREE.Color();
  let crowdIndex = 0;
  for (const [standIndex, angle] of [0.1, 0.66, 1.22, 3.9].entries()) {
    const point = trackPoint(angle);
    const { x: tx, z: tz } = trackTangent(angle);
    const length = Math.hypot(tx, tz);
    const nx = tz / length;
    const nz = -tx / length;
    const group = new THREE.Group();
    group.position.set(point.x + nx * 17, 0, point.z + nz * 17);
    group.rotation.y = Math.atan2(tx, tz);
    const base = new THREE.Mesh(new THREE.BoxGeometry(13, 1.6, 4.2), new THREE.MeshLambertMaterial({ color: standIndex % 2 ? '#59606b' : '#6b5a4a' }));
    base.position.y = 0.8;
    group.add(base);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(13.8, 0.35, 4.8), new THREE.MeshLambertMaterial({ color: '#d8d2c2' }));
    roof.position.set(0, 4.5, 0);
    group.add(roof);
    for (const x of [-5.6, 5.6]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.5, 0.35), new THREE.MeshLambertMaterial({ color: '#8b929c' }));
      post.position.set(x, 2.25, 1.8);
      group.add(post);
    }
    for (const row of [0, 1, 2]) {
      for (const seat of [-5.4, -4.2, -3, -1.8, -0.6, 0.6, 1.8, 3, 4.2, 5.4]) {
        if (crowdIndex >= crowdCount) break;
        dummy.position.set(seat + (row % 2) * 0.3, 1.95 + row * 0.72, 0.8 - row * 0.55);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        crowd.setMatrixAt(crowdIndex, dummy.matrix);
        crowd.setColorAt(crowdIndex, crowdColor.set(crowdColors[(crowdIndex + standIndex) % crowdColors.length]!));
        crowdIndex++;
      }
    }
    scene.add(group);
  }
  crowd.count = crowdIndex;
  scene.add(crowd);

  // Nuvens e montanhas distantes dão profundidade sem sombras e sem partículas.
  const cloudMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(3.5 + (i % 3), 7, 6), cloudMaterial);
    const angle = i / 14 * Math.PI * 2;
    cloud.position.set(Math.cos(angle) * (60 + (i % 4) * 12), 24 + (i % 3) * 4, Math.sin(angle) * (70 + (i % 5) * 10));
    cloud.scale.set(2.2, 0.55, 1.2);
    scene.add(cloud);
  }
  const mountainMaterial = [new THREE.MeshLambertMaterial({ color: '#5b7f73' }), new THREE.MeshLambertMaterial({ color: '#4d6e6b' })];
  for (let i = 0; i < 10; i++) {
    const angle = i / 10 * Math.PI * 2 + 0.2;
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(16 + (i % 3) * 5, 28 + (i % 4) * 7, 5), mountainMaterial[i % 2]!);
    mountain.position.set(Math.cos(angle) * 125, 12, Math.sin(angle) * 135);
    scene.add(mountain);
  }

  // Caixas de item: cubo girando com anel, visíveis enquanto disponíveis.
  const itemBoxGeometry = new THREE.BoxGeometry(1.05, 1.05, 1.05);
  const itemBoxMaterials = ['#f7c948', '#ff8bc2', '#77d0ff'].map((color) => new THREE.MeshBasicMaterial({ color }));
  const itemBoxInnerMaterial = new THREE.MeshBasicMaterial({ color: '#fff5c9' });
  const itemRingGeometry = new THREE.TorusGeometry(1.02, 0.11, 6, 18);
  const itemRingMaterial = new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.85 });
  const itemBoxMeshes = state.boxes.map((box, index) => {
    const group = new THREE.Group();
    const cube = new THREE.Mesh(itemBoxGeometry, itemBoxMaterials[index % itemBoxMaterials.length]!);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.58, 0.58), itemBoxInnerMaterial);
    const ring = new THREE.Mesh(itemRingGeometry, itemRingMaterial);
    ring.rotation.x = Math.PI / 2;
    group.add(cube, inner, ring);
    group.position.set(box.x, 1.2, box.z);
    scene.add(group);
    return group;
  });

  // Perigos e projéteis são sincronizados por id; materiais e geometrias são compartilhados.
  const bananaGeometry = new THREE.TorusGeometry(0.48, 0.18, 5, 9, Math.PI * 1.4);
  const bananaMaterial = new THREE.MeshLambertMaterial({ color: '#f2d13b' });
  const oilGeometry = new THREE.CircleGeometry(1.7, 20);
  const oilMaterial = new THREE.MeshBasicMaterial({ color: '#2f2638', transparent: true, opacity: 0.82 });
  const shellGeometry = new THREE.SphereGeometry(0.55, 10, 8);
  const shellMaterial = new THREE.MeshBasicMaterial({ color: '#f06b55' });
  const shellRingGeometry = new THREE.TorusGeometry(0.8, 0.1, 5, 12);
  const shellRingMaterial = new THREE.MeshBasicMaterial({ color: '#ffe6a3', transparent: true, opacity: 0.8 });
  const hazardMeshes = new Map<number, Object3D>();
  const projectileMeshes = new Map<number, Object3D>();
  const hitShakeUntil: number[] = state.cars.map(() => 0);
  const lastSpin: number[] = state.cars.map(() => 0);

  const fallbackColors = ['#e8565d', '#4799e5', '#e9bc47', '#9c6dda', '#49b69d'];
  const spriteHeights: number[] = [];
  const kartGroups = state.cars.map((car, id) => {
    const profile = car.profile;
    const bodyKind = profile?.body.id ?? 'equilibrado';
    const wheelKind = profile?.wheels.id ?? 'misto';
    const bodyColor = profile ? TYPE_COLORS[profile.types[0]!] : fallbackColors[id % fallbackColors.length]!;
    const accentColor = profile?.types[1] ? TYPE_COLORS[profile.types[1]] : '#f5e4bd';
    const paint = new THREE.MeshLambertMaterial({ color: bodyColor });
    const accent = new THREE.MeshLambertMaterial({ color: accentColor });
    const dark = new THREE.MeshLambertMaterial({ color: '#263241' });
    const metal = new THREE.MeshLambertMaterial({ color: '#c9d3da' });
    const tire = new THREE.MeshLambertMaterial({ color: '#20232b' });
    const group = new THREE.Group();
    const dimensions = {
      leve: { width: 2.25, height: 0.48, length: 3.45 },
      equilibrado: { width: 2.7, height: 0.64, length: 4.05 },
      pesado: { width: 3.15, height: 0.84, length: 4.25 },
      aero: { width: 2.48, height: 0.46, length: 4.55 },
    }[bodyKind];
    const wheelSize = {
      asfalto: { radius: 0.46, width: 0.32 },
      misto: { radius: 0.54, width: 0.43 },
      tracao: { radius: 0.64, width: 0.52 },
    }[wheelKind];
    const bodyY = wheelSize.radius + dimensions.height * 0.3;
    const addBox = (width: number, height: number, length: number, x: number, y: number, z: number, material: typeof paint): void => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), material);
      mesh.position.set(x, y, z);
      group.add(mesh);
    };
    addBox(dimensions.width, dimensions.height, dimensions.length, 0, bodyY, 0, paint);
    addBox(dimensions.width * 0.72, 0.06, dimensions.length * 0.72, 0, bodyY + dimensions.height / 2 + 0.035, 0.16, accent);
    addBox(dimensions.width * 0.71, 0.4, 1.35, 0, bodyY + dimensions.height / 2 + 0.23, -0.42, dark);
    addBox(dimensions.width * 0.9, 0.17, 0.28, 0, bodyY - 0.03, dimensions.length / 2 + 0.07, metal);
    addBox(dimensions.width * 0.78, 0.18, 0.2, 0, bodyY + 0.08, -dimensions.length / 2 - 0.05, dark);
    if (bodyKind === 'leve') {
      // Chassi curto, peças expostas e pouca massa visual.
      for (const x of [-0.75, 0.75]) addBox(0.18, 0.16, 1.15, x, bodyY + 0.28, 0.68, metal);
    } else if (bodyKind === 'pesado') {
      // Laterais blindadas e proteção alta atrás do piloto.
      for (const x of [-1.45, 1.45]) addBox(0.22, 0.58, 2.55, x, bodyY + 0.2, -0.05, dark);
      addBox(2.35, 0.44, 0.35, 0, bodyY + 0.62, -1.24, metal);
    } else if (bodyKind === 'aero') {
      // Nariz comprido e asa traseira distinguem o modelo de velocidade.
      addBox(1.45, 0.22, 1.25, 0, bodyY + 0.06, 1.95, paint);
      addBox(2.85, 0.11, 0.48, 0, bodyY + 0.95, -1.76, accent);
      for (const x of [-0.9, 0.9]) addBox(0.11, 0.76, 0.12, x, bodyY + 0.58, -1.76, metal);
    } else {
      // Para-lamas completos marcam o modelo equilibrado.
      for (const x of [-1.32, 1.32]) addBox(0.19, 0.28, 2.85, x, bodyY + 0.11, 0, paint);
    }
    const wheelX = dimensions.width / 2 + wheelSize.width * 0.35;
    const wheelZ = dimensions.length * 0.32;
    for (const x of [-wheelX, wheelX]) for (const z of [-wheelZ, wheelZ]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wheelSize.radius, wheelSize.radius, wheelSize.width, 12), tire);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, wheelSize.radius, z);
      group.add(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(wheelSize.radius * 0.38, wheelSize.radius * 0.38, wheelSize.width + 0.025, 10), wheelKind === 'asfalto' ? accent : metal);
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(wheel.position);
      group.add(hub);
      if (wheelKind === 'tracao') {
        // Blocos largos na banda de rodagem sinalizam aderência fora do asfalto.
        for (let tread = 0; tread < 6; tread++) {
          const angle = tread * Math.PI / 3;
          const block = new THREE.Mesh(new THREE.BoxGeometry(wheelSize.width * 0.84, 0.11, 0.22), dark);
          block.position.set(x, wheelSize.radius + Math.sin(angle) * wheelSize.radius, z + Math.cos(angle) * wheelSize.radius);
          block.rotation.x = -angle;
          group.add(block);
        }
      }
    }
    spriteHeights.push(bodyY + dimensions.height / 2 + 0.55);
    group.position.set(car.x, 0, car.z);
    scene.add(group);
    return group;
  });
  const sprites = state.cars.map((_, id) => {
    const container = document.createElement('div');
    container.style.cssText = 'position:absolute;transform:translate(-50%,-100%);text-align:center;filter:drop-shadow(0 2px 2px #172030);white-space:nowrap';
    const img = document.createElement('img');
    img.alt = id === 0 ? 'Seu Pokémon' : `Oponente ${id}`;
    img.style.cssText = 'display:block;max-width:100%;max-height:100%;object-fit:contain;image-rendering:pixelated';
    const dexId = id === 0 ? playerDexId : opponentDexIds[id - 1]!;
    const urls = [pokemonSpriteUrl(dexId), ...pokemonStaticSpriteUrls(dexId)];
    let urlIndex = 0;
    img.onerror = () => {
      urlIndex++;
      if (urlIndex < urls.length) img.src = urls[urlIndex]!;
      else { img.remove(); container.textContent = 'Sprite indisponível'; container.style.color = '#ffffff'; container.style.background = '#352539'; }
    };
    img.src = urls[0]!;
    container.append(img);
    spriteLayer.append(container);
    return container;
  });
  const effectRings = kartGroups.map((group) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(2, 2.35, 24), new THREE.MeshBasicMaterial({ color: '#f9d568', transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.11;
    ring.visible = false;
    group.add(ring);
    return ring;
  });
  const resize = (): void => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  let input: KartInput = { throttle: 0, steer: 0, brake: false };
  let disposed = false;
  let finished = false;
  let frame = 0;
  let previous = performance.now();
  let accumulator = 0;
  let hudLast = 0;
  let playerLap = 0;
  let lapStartedAt = 0;
  const lapTimes: number[] = [];
  const worldPoint = new THREE.Vector3();
  const startingPlayer = state.cars[0]!;
  camera.position.set(startingPlayer.x - Math.sin(startingPlayer.heading) * 9, 6.5, startingPlayer.z - Math.cos(startingPlayer.heading) * 9);
  const loop = (now: number): void => {
    if (disposed) return;
    const dt = Math.min(0.12, (now - previous) / 1000);
    previous = now;
    if (!finished) {
      accumulator += dt;
      while (accumulator >= 1 / 60) {
        stepKartRace(state, input, 1 / 60);
        accumulator -= 1 / 60;
      }
    }
    state.cars.forEach((car, id) => {
      const group = kartGroups[id]!;
      group.position.set(car.x, 0, car.z);
      const spinning = car.spinUntil > state.elapsed;
      group.rotation.y = car.heading + (spinning ? (car.spinUntil - state.elapsed) * 15 : 0);
      group.rotation.z = spinning ? Math.sin(now / 60) * 0.16 : 0;
      if (car.spinUntil > lastSpin[id]!) {
        lastSpin[id] = car.spinUntil;
        hitShakeUntil[id] = now + 320;
      }
      const ring = effectRings[id]!;
      const driftColor = car.driftCharge > 0.15 ? '#ffb347' : null;
      const activeColor = car.shieldUntil > state.elapsed ? '#7bd7f4' : car.slowUntil > state.elapsed ? '#bb83d8' : car.boostUntil > state.elapsed ? '#f9d568' : driftColor;
      ring.visible = activeColor !== null;
      if (activeColor) (ring.material as InstanceType<typeof THREE.MeshBasicMaterial>).color.set(activeColor);
    });
    // Caixas de item: flutuam e giram enquanto estão disponíveis.
    const seconds = now / 1000;
    state.boxes.forEach((box, index) => {
      const mesh = itemBoxMeshes[index]!;
      const ready = box.readyAt <= state.elapsed;
      mesh.visible = ready;
      if (!ready) return;
      mesh.position.y = 1.2 + Math.sin(seconds * 2.1 + index) * 0.16;
      mesh.rotation.y = seconds * 1.5 + index;
      const inner = mesh.children[1];
      if (inner) inner.rotation.y = -seconds * 2.2;
    });
    // Perigos e conchas: cria uma malha por id e remove quando o motor apaga.
    const liveHazards = new Set<number>();
    for (const hazard of state.hazards) {
      liveHazards.add(hazard.id);
      let mesh = hazardMeshes.get(hazard.id);
      if (!mesh) {
        mesh = hazard.kind === 'oil'
          ? new THREE.Mesh(oilGeometry, oilMaterial)
          : new THREE.Mesh(bananaGeometry, bananaMaterial);
        if (hazard.kind === 'oil') mesh.rotation.x = -Math.PI / 2;
        else mesh.rotation.x = Math.PI / 2;
        scene.add(mesh);
        hazardMeshes.set(hazard.id, mesh);
      }
      mesh.position.set(hazard.x, hazard.kind === 'oil' ? 0.04 : 0.22, hazard.z);
      if (hazard.kind === 'banana') mesh.rotation.z = seconds * 1.8;
    }
    for (const [id, mesh] of hazardMeshes) {
      if (liveHazards.has(id)) continue;
      scene.remove(mesh);
      hazardMeshes.delete(id);
    }
    const liveProjectiles = new Set<number>();
    for (const shot of state.projectiles) {
      liveProjectiles.add(shot.id);
      let mesh = projectileMeshes.get(shot.id);
      if (!mesh) {
        const group = new THREE.Group();
        group.add(new THREE.Mesh(shellGeometry, shellMaterial));
        const ring = new THREE.Mesh(shellRingGeometry, shellRingMaterial);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
        scene.add(group);
        mesh = group;
        projectileMeshes.set(shot.id, group);
      }
      mesh.position.set(shot.x, 0.55, shot.z);
      mesh.rotation.y = shot.angle;
    }
    for (const [id, mesh] of projectileMeshes) {
      if (liveProjectiles.has(id)) continue;
      scene.remove(mesh);
      projectileMeshes.delete(id);
    }
    // Semáforo: vermelho durante a contagem, verde na largada.
    const green = state.countdown <= 0;
    for (const material of startLightMaterials) material.color.set(green ? '#63d471' : '#e64b45');
    const player = state.cars[0]!;
    const behind = 9;
    const cameraTarget = new THREE.Vector3(player.x - Math.sin(player.heading) * behind, 6.5, player.z - Math.cos(player.heading) * behind);
    camera.position.lerp(cameraTarget, Math.min(1, dt * 7));
    const boosting = player.boostUntil > state.elapsed;
    camera.fov += ((boosting ? 70 : 62) - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
    const shake = Math.max(0, hitShakeUntil[0]! - now) / 320;
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake * 0.45;
      camera.position.y += (Math.random() - 0.5) * shake * 0.3;
    }
    camera.lookAt(player.x + Math.sin(player.heading) * 10, 1.6, player.z + Math.cos(player.heading) * 10);
    renderer.render(scene, camera);
    state.cars.forEach((car, id) => {
      const marker = sprites[id]!;
      // A base do GIF fica no assento do kart, acompanhando sua rotação.
      worldPoint.set(car.x - Math.sin(car.heading) * 0.4, spriteHeights[id]!, car.z - Math.cos(car.heading) * 0.4).project(camera);
      const visible = worldPoint.z > -1 && worldPoint.z < 1 && Math.abs(worldPoint.x) < 1.2 && Math.abs(worldPoint.y) < 1.2;
      marker.style.display = visible ? 'block' : 'none';
      if (visible) {
        marker.style.left = `${(worldPoint.x * 0.5 + 0.5) * host.clientWidth}px`;
        marker.style.top = `${(-worldPoint.y * 0.5 + 0.5) * host.clientHeight}px`;
        const size = Math.max(25, Math.min(92, 76 / (1 + camera.position.distanceTo(kartGroups[id]!.position) * 0.025)));
        marker.style.width = `${size}px`;
        marker.style.height = `${size}px`;
      }
    });
    if (now - hudLast > 100) { onUpdate(state); hudLast = now; }
    while (player.lap > playerLap) {
      lapTimes.push(Math.max(0, Math.round((state.elapsed - lapStartedAt) * 1000)));
      lapStartedAt = state.elapsed;
      playerLap++;
    }
    const rivalsFinished = state.cars.slice(1).every((car) => car.finishedAt !== null);
    if (!finished && (player.finishedAt !== null || rivalsFinished)) {
      finished = true;
      const completed = player.finishedAt !== null;
      const position = completed ? 1 + state.cars.slice(1).filter((car) => car.finishedAt !== null && car.finishedAt < player.finishedAt!).length : state.cars.length;
      const order = kartPlacementOrder(state);
      const standings = order.map((id, index) => {
        const car = state.cars[id]!;
        return { id, place: index + 1, finishedMs: car.finishedAt === null ? null : Math.round(car.finishedAt * 1000), hits: car.hits };
      });
      onFinish({
        position,
        elapsedMs: Math.round((player.finishedAt ?? state.elapsed) * 1000),
        total: state.cars.length,
        completed,
        order,
        laps: lapTimes.slice(0, state.laps),
        hits: player.hits,
        ...(lapTimes.length ? { bestLapMs: Math.min(...lapTimes) } : {}),
        standings,
      });
    }
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
  return {
    setInput(value) { input = value; },
    useAbility() { return !disposed && !finished && activateKartAbility(state, 0); },
    useItem() { return !disposed && !finished && useKartItem(state, 0); },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      sprites.forEach((sprite) => sprite.remove());
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      // Perigos e conchas já removidos da cena não passam pelo traverse: estes recursos são compartilhados.
      [bananaGeometry, bananaMaterial, oilGeometry, oilMaterial, shellGeometry, shellMaterial, shellRingGeometry, shellRingMaterial].forEach((asset) => asset.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      spriteLayer.remove();
    },
  };
}
