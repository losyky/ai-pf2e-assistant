import { MAP_CELL_SIZE } from '../constants';
import { MapTemplate } from './types';
import { MapGuideImageService } from './map-guide-image-service';

declare const canvas: any;
declare const ui: any;

export class MapPlacementPreview {
  private template: MapTemplate;
  private overlay: HTMLDivElement | null = null;
  private pixiContainer: any = null;
  private resolve: ((pos: { x: number; y: number } | null) => void) | null = null;
  private _boundKeyHandler = (e: KeyboardEvent) => this._onKey(e);

  constructor(template: MapTemplate) {
    this.template = template;
  }

  private get totalWidth(): number {
    return this.template.gridCols * MAP_CELL_SIZE;
  }

  private get totalHeight(): number {
    return this.template.gridRows * MAP_CELL_SIZE;
  }

  start(): Promise<{ x: number; y: number } | null> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this._createOverlay();
      this._createPixiPreview();
      ui.notifications.info('点击画布放置模板，右键或 Esc 取消');
    });
  }

  private _createOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.id = 'map-placement-overlay';
    this.overlay.innerHTML = `<div class="placement-hint"><i class="fas fa-crosshairs"></i> 点击放置 · 右键/Esc 取消</div>`;

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

    const guideService = MapGuideImageService.getInstance();
    const guideCanvasEl = guideService.renderToCanvas(this.template);

    this.pixiContainer = new PIXI.Container();
    this.pixiContainer.alpha = 0.55;
    this.pixiContainer.eventMode = 'none';

    try {
      const sprite = PIXI.Sprite.from(guideCanvasEl);
      sprite.width = this.totalWidth;
      sprite.height = this.totalHeight;
      this.pixiContainer.addChild(sprite);
    } catch {
      // Sprite creation failed; fall back to a colored rectangle
    }

    const g = new PIXI.Graphics();
    try {
      g.rect(0, 0, this.totalWidth, this.totalHeight)
        .fill({ color: 0x4361ee, alpha: 0.08 })
        .stroke({ width: 4, color: 0x4361ee, alpha: 0.9 });
    } catch {
      try {
        g.beginFill(0x4361ee, 0.08);
        g.lineStyle(4, 0x4361ee, 0.9);
        g.drawRect(0, 0, this.totalWidth, this.totalHeight);
        g.endFill();
      } catch { /* give up on outline */ }
    }
    this.pixiContainer.addChild(g);

    canvas.stage.addChild(this.pixiContainer);
  }

  private _onMouseMove(e: MouseEvent): void {
    if (!this.pixiContainer) return;
    const pos = MapPlacementPreview._screenToCanvas(e.clientX, e.clientY);
    const gridSize = canvas.scene?.grid?.size || MAP_CELL_SIZE;
    this.pixiContainer.x = Math.round(pos.x / gridSize) * gridSize;
    this.pixiContainer.y = Math.round(pos.y / gridSize) * gridSize;
  }

  private _onConfirm(e: MouseEvent): void {
    const pos = MapPlacementPreview._screenToCanvas(e.clientX, e.clientY);
    const gridSize = canvas.scene?.grid?.size || MAP_CELL_SIZE;
    const x = Math.round(pos.x / gridSize) * gridSize;
    const y = Math.round(pos.y / gridSize) * gridSize;
    this._cleanup();
    this.resolve?.({ x, y });
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
}
