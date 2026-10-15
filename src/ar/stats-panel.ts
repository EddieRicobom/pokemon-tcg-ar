import { CanvasTexture, DoubleSide, Group, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import type { BattleData, PartName } from '../app/pokemon-data-service';
import { emptyBattleData } from '../app/pokemon-data-service';
import { choosePage, REAPPEAR_AFTER_MS } from './panel-state';
import type { PanelMode, PanelPage } from './panel-state';
import type { PanelPlacement } from './anchor';
import { drawPanel, hitTestPanel, PANEL_HEIGHT_PX, PANEL_WIDTH_PX, PRESS_FLASH_MS } from './stats-draw';
import type { PanelHit, PanelModel } from './stats-draw';

/** Quase sobre o plano da carta (evita brigar com o plano sem flutuar). */
const LIFT = 0.004;
const REDRAW_MS = 50;

/** Altura/largura do painel (para calcular o tamanho a partir da largura). */
export const PANEL_ASPECT = PANEL_HEIGHT_PX / PANEL_WIDTH_PX;

/**
 * Painel "no chão": um plano deitado no plano da carta, logo abaixo da ilustração (à frente dos pés do Pokémon),
 * com os dados do Pokémon. É filho do grupo da carta, então segue a pose rastreada e some junto com o sprite;
 * `setPlacement` o mantém colado ao Pokémon (posição, giro e tamanho). Só mostra dados
 * que vieram de uma fonte (PokéAPI / TCGdex); enquanto carrega ou se falhar, diz isso na página.
 */
export class StatsPanel {
  readonly object = new Group();
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly texture: CanvasTexture;
  private model: PanelModel;
  private enabled = true;
  private mode: PanelMode = 'auto';
  private pressed: { page: PanelPage; index: number; at: number } | null = null;
  private cycleStart: number | null = null;
  private lastVisibleAt = -Infinity;
  private page: PanelPage = 'status';
  private pageStart = 0;
  private lastDraw = -Infinity;
  private dirty = true;
  /** Quantos desenhos foram feitos (diagnóstico e testes). */
  draws = 0;

  constructor(name: string, dexId?: number) {
    this.model = { name, dexId, data: emptyBattleData() };
    this.canvas = document.createElement('canvas');
    this.canvas.width = PANEL_WIDTH_PX;
    this.canvas.height = PANEL_HEIGHT_PX;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = this.canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    this.ctx = ctx;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    const material = new MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false });
    this.mesh = new Mesh(new PlaneGeometry(1, PANEL_ASPECT), material);
    this.object.add(this.mesh);
  }

  get currentPage(): PanelPage {
    return this.page;
  }

  get currentMode(): PanelMode {
    return this.mode;
  }

  get panelModel(): PanelModel {
    return this.model;
  }

  /** Posição, giro e largura do painel no espaço da carta (ver `panelPlacement`). */
  setPlacement(placement: PanelPlacement): void {
    if (![placement.x, placement.y, placement.yawRad, placement.width].every(Number.isFinite) || placement.width <= 0) return;
    this.object.position.set(placement.x, placement.y, LIFT);
    this.object.rotation.set(0, 0, placement.yawRad);
    this.mesh.scale.set(placement.width, placement.width, 1);
  }

  /** O que há no ponto (u, v) da textura do painel (coordenadas de UV do Three.js; v cresce para cima). */
  hit(u: number, v: number): PanelHit | null {
    if (!Number.isFinite(u) || !Number.isFinite(v) || u < 0 || u > 1 || v < 0 || v > 1) return null;
    return hitTestPanel(this.model, this.page, u * PANEL_WIDTH_PX, (1 - v) * PANEL_HEIGHT_PX);
  }

  /** Brilho de confirmação na linha tocada. */
  press(page: PanelPage, index: number, nowMs: number): void {
    this.pressed = { page, index, at: nowMs };
    this.dirty = true;
  }

  setPart<K extends PartName>(part: K, result: BattleData[K]): void {
    this.model = { ...this.model, data: { ...this.model.data, [part]: result } };
    this.dirty = true;
  }

  setMode(mode: PanelMode): void {
    this.mode = mode;
    this.pageStart = -Infinity; // força recomeçar a animação na próxima atualização
    this.dirty = true;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.object.visible = enabled;
  }

  /** Chamado a cada quadro de tela. `visible` = a carta está sendo mostrada (grupo do sprite visível). */
  update(nowMs: number, visible: boolean): void {
    if (!this.enabled || !visible) return;
    if (this.cycleStart === null || nowMs - this.lastVisibleAt > REAPPEAR_AFTER_MS) {
      this.cycleStart = nowMs;
      this.pageStart = nowMs;
      this.page = choosePage(this.mode, 0);
    }
    this.lastVisibleAt = nowMs;
    const page = choosePage(this.mode, nowMs - this.cycleStart);
    if (page !== this.page || this.pageStart === -Infinity) {
      this.page = page;
      this.pageStart = nowMs;
      this.dirty = true;
    }
    if (!this.dirty && nowMs - this.lastDraw < REDRAW_MS) return;
    if (nowMs - this.lastDraw < REDRAW_MS / 2) return;
    this.draw(nowMs);
  }

  private draw(nowMs: number): void {
    this.lastDraw = nowMs;
    this.dirty = false;
    if (!this.ctx) return;
    const age = this.pressed ? nowMs - this.pressed.at : Infinity;
    const press = this.pressed && age <= PRESS_FLASH_MS ? { page: this.pressed.page, index: this.pressed.index, ageMs: age } : undefined;
    drawPanel(this.ctx, this.model, this.page, nowMs - this.pageStart, nowMs, press);
    this.texture.needsUpdate = true;
    this.draws++;
  }

  dispose(): void {
    this.texture.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.object.remove(this.mesh);
    this.object.removeFromParent();
  }
}
