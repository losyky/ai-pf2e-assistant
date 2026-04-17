import { MODULE_ID } from '../constants';
import type { MapTemplate, MapRotation, RoomType } from './types';
import type { MazeBlueprint, MazeBlueprintPlacement } from './maze-blueprint-types';
import { MazeBlueprintService } from './maze-blueprint-service';
import { MazeBuilderService } from './maze-builder-service';
import { MapTemplateService } from './map-template-service';
import { MapGuideImageService } from './map-guide-image-service';
import { MapRotationHelper } from './map-rotation-helper';
import { ROOM_TYPE_CONFIG, ROOM_TYPE_COLORS } from './maze-types';

declare const Application: any;
declare const foundry: any;
declare const ui: any;
declare const Handlebars: any;

export class MazeBlueprintEditorApp extends Application {
  private blueprint: MazeBlueprint;
  private selectedIdx: number = -1;
  private onSave: (() => void) | null;

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'maze-blueprint-editor',
      template: `modules/${MODULE_ID}/templates/maze-blueprint-editor.hbs`,
      width: 720,
      height: 560,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'maze-blueprint-editor-app'],
    });
  }

  get title(): string {
    return `编辑蓝图 — ${this.blueprint.name}`;
  }

  constructor(blueprint: MazeBlueprint, onSave?: () => void) {
    super();
    this.blueprint = JSON.parse(JSON.stringify(blueprint));
    this.onSave = onSave || null;

    if (typeof Handlebars?.registerHelper === 'function') {
      try {
        Handlebars.registerHelper('eq', function (a: any, b: any) { return a === b; });
      } catch { /* already registered */ }
    }
  }

  getData(): any {
    const templateService = MapTemplateService.getInstance();
    const selected = this.selectedIdx >= 0
      ? this.blueprint.placements[this.selectedIdx]
      : null;

    let selectedPosition: any = null;
    let roomTypes: any[] = [];
    let availableTemplates: any[] = [];

    if (selected) {
      const t = templateService.getById(selected.templateId);
      selectedPosition = {
        gridX: selected.gridX,
        gridY: selected.gridY,
        templateName: t?.name || '(未找到)',
        rotation: selected.rotation,
        roomType: t?.roomType || 'empty',
      };

      roomTypes = Object.entries(ROOM_TYPE_CONFIG).map(([id, cfg]) => ({
        id,
        label: cfg.label,
        icon: cfg.icon,
        selected: id === (t?.roomType || 'empty'),
      }));

      availableTemplates = this.blueprint.templateIds
        .map(tid => templateService.getById(tid))
        .filter((t2): t2 is MapTemplate => t2 !== null && t2.id !== selected.templateId)
        .map(t2 => ({ id: t2.id, name: t2.name }));
    }

    // Template usage stats
    const usageMap = new Map<string, number>();
    for (const p of this.blueprint.placements) {
      usageMap.set(p.templateId, (usageMap.get(p.templateId) || 0) + 1);
    }
    const templateList = this.blueprint.templateIds
      .map(tid => {
        const t = templateService.getById(tid);
        return {
          id: tid,
          name: t?.name || tid.slice(0, 8),
          usageCount: usageMap.get(tid) || 0,
        };
      });

    return {
      name: this.blueprint.name,
      description: this.blueprint.description,
      gridWidth: this.blueprint.gridWidth,
      gridHeight: this.blueprint.gridHeight,
      cellSize: this.blueprint.cellSize,
      placementCount: this.blueprint.placements.length,
      templateCount: this.blueprint.templateIds.length,
      selectedPosition,
      roomTypes,
      availableTemplates,
      templateList,
    };
  }

  toObject(): any {
    return { id: this.id, appId: this.appId };
  }

  activateListeners(html: any): void {
    super.activateListeners(html);

    html.find('input[name="blueprintName"]').on('change', (ev: any) => {
      this.blueprint.name = ev.target.value.trim() || this.blueprint.name;
    });
    html.find('input[name="blueprintDescription"]').on('change', (ev: any) => {
      this.blueprint.description = ev.target.value;
    });

    // Canvas click
    const cvs = html.find('#blueprint-editor-canvas')[0] as HTMLCanvasElement;
    if (cvs) {
      cvs.addEventListener('click', (ev: MouseEvent) => {
        this._onCanvasClick(ev, cvs);
      });
    }

    // Placement editing controls
    html.find('select[name="placementRotation"]').on('change', (ev: any) => {
      if (this.selectedIdx < 0) return;
      this.blueprint.placements[this.selectedIdx].rotation = parseInt(ev.target.value) as MapRotation;
      this.render(false);
    });

    html.find('select[name="roomType"]').on('change', (ev: any) => {
      if (this.selectedIdx < 0) return;
      const p = this.blueprint.placements[this.selectedIdx];
      const templateService = MapTemplateService.getInstance();
      const t = templateService.getById(p.templateId);
      if (t) {
        (t as any).roomType = ev.target.value as RoomType;
        templateService.save(t);
      }
      this.render(false);
    });

    html.find('select[name="swapTemplate"]').on('change', (ev: any) => {
      if (this.selectedIdx < 0 || !ev.target.value) return;
      this.blueprint.placements[this.selectedIdx].templateId = ev.target.value;
      this.render(false);
    });

    // Footer buttons
    html.find('.save-btn').on('click', () => this._onSave());
    html.find('.cancel-btn').on('click', () => this.close());

    // Render canvases after DOM ready
    requestAnimationFrame(() => {
      this._renderMazeCanvas(html);
      if (this.selectedIdx >= 0) {
        this._renderSelectedThumb(html);
      }
    });
  }

  // ------------------------------------------------------------------
  // Canvas interaction
  // ------------------------------------------------------------------

  private _onCanvasClick(ev: MouseEvent, cvs: HTMLCanvasElement): void {
    const rect = cvs.getBoundingClientRect();
    const scaleX = cvs.width / rect.width;
    const scaleY = cvs.height / rect.height;
    const mx = (ev.clientX - rect.left) * scaleX;
    const my = (ev.clientY - rect.top) * scaleY;

    const bp = this.blueprint;
    const N = bp.cellSize;
    const totalCols = bp.gridWidth * N;
    const totalRows = bp.gridHeight * N;
    const maxDim = 480;
    const cellPx = Math.floor(Math.min(maxDim / totalCols, maxDim / totalRows));
    const tilePxW = N * cellPx;
    const tilePxH = N * cellPx;

    const gx = Math.floor(mx / tilePxW);
    const gy = Math.floor(my / tilePxH);

    const idx = bp.placements.findIndex(p => p.gridX === gx && p.gridY === gy);
    if (idx >= 0) {
      this.selectedIdx = idx;
      this.render(false);
    }
  }

  // ------------------------------------------------------------------
  // Canvas rendering
  // ------------------------------------------------------------------

  private _renderMazeCanvas(html: any): void {
    const cvs = html.find('#blueprint-editor-canvas')[0] as HTMLCanvasElement;
    if (!cvs) return;

    const bp = this.blueprint;
    const templateService = MapTemplateService.getInstance();
    const guideService = MapGuideImageService.getInstance();
    const builderService = MazeBuilderService.getInstance();

    const N = bp.cellSize;
    const mid = Math.floor(N / 2);
    const totalCols = bp.gridWidth * N;
    const totalRows = bp.gridHeight * N;
    const maxDim = 480;
    const cellPx = Math.floor(Math.min(maxDim / totalCols, maxDim / totalRows));
    const tilePxW = N * cellPx;
    const tilePxH = N * cellPx;

    cvs.width = totalCols * cellPx;
    cvs.height = totalRows * cellPx;
    const ctx = cvs.getContext('2d')!;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, cvs.width, cvs.height);

    // Build placement grid for boundary passage detection
    const placementGrid = new Map<string, { cells: boolean[][]; roomType: string }>();
    const rotatedCache = new Map<string, MapTemplate>();

    for (const p of bp.placements) {
      const t = templateService.getById(p.templateId);
      if (!t) continue;
      const rotated = MapRotationHelper.rotateTemplate(t, p.rotation);
      placementGrid.set(`${p.gridX},${p.gridY}`, {
        cells: rotated.cells,
        roomType: t.roomType || 'empty',
      });
      rotatedCache.set(`${p.gridX},${p.gridY}`, rotated);
    }

    // Render tiles with passage-fixed walls
    for (let i = 0; i < bp.placements.length; i++) {
      const p = bp.placements[i];
      const t = templateService.getById(p.templateId);
      if (!t) continue;

      const rotated = rotatedCache.get(`${p.gridX},${p.gridY}`)!;
      const fixedWalls = builderService.fixWallsForPosition(
        rotated, p.gridX, p.gridY, placementGrid,
      );
      const fixedTemplate = { ...rotated, walls: fixedWalls };

      const tileCvs = guideService.renderToCanvas(
        fixedTemplate, rotated.gridCols * cellPx, rotated.gridRows * cellPx,
      );

      const dx = p.gridX * tilePxW;
      const dy = p.gridY * tilePxH;
      ctx.drawImage(tileCvs, dx, dy);

      // Selection highlight or grid outline
      if (i === this.selectedIdx) {
        ctx.strokeStyle = '#4361ee';
        ctx.lineWidth = 3;
        ctx.strokeRect(dx + 1, dy + 1, tilePxW - 2, tilePxH - 2);
      } else {
        ctx.strokeStyle = 'rgba(255,215,0,0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(dx, dy, tilePxW, tilePxH);
      }
    }

    // Connectivity overlay: lines between connected rooms
    const drawnEdges = new Set<string>();
    for (const p of bp.placements) {
      const myData = placementGrid.get(`${p.gridX},${p.gridY}`);
      if (!myData) continue;

      for (const nb of [{ dx: 1, dy: 0 }, { dx: 0, dy: 1 }]) {
        const nx = p.gridX + nb.dx;
        const ny = p.gridY + nb.dy;
        const edgeKey = `${p.gridX},${p.gridY}-${nx},${ny}`;
        if (drawnEdges.has(edgeKey)) continue;
        drawnEdges.add(edgeKey);

        const nData = placementGrid.get(`${nx},${ny}`);
        if (!nData) continue;

        let myOpen: boolean;
        let nbrOpen: boolean;
        if (nb.dx === 1) {
          myOpen = myData.cells[mid]?.[N - 1] ?? false;
          nbrOpen = nData.cells[mid]?.[0] ?? false;
        } else {
          myOpen = myData.cells[N - 1]?.[mid] ?? false;
          nbrOpen = nData.cells[0]?.[mid] ?? false;
        }

        if (myOpen && nbrOpen) {
          const fx = p.gridX * tilePxW + tilePxW / 2;
          const fy = p.gridY * tilePxH + tilePxH / 2;
          const tx = nx * tilePxW + tilePxW / 2;
          const ty = ny * tilePxH + tilePxH / 2;

          ctx.strokeStyle = '#FFD700';
          ctx.lineWidth = Math.max(2, cellPx * 0.3);
          ctx.globalAlpha = 0.5;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(fx, fy);
          ctx.lineTo(tx, ty);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }

    // Room type badges, rotation arrows, coord labels (drawn on top)
    for (let i = 0; i < bp.placements.length; i++) {
      const p = bp.placements[i];
      const t = templateService.getById(p.templateId);
      if (!t) continue;

      const dx = p.gridX * tilePxW;
      const dy = p.gridY * tilePxH;

      // Room type badge
      const roomType = (t.roomType || 'empty') as RoomType;
      const color = ROOM_TYPE_COLORS[roomType] || '#FFFFFF';
      const cx = dx + tilePxW / 2;
      const cy = dy + tilePxH / 2;
      const radius = Math.max(4, Math.min(tilePxW, tilePxH) * 0.15);

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.75;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 1;
      ctx.stroke();

      const label = ROOM_TYPE_CONFIG[roomType]?.label?.[0] || '?';
      ctx.fillStyle = '#000';
      ctx.font = `bold ${Math.max(7, radius)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, cy);

      // Rotation indicator
      const arrowSize = Math.max(4, tilePxW * 0.08);
      const arrowX = dx + tilePxW - arrowSize - 2;
      const arrowY = dy + 2;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = `${arrowSize + 2}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      const arrows = ['↑', '→', '↓', '←'];
      ctx.fillText(arrows[p.rotation / 90] || '↑', arrowX + arrowSize, arrowY);

      // Coord label
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = `${Math.max(7, cellPx * 0.5)}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${p.gridX},${p.gridY}`, dx + 2, dy + tilePxH - 2);
    }
  }

  private _renderSelectedThumb(html: any): void {
    const cvs = html.find('#selected-thumb-canvas')[0] as HTMLCanvasElement;
    if (!cvs || this.selectedIdx < 0) return;

    const p = this.blueprint.placements[this.selectedIdx];
    const templateService = MapTemplateService.getInstance();
    const guideService = MapGuideImageService.getInstance();
    const t = templateService.getById(p.templateId);
    if (!t) return;

    const rotated = MapRotationHelper.rotateTemplate(t, p.rotation);
    const size = 128;
    const cellPx = Math.floor(size / Math.max(rotated.gridCols, rotated.gridRows));
    const rendered = guideService.renderToCanvas(
      rotated, rotated.gridCols * cellPx, rotated.gridRows * cellPx,
    );

    cvs.width = size;
    cvs.height = size;
    const ctx = cvs.getContext('2d')!;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, size, size);
    const ox = Math.floor((size - rendered.width) / 2);
    const oy = Math.floor((size - rendered.height) / 2);
    ctx.drawImage(rendered, ox, oy);
  }

  // ------------------------------------------------------------------
  // Save
  // ------------------------------------------------------------------

  private async _onSave(): Promise<void> {
    try {
      const service = MazeBlueprintService.getInstance();
      await service.save(this.blueprint);
      ui.notifications.info(`蓝图「${this.blueprint.name}」已保存`);
      if (this.onSave) this.onSave();
      this.close();
    } catch (err: any) {
      ui.notifications.error(`保存失败: ${err.message || err}`);
    }
  }
}
