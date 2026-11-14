import { pokemonSpriteUrl, pokemonStaticSpriteUrls } from '../ar/sprite-url';
import { createKartRace, stepKartRace, TRACK_HALF_WIDTH, trackPoint, trackTangent, type KartInput, type KartRaceState } from '../core/kart-race';

export interface KartFinish { position: number; elapsedMs: number; total: number; completed: boolean }
export interface KartRaceHandle {
  setInput(input: KartInput): void;
  dispose(): void;
}

/** Cena carregada só ao abrir o jogo. Pokémon são GIFs 2D sobre os karts. */
export async function startKartRace(
  host: HTMLElement,
  playerDexId: number,
  opponentDexIds: number[],
  onUpdate: (state: KartRaceState) => void,
  onFinish: (result: KartFinish) => void,
): Promise<KartRaceHandle> {
  const THREE = await import('three');
  const state = createKartRace(opponentDexIds.length);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8ccfed');
  scene.fog = new THREE.Fog('#8ccfed', 125, 275);
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
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: '#67a75d' }));
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
      const j = i * 4;
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
  const archBanner = new THREE.Mesh(new THREE.BoxGeometry(22, 0.45, 1.45), new THREE.MeshLambertMaterial({ color: '#cf554e' }));
  archBanner.position.set(0, 7.25, 0);
  archGroup.add(archBanner);
  scene.add(archGroup);

  const colors = ['#e8565d', '#4799e5', '#e9bc47', '#9c6dda', '#49b69d'];
  const kartGroups = state.cars.map((car, id) => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.7, 4.1), new THREE.MeshLambertMaterial({ color: colors[id % colors.length] }));
    body.position.y = 0.65;
    group.add(body);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.55, 1.7), new THREE.MeshLambertMaterial({ color: '#273142' }));
    seat.position.set(0, 1.1, -0.4);
    group.add(seat);
    for (const x of [-1.45, 1.45]) for (const z of [-1.25, 1.25]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 10), new THREE.MeshLambertMaterial({ color: '#20232b' }));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.55, z);
      group.add(wheel);
    }
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
      group.rotation.y = car.heading;
    });
    const player = state.cars[0]!;
    const behind = 9;
    const cameraTarget = new THREE.Vector3(player.x - Math.sin(player.heading) * behind, 6.5, player.z - Math.cos(player.heading) * behind);
    camera.position.lerp(cameraTarget, Math.min(1, dt * 7));
    camera.lookAt(player.x + Math.sin(player.heading) * 10, 1.6, player.z + Math.cos(player.heading) * 10);
    renderer.render(scene, camera);
    state.cars.forEach((car, id) => {
      const marker = sprites[id]!;
      // A base do GIF fica no assento do kart, acompanhando sua rotação.
      worldPoint.set(car.x - Math.sin(car.heading) * 0.4, 1.48, car.z - Math.cos(car.heading) * 0.4).project(camera);
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
    const rivalsFinished = state.cars.slice(1).every((car) => car.finishedAt !== null);
    if (!finished && (player.finishedAt !== null || rivalsFinished)) {
      finished = true;
      const completed = player.finishedAt !== null;
      const position = completed ? 1 + state.cars.slice(1).filter((car) => car.finishedAt !== null && car.finishedAt < player.finishedAt!).length : state.cars.length;
      onFinish({ position, elapsedMs: Math.round((player.finishedAt ?? state.elapsed) * 1000), total: state.cars.length, completed });
    }
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
  return {
    setInput(value) { input = value; },
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
      renderer.dispose();
      renderer.domElement.remove();
      spriteLayer.remove();
    },
  };
}
