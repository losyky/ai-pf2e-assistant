import { MODULE_ID, MAP_SIZE_PRESETS } from '../constants';
import { MapTemplate, MapWallSegment, MapWallType, WALL_TYPE_CONFIG, RoomType, RoomRarity } from './types';
import { ROOM_TYPE_CONFIG, ROOM_RARITY_CONFIG } from './maze-types';
import { MapTemplateService } from './map-template-service';
import { MapGuideImageService } from './map-guide-image-service';

declare const Application: any;
declare const foundry: any;
declare const ui: any;

const MAX_CANVAS_DIM = 640;
const WALL_TYPE_ORDER: MapWallType[] = ['normal', 'door', 'secret-door', 'ethereal', 'invisible', 'window'];

type EditorMode = 'cell' | 'wall';

const templateStore = new Map<string, MapTemplate>();
let nextInstanceId = 1;

export class MapTemplateEditorApp extends Application {
  private readonly _instanceId: string;
  private mode: EditorMode = 'cell';
  private currentWallType: MapWallType = 'normal';
  private editorCanvas: HTMLCanvasElement | null = null;
  private previewCanvas: HTMLCanvasElement | null = null;
  private isDragging = false;
  private dragValue: boolean | null = null;
  private onSaveCallback: ((template: MapTemplate) => void) | null;
  private cellPx = 32;

  private get templateData(): MapTemplate {
    const data = templateStore.get(this._instanceId);
    if (!data) {
      console.error('[MapTemplateEditorApp] templateStore.get(_instanceId) 返回 undefined!', this._instanceId, this);
      throw new Error('模板数据未初始化');
    }
    return data;
  }

  private set templateData(value: MapTemplate) {
    templateStore.set(this._instanceId, value);
  }

