import { MAP_CELL_SIZE } from '../constants';
import type { MazeBlueprint } from './maze-blueprint-types';
import type { MapTemplate } from './types';
import { MapTemplateService } from './map-template-service';
import { MapGuideImageService } from './map-guide-image-service';
import { MapRotationHelper } from './map-rotation-helper';
import { MazeBuilderService } from './maze-builder-service';
import { ROOM_TYPE_COLORS } from './maze-types';

declare const canvas: any;
declare const ui: any;

export interface MazePlacementResult {
  originX: number;
  originY: number;
}

/**
 * Interactive canvas overlay that lets the user click to choose
 * where a maze blueprint should be placed.  The preview snaps to grid
 * and renders a semi-transparent outline of the full maze layout.
 */
export class MazePlacementPreview {
  private blueprint: MazeBlueprint;
  private pendingTemplateProvider: ((id: string) => MapTemplate | null | undefined) | null;
  private overlay: HTMLDivElement | null = null;
  private pixiContainer: any = null;
  private resolve: ((result: MazePlacementResult | null) => void) | null = null;
  private _boundKeyHandler = (e: KeyboardEvent) => this._onKey(e);

  constructor(
    blueprint: MazeBlueprint,
    pendingTemplateProvider?: (id: string) => MapTemplate | null | undefined,
  ) {
    this.blueprint = blueprint;
    this.pendingTemplateProvider = pendingTemplateProvider ?? null;
  }

  private get totalWidth(): number {
    return this.blueprint.gridWidth * this.blueprint.cellSize * MAP_CELL_SIZE;
  }

  private get totalHeight(): number {
    return this.blueprint.gridHeight * this.blueprint.cellSize * MAP_CELL_SIZE;
  }

