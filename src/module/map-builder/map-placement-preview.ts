import { MAP_CELL_SIZE } from '../constants';
import { MapTemplate, MapRotation } from './types';
import { MapGuideImageService } from './map-guide-image-service';
import { MapRotationHelper } from './map-rotation-helper';

declare const canvas: any;
declare const ui: any;

export interface PlacementResult {
  x: number;
  y: number;
  rotation: MapRotation;
}

export class MapPlacementPreview {
  private template: MapTemplate;
  private overlay: HTMLDivElement | null = null;
  private pixiContainer: any = null;
  private resolve: ((result: PlacementResult | null) => void) | null = null;
  private _boundKeyHandler = (e: KeyboardEvent) => this._onKey(e);
  
  private placementStep: 'position' | 'rotation' = 'position';
  private selectedPosition: { x: number; y: number } | null = null;
  private currentRotation: MapRotation = 0;
  private rotationIndicator: any = null;

  constructor(template: MapTemplate, defaultRotation?: MapRotation) {
    this.template = template;
    this.currentRotation = defaultRotation || template.rotation || 0;
  }

  private get totalWidth(): number {
    const dims = MapRotationHelper.getRotatedDimensions(
      this.template.gridCols,
      this.template.gridRows,
      this.currentRotation
    );
    return dims.cols * MAP_CELL_SIZE;
  }

  private get totalHeight(): number {
    const dims = MapRotationHelper.getRotatedDimensions(
      this.template.gridCols,
      this.template.gridRows,
      this.currentRotation
    );
    return dims.rows * MAP_CELL_SIZE;
  }

  start(): Promise<PlacementResult | null> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.placementStep = 'position';
      this._createOverlay();
      this._createPixiPreview();
      ui.notifications.info('第一步：点击画布确定位置，右键或 Esc 取消');
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
    const rotatedTemplate = MapRotationHelper.rotateTemplate(this.template, this.currentRotation);
    const guideCanvasEl = guideService.renderToCanvas(rotatedTemplate);

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
    
    if (this.placementStep === 'position') {
      const snappedX = Math.round(pos.x / gridSize) * gridSize;
      const snappedY = Math.round(pos.y / gridSize) * gridSize;
      
      const centerX = snappedX + this.totalWidth / 2;
      const centerY = snappedY + this.totalHeight / 2;
      
      this.pixiContainer.x = centerX - this.totalWidth / 2;
      this.pixiContainer.y = centerY - this.totalHeight / 2;
    } else if (this.placementStep === 'rotation' && this.selectedPosition) {
      const centerX = this.selectedPosition.x;
      const centerY = this.selectedPosition.y;
      
      const newRotation = MapRotationHelper.getRotationFromMouseDirection(
        centerX,
        centerY,
        pos.x,
        pos.y
      );
      
      if (newRotation !== this.currentRotation) {
        this.currentRotation = newRotation;
        this._updatePreviewRotation();
      }
      
      this._updateRotationIndicator(pos.x, pos.y);
    }
  }

  private _onConfirm(e: MouseEvent): void {
    const pos = MapPlacementPreview._screenToCanvas(e.clientX, e.clientY);
    const gridSize = canvas.scene?.grid?.size || MAP_CELL_SIZE;
    
    if (this.placementStep === 'position') {
      const snappedX = Math.round(pos.x / gridSize) * gridSize;
      const snappedY = Math.round(pos.y / gridSize) * gridSize;
      
      const centerX = snappedX + this.totalWidth / 2;
      const centerY = snappedY + this.totalHeight / 2;
      
      this.selectedPosition = { x: centerX, y: centerY };
      this.placementStep = 'rotation';
      
      this._createRotationIndicator();
      this._updateOverlayHint('第二步：移动鼠标选择朝向，点击确认');
      ui.notifications.info('第二步：移动鼠标选择朝向，点击确认');
    } else if (this.placementStep === 'rotation' && this.selectedPosition) {
      const finalX = this.selectedPosition.x - this.totalWidth / 2;
      const finalY = this.selectedPosition.y - this.totalHeight / 2;
      
      this._cleanup();
      this.resolve?.({
        x: finalX,
        y: finalY,
        rotation: this.currentRotation,
      });
    }
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

  private _updatePreviewRotation(): void {
    if (!this.pixiContainer || !this.selectedPosition) return;
    
    const PIXI = (window as any).PIXI;
    if (!PIXI) return;
    
    while (this.pixiContainer.children.length > 0) {
      this.pixiContainer.removeChildAt(0);
    }
    
    const guideService = MapGuideImageService.getInstance();
    const rotatedTemplate = MapRotationHelper.rotateTemplate(this.template, this.currentRotation);
    const guideCanvasEl = guideService.renderToCanvas(rotatedTemplate);
    
    try {
      const sprite = PIXI.Sprite.from(guideCanvasEl);
      sprite.width = this.totalWidth;
      sprite.height = this.totalHeight;
      this.pixiContainer.addChild(sprite);
    } catch {
      // Sprite creation failed
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
      } catch { /* give up */ }
    }
    this.pixiContainer.addChild(g);
    
    this.pixiContainer.x = this.selectedPosition.x - this.totalWidth / 2;
    this.pixiContainer.y = this.selectedPosition.y - this.totalHeight / 2;
  }

  private _createRotationIndicator(): void {
    const PIXI = (window as any).PIXI;
    if (!PIXI || !canvas?.stage || !this.selectedPosition) return;
    
    this.rotationIndicator = new PIXI.Graphics();
    canvas.stage.addChild(this.rotationIndicator);
  }

  private _updateRotationIndicator(mouseX: number, mouseY: number): void {
    if (!this.rotationIndicator || !this.selectedPosition) return;
    
    const PIXI = (window as any).PIXI;
    if (!PIXI) return;
    
    this.rotationIndicator.clear();
    
    try {
      this.rotationIndicator.circle(this.selectedPosition.x, this.selectedPosition.y, 10)
        .fill({ color: 0xff6b6b, alpha: 0.8 });
      
      this.rotationIndicator.moveTo(this.selectedPosition.x, this.selectedPosition.y)
        .lineTo(mouseX, mouseY)
        .stroke({ width: 3, color: 0xff6b6b, alpha: 0.8 });
    } catch {
      try {
        this.rotationIndicator.beginFill(0xff6b6b, 0.8);
        this.rotationIndicator.drawCircle(this.selectedPosition.x, this.selectedPosition.y, 10);
        this.rotationIndicator.endFill();
        
        this.rotationIndicator.lineStyle(3, 0xff6b6b, 0.8);
        this.rotationIndicator.moveTo(this.selectedPosition.x, this.selectedPosition.y);
        this.rotationIndicator.lineTo(mouseX, mouseY);
      } catch { /* give up */ }
    }
  }

  private _updateOverlayHint(text: string): void {
    if (!this.overlay) return;
    const hint = this.overlay.querySelector('.placement-hint');
    if (hint) {
      hint.innerHTML = `<i class="fas fa-crosshairs"></i> ${text}`;
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
    if (this.rotationIndicator && canvas?.stage) {
      try {
        canvas.stage.removeChild(this.rotationIndicator);
        this.rotationIndicator.destroy();
      } catch { /* ignore */ }
      this.rotationIndicator = null;
    }
    document.removeEventListener('keydown', this._boundKeyHandler);
  }
}