  private get cols(): number { return this.templateData.gridCols; }
  private get rows(): number { return this.templateData.gridRows; }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'map-template-editor',
      template: `modules/${MODULE_ID}/templates/map-template-editor.hbs`,
      width: 960,
      height: 780,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'map-template-editor-app'],
    });
  }

  get title(): string {
    return `地图模板编辑器 - ${this.templateData.name}`;
  }

  constructor(template?: MapTemplate, onSave?: (template: MapTemplate) => void) {
    super();
    this._instanceId = `map-editor-${nextInstanceId++}`;
    const t = template
      ? JSON.parse(JSON.stringify(template))
      : MapTemplateService.getInstance().createEmpty();
    templateStore.set(this._instanceId, t);
    this.onSaveCallback = onSave || null;
  }

  getData(): any {
    const t = this.templateData;
    const currentPresetId = MAP_SIZE_PRESETS.find(
      p => p.gridCols === t.gridCols && p.gridRows === t.gridRows
    )?.id ?? 'custom';

    return {
      templateName: t.templateName ?? t.name,
      templateDesc: t.description,
      isCellMode: this.mode === 'cell',
      isWallMode: this.mode === 'wall',
      sizePresets: MAP_SIZE_PRESETS.map(p => ({
        ...p,
        selected: p.id === currentPresetId,
      })),
      currentPresetId,
      gridInfo: `${t.gridCols}×${t.gridRows} (${t.gridCols * 128}×${t.gridRows * 128}px)`,
      wallTypes: WALL_TYPE_ORDER.map(wt => ({
        id: wt,
        label: WALL_TYPE_CONFIG[wt].label,
        color: WALL_TYPE_CONFIG[wt].editorColor,
        selected: wt === this.currentWallType,
      })),
      currentWallType: this.currentWallType,
      roomTypes: (Object.keys(ROOM_TYPE_CONFIG) as RoomType[]).map(rt => ({
        id: rt,
        label: ROOM_TYPE_CONFIG[rt].label,
        selected: rt === (t.roomType || 'empty'),
      })),
      rarities: (Object.keys(ROOM_RARITY_CONFIG) as RoomRarity[]).map(r => ({
        id: r,
        label: ROOM_RARITY_CONFIG[r].label,
        selected: r === (t.rarity || 'common'),
      })),
      roomTagsStr: (t.roomTags || []).join(', '),
    };
  }

  toObject(): any {
    return { id: this.id, appId: this.appId };
  }

  activateListeners(html: any): void {
    super.activateListeners(html);

    this.editorCanvas = html.find('#map-editor-canvas')[0] as HTMLCanvasElement;
    this.previewCanvas = html.find('#map-preview-canvas')[0] as HTMLCanvasElement;

    this._updateCanvasSize();

    this.editorCanvas.addEventListener('mousedown', this._onCanvasMouseDown.bind(this));
    this.editorCanvas.addEventListener('mousemove', this._onCanvasMouseMove.bind(this));
    this.editorCanvas.addEventListener('mouseup', this._onCanvasMouseUp.bind(this));
    this.editorCanvas.addEventListener('mouseleave', this._onCanvasMouseUp.bind(this));
    this.editorCanvas.addEventListener('contextmenu', this._onCanvasRightClick.bind(this));

    html.find('.mode-btn').on('click', (ev: any) => {
      this.mode = ev.currentTarget.dataset.mode as EditorMode;
      html.find('.mode-btn').removeClass('active');
      (ev.currentTarget as HTMLElement).classList.add('active');
    });

    html.find('select[name="wallType"]').on('change', (ev: any) => {
      this.currentWallType = ev.target.value as MapWallType;
    });

    html.find('.action-btn').on('click', (ev: any) => {
      this._handleAction(ev.currentTarget.dataset.action!);
    });

    html.find('.save-btn').on('click', () => this._onSave());
    html.find('.cancel-btn').on('click', () => this.close());

    html.find('input[name="templateName"]').on('change', (ev: any) => {
      this.templateData.name = (ev.target as HTMLInputElement).value;
    });
    html.find('input[name="templateDesc"]').on('change', (ev: any) => {
      this.templateData.description = (ev.target as HTMLInputElement).value;
    });

    html.find('select[name="sizePreset"]').on('change', (ev: any) => {
      this._onSizePresetChange(ev.target.value);
    });

    html.find('select[name="roomType"]').on('change', (ev: any) => {
      this.templateData.roomType = ev.target.value as RoomType;
    });
    html.find('select[name="rarity"]').on('change', (ev: any) => {
      this.templateData.rarity = ev.target.value as RoomRarity;
    });
    html.find('input[name="roomTags"]').on('change', (ev: any) => {
      const raw = (ev.target as HTMLInputElement).value;
      this.templateData.roomTags = raw.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean);
    });

    this._drawEditor();
    this._drawPreview();
  }

  // ========================================
  // Size preset
  // ========================================

  private _onSizePresetChange(presetId: string): void {
    const preset = MAP_SIZE_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    const service = MapTemplateService.getInstance();
    service.resizeTemplate(this.templateData, preset.gridCols, preset.gridRows);
    this._updateCanvasSize();
    this._drawEditor();
    this._drawPreview();

    const infoEl = this.element?.find?.('.grid-info');
    if (infoEl?.length) {
      infoEl.text(`${preset.gridCols}×${preset.gridRows} (${preset.pixelWidth}×${preset.pixelHeight}px)`);
    }
  }

  private _updateCanvasSize(): void {
    if (!this.editorCanvas) return;
    const cols = this.cols;
    const rows = this.rows;
    this.cellPx = Math.floor(Math.min(MAX_CANVAS_DIM / cols, MAX_CANVAS_DIM / rows));
    if (this.cellPx < 8) this.cellPx = 8;
    const w = cols * this.cellPx;
    const h = rows * this.cellPx;
    this.editorCanvas.width = w;
    this.editorCanvas.height = h;
    this.editorCanvas.style.width = `${w}px`;
    this.editorCanvas.style.height = `${h}px`;
  }

  // ========================================
  // Canvas interaction
  // ========================================

  private _onCanvasMouseDown(ev: MouseEvent): void {
    const { col, row } = this._canvasToGrid(ev);
    if (col < 0 || row < 0) return;

    if (this.mode === 'cell') {
      this.isDragging = true;
      this.dragValue = !this.templateData.cells[row][col];
      this.templateData.cells[row][col] = this.dragValue;
      this._drawEditor();
      this._drawPreview();
    } else if (this.mode === 'wall') {
      this._toggleWallAtMouse(ev);
    }
  }

  private _onCanvasMouseMove(ev: MouseEvent): void {
    if (!this.isDragging || this.mode !== 'cell') return;
    const { col, row } = this._canvasToGrid(ev);
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    if (this.dragValue !== null) {
      this.templateData.cells[row][col] = this.dragValue;
      this._drawEditor();
      this._drawPreview();
    }
  }

  private _onCanvasMouseUp(_ev: MouseEvent): void {
    this.isDragging = false;
    this.dragValue = null;
  }

  private _canvasToGrid(ev: MouseEvent): { col: number; row: number } {
    const rect = this.editorCanvas!.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    return {
      col: Math.floor(x / this.cellPx),
      row: Math.floor(y / this.cellPx),
    };
  }

  private _toggleWallAtMouse(ev: MouseEvent): void {
    const rect = this.editorCanvas!.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;

    const seg = this._detectEdge(x, y);
    if (!seg) return;

    const idx = this._findWall(seg);
    if (idx >= 0) {
      this.templateData.walls.splice(idx, 1);
    } else {
      seg.wallType = this.currentWallType;
      this.templateData.walls.push(seg);
    }
    this._drawEditor();
    this._drawPreview();
  }

  private _onCanvasRightClick(ev: MouseEvent): void {
    if (this.mode !== 'wall') return;
    ev.preventDefault();
    const rect = this.editorCanvas!.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;

    const seg = this._detectEdge(x, y);
    if (!seg) return;

    const idx = this._findWall(seg);
    if (idx < 0) return;

    const wall = this.templateData.walls[idx];
    const curType = wall.wallType || 'normal';
    const curIdx = WALL_TYPE_ORDER.indexOf(curType);
    wall.wallType = WALL_TYPE_ORDER[(curIdx + 1) % WALL_TYPE_ORDER.length];
    this._drawEditor();
    this._drawPreview();
  }

  private _detectEdge(px: number, py: number): MapWallSegment | null {
    const threshold = 6;
    const gx = px / this.cellPx;
    const gy = py / this.cellPx;

    const nearCol = Math.round(gx);
    const nearRow = Math.round(gy);
    const fracX = Math.abs(gx - nearCol) * this.cellPx;
    const fracY = Math.abs(gy - nearRow) * this.cellPx;

    if (fracX < threshold && nearCol >= 0 && nearCol <= this.cols) {
      const rowStart = Math.floor(gy);
      if (rowStart >= 0 && rowStart < this.rows) {
        return { x1: nearCol, y1: rowStart, x2: nearCol, y2: rowStart + 1 };
      }
    }
    if (fracY < threshold && nearRow >= 0 && nearRow <= this.rows) {
      const colStart = Math.floor(gx);
      if (colStart >= 0 && colStart < this.cols) {
        return { x1: colStart, y1: nearRow, x2: colStart + 1, y2: nearRow };
      }
    }
    return null;
  }

  /**
   * Find a wall segment at the given edge, checking both directions.
   * For merged walls that span multiple cells, also checks if the edge falls
   * within a longer segment on the same axis.
   */
  private _findWall(seg: MapWallSegment): number {
    // Exact single-cell match first
    const exact = this.templateData.walls.findIndex(w =>
      (w.x1 === seg.x1 && w.y1 === seg.y1 && w.x2 === seg.x2 && w.y2 === seg.y2) ||
      (w.x1 === seg.x2 && w.y1 === seg.y2 && w.x2 === seg.x1 && w.y2 === seg.y1)
    );
    if (exact >= 0) return exact;

    // Check if edge lies within a longer merged wall
    return this.templateData.walls.findIndex(w => {
      if (seg.y1 === seg.y2 && w.y1 === w.y2 && w.y1 === seg.y1) {
        const wMin = Math.min(w.x1, w.x2);
        const wMax = Math.max(w.x1, w.x2);
        const sMin = Math.min(seg.x1, seg.x2);
        const sMax = Math.max(seg.x1, seg.x2);
        return sMin >= wMin && sMax <= wMax;
      }
      if (seg.x1 === seg.x2 && w.x1 === w.x2 && w.x1 === seg.x1) {
        const wMin = Math.min(w.y1, w.y2);
        const wMax = Math.max(w.y1, w.y2);
        const sMin = Math.min(seg.y1, seg.y2);
        const sMax = Math.max(seg.y1, seg.y2);
        return sMin >= wMin && sMax <= wMax;
      }
      return false;
    });
  }

  // ========================================
  // Drawing
  // ========================================

  private _drawEditor(): void {
    if (!this.editorCanvas) return;
    const ctx = this.editorCanvas.getContext('2d')!;
    const w = this.editorCanvas.width;
    const h = this.editorCanvas.height;
    ctx.clearRect(0, 0, w, h);

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        ctx.fillStyle = this.templateData.cells[r]?.[c] ? '#d4d4d4' : '#2a2a2a';
        ctx.fillRect(c * this.cellPx, r * this.cellPx, this.cellPx, this.cellPx);
      }
    }

    ctx.strokeStyle = '#555';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= this.cols; i++) {
      ctx.beginPath();
      ctx.moveTo(i * this.cellPx, 0);
      ctx.lineTo(i * this.cellPx, h);
      ctx.stroke();
    }
    for (let i = 0; i <= this.rows; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * this.cellPx);
      ctx.lineTo(w, i * this.cellPx);
      ctx.stroke();
    }

    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const wall of this.templateData.walls) {
      const cfg = WALL_TYPE_CONFIG[wall.wallType || 'normal'];
      ctx.strokeStyle = cfg.editorColor;
      ctx.setLineDash(cfg.editorDash);
      ctx.beginPath();
      ctx.moveTo(wall.x1 * this.cellPx, wall.y1 * this.cellPx);
      ctx.lineTo(wall.x2 * this.cellPx, wall.y2 * this.cellPx);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  private _drawPreview(): void {
    if (!this.previewCanvas) return;
    const guideService = MapGuideImageService.getInstance();
    const maxDim = 256;
    const cols = this.cols;
    const rows = this.rows;
    const scale = maxDim / Math.max(cols, rows);
    const pw = Math.round(cols * scale);
    const ph = Math.round(rows * scale);
    this.previewCanvas.width = pw;
    this.previewCanvas.height = ph;
    this.previewCanvas.style.width = `${pw}px`;
    this.previewCanvas.style.height = `${ph}px`;
    const guideCanvas = guideService.renderToCanvas(this.templateData, pw, ph);
    const ctx = this.previewCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, pw, ph);
    ctx.drawImage(guideCanvas, 0, 0);
  }

  // ========================================
  // Actions
  // ========================================

  private _handleAction(action: string): void {
    const service = MapTemplateService.getInstance();
    switch (action) {
      case 'fill-all':
        for (let r = 0; r < this.rows; r++)
          for (let c = 0; c < this.cols; c++)
            this.templateData.cells[r][c] = true;
        break;
      case 'clear-all':
        for (let r = 0; r < this.rows; r++)
          for (let c = 0; c < this.cols; c++)
            this.templateData.cells[r][c] = false;
        break;
      case 'auto-walls':
        this.templateData.walls = service.autoGenerateWalls(this.templateData);
        break;
      case 'clear-walls':
        this.templateData.walls = [];
        break;
      case 'export':
        this._exportTemplate();
        return;
      case 'import':
        this._importTemplate();
        return;
    }
    this._drawEditor();
    this._drawPreview();
  }

  private _exportTemplate(): void {
    const service = MapTemplateService.getInstance();
    const json = service.exportToJSON(this.templateData);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `map-template-${this.templateData.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private _importTemplate(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const service = MapTemplateService.getInstance();
        const imported = service.importFromJSON(text);
        this.templateData.cells = imported.cells;
        this.templateData.walls = imported.walls;
        this.templateData.name = imported.name;
        this.templateData.description = imported.description;
        this.templateData.gridCols = imported.gridCols;
        this.templateData.gridRows = imported.gridRows;
        this.templateData.roomType = imported.roomType;
        this.templateData.rarity = imported.rarity;
        this.templateData.roomTags = imported.roomTags;
        this._updateCanvasSize();
        this._drawEditor();
        this._drawPreview();
        this.render(false);
        ui.notifications.info('模板导入成功');
      } catch (e: any) {
        ui.notifications.error(`导入失败: ${e.message}`);
      }
    };
    input.click();
  }

  private async _onSave(): Promise<void> {
    if (!this.templateData.name.trim()) {
      ui.notifications.warn('请输入模板名称');
      return;
    }
    try {
      const service = MapTemplateService.getInstance();
      await service.save(this.templateData);
      ui.notifications.info(`模板「${this.templateData.name}」已保存`);
      if (this.onSaveCallback) {
        this.onSaveCallback(this.templateData);
      }
      this.close();
    } catch (e: any) {
      ui.notifications.error(`保存失败: ${e.message}`);
    }
  }

  async close(options?: any): Promise<void> {
    templateStore.delete(this._instanceId);
    return super.close(options);
  }
}