  start(): Promise<MazePlacementResult | null> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this._createOverlay();
      this._createPixiPreview();
      ui.notifications.info('点击画布选择迷宫放置位置，右键或 Esc 取消');
    });
  }

  private _createOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.id = 'map-placement-overlay';
    this.overlay.innerHTML =
      '<div class="placement-hint"><i class="fas fa-crosshairs"></i> 点击放置迷宫 · 右键/Esc 取消</div>';

    this.overlay.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.overlay.addEventListener('click', (e) => this._onConfirm(e));
    this.overlay.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this._onCancel();
    });

    document.addEventListener('keydown', this._boundKeyHandler);
    document.body.appendChild(this.overlay);
  }

  private _createPixiPreview(): void {
    const PIXI = (window as any).PIXI;
    if (!PIXI || !canvas?.stage) return;

    const templateService = MapTemplateService.getInstance();
    const guideService = MapGuideImageService.getInstance();
    const builderService = MazeBuilderService.getInstance();
    const bp = this.blueprint;
    const N = bp.cellSize;

    const templates = bp.templateIds
      .map(id => this.pendingTemplateProvider?.(id) || templateService.getById(id))
      .filter((t): t is MapTemplate => t != null);

    const templateMap = new Map(templates.map(t => [t.id, t]));

    const placementGrid = new Map<string, { cells: boolean[][]; roomType: string }>();
    for (const p of bp.placements) {
      const base = templateMap.get(p.templateId);
      if (!base) continue;
      const rotated = MapRotationHelper.rotateTemplate(base, p.rotation);
      placementGrid.set(`${p.gridX},${p.gridY}`, {
        cells: rotated.cells,
        roomType: base.roomType || 'empty',
      });
    }

    this.pixiContainer = new PIXI.Container();
    this.pixiContainer.alpha = 0.55;
    this.pixiContainer.eventMode = 'none';

    const tilePxW = N * MAP_CELL_SIZE;
    const tilePxH = N * MAP_CELL_SIZE;

    for (const p of bp.placements) {
      const base = templateMap.get(p.templateId);
      if (!base) continue;
      const rotated = MapRotationHelper.rotateTemplate(base, p.rotation);

      const fixedWalls = builderService.fixWallsForPosition(
        rotated, p.gridX, p.gridY, placementGrid,
      );
      const fixedTemplate = { ...rotated, walls: fixedWalls };

      const tileCvs = guideService.renderToCanvas(
        fixedTemplate,
        rotated.gridCols * MAP_CELL_SIZE,
        rotated.gridRows * MAP_CELL_SIZE,
      );

      try {
        const sprite = PIXI.Sprite.from(tileCvs);
        sprite.x = p.gridX * tilePxW;
        sprite.y = p.gridY * tilePxH;
        sprite.width = tilePxW;
        sprite.height = tilePxH;
        this.pixiContainer.addChild(sprite);
      } catch { /* sprite creation failed */ }

      const roomType = base.roomType || 'empty';
      const color = ROOM_TYPE_COLORS[roomType] || '#FFFFFF';
      const cx = p.gridX * tilePxW + tilePxW / 2;
      const cy = p.gridY * tilePxH + tilePxH / 2;
      const radius = Math.max(8, Math.min(tilePxW, tilePxH) * 0.12);

      const badge = new PIXI.Graphics();
      try {
        badge.circle(cx, cy, radius).fill({ color: this._parseColor(color), alpha: 0.8 });
      } catch {
        try {
          badge.beginFill(this._parseColor(color), 0.8);
          badge.drawCircle(cx, cy, radius);
          badge.endFill();
        } catch { /* give up */ }
      }
      this.pixiContainer.addChild(badge);
    }

    const outline = new PIXI.Graphics();
    try {
      outline.rect(0, 0, this.totalWidth, this.totalHeight)
        .fill({ color: 0x4361ee, alpha: 0.04 })
        .stroke({ width: 4, color: 0x4361ee, alpha: 0.9 });
    } catch {
      try {
        outline.beginFill(0x4361ee, 0.04);
        outline.lineStyle(4, 0x4361ee, 0.9);
        outline.drawRect(0, 0, this.totalWidth, this.totalHeight);
        outline.endFill();
      } catch { /* give up */ }
    }
    this.pixiContainer.addChild(outline);

    canvas.stage.addChild(this.pixiContainer);
  }

  private _onMouseMove(e: MouseEvent): void {
    if (!this.pixiContainer) return;
    const pos = MazePlacementPreview._screenToCanvas(e.clientX, e.clientY);
    const gridSize = canvas.scene?.grid?.size || MAP_CELL_SIZE;

    const snappedX = Math.round(pos.x / gridSize) * gridSize;
    const snappedY = Math.round(pos.y / gridSize) * gridSize;
    this.pixiContainer.x = snappedX;
    this.pixiContainer.y = snappedY;
  }

  private _onConfirm(e: MouseEvent): void {
    const pos = MazePlacementPreview._screenToCanvas(e.clientX, e.clientY);
    const gridSize = canvas.scene?.grid?.size || MAP_CELL_SIZE;

    const snappedX = Math.round(pos.x / gridSize) * gridSize;
    const snappedY = Math.round(pos.y / gridSize) * gridSize;

    this._cleanup();
    this.resolve?.({ originX: snappedX, originY: snappedY });
  }

  private _onCancel(): void {
    this._cleanup();
    this.resolve?.(null);
  }

  private _onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this._onCancel();
    }
  }

  private _cleanup(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    if (this.pixiContainer && canvas?.stage) {
      try {
        canvas.stage.removeChild(this.pixiContainer);
        this.pixiContainer.destroy({ children: true });
      } catch { /* ignore */ }
      this.pixiContainer = null;
    }
    document.removeEventListener('keydown', this._boundKeyHandler);
  }

  static _screenToCanvas(clientX: number, clientY: number): { x: number; y: number } {
    try {
      const stage = canvas?.stage;
      if (stage?.worldTransform) {
        const wt = stage.worldTransform;
        return {
          x: (clientX - wt.tx) / wt.a,
          y: (clientY - wt.ty) / wt.d,
        };
      }
    } catch { /* fallback */ }
    return canvas?.mousePosition ?? { x: 0, y: 0 };
  }

  private _parseColor(hex: string): number {
    return parseInt(hex.replace('#', ''), 16);
  }
}
