import { MODULE_ID } from '../constants';
import { RoomType } from './types';
import {
  MazeConfig,
  MazeLayout,
  ROOM_TYPE_CONFIG,
  createDefaultMazeConfig,
} from './maze-types';
import { MapTemplateService } from './map-template-service';
import { MazeBuilderService } from './maze-builder-service';

declare const Application: any;
declare const foundry: any;
declare const ui: any;
declare const canvas: any;
declare const Handlebars: any;

export class MazeConfigApp extends Application {
  private config: MazeConfig;
  private _lastLayout: MazeLayout | null = null;

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'maze-config',
      title: '迷宫构造器',
      template: `modules/${MODULE_ID}/templates/maze-config.hbs`,
      width: 620,
      height: 780,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'maze-config-app'],
    });
  }

  constructor(options?: any) {
    super(options);
    this.config = createDefaultMazeConfig();

    if (typeof Handlebars?.registerHelper === 'function') {
      try {
        Handlebars.registerHelper('eq', function (a: any, b: any) { return a === b; });
      } catch { /* already registered */ }
    }
  }

  getData(): any {
    const allRoomTypes = (Object.keys(ROOM_TYPE_CONFIG) as RoomType[]).map(rt => ({
      id: rt,
      label: ROOM_TYPE_CONFIG[rt].label,
    }));

    return {
      ...this.config,
      randomSeed: this.config.randomSeed ?? '',
      endpoints: this.config.endpoints.map(ep => ({
        ...ep,
        roomType: ep.roomType,
        maxDepth: ep.maxDepth ?? '',
      })),
      roomPool: this.config.roomPool.map(rp => ({
        ...rp,
        roomType: rp.roomType,
        maxCount: rp.maxCount ?? '',
      })),
      allRoomTypes,
    };
  }

  toObject(): any {
    return { id: this.id, appId: this.appId };
  }

  activateListeners(html: any): void {
    super.activateListeners(html);

    // Basic params
    html.find('input[name="mazeWidth"]').on('change', (ev: any) => {
      this.config.mazeWidth = parseInt(ev.target.value) || 5;
    });
    html.find('input[name="mazeHeight"]').on('change', (ev: any) => {
      this.config.mazeHeight = parseInt(ev.target.value) || 5;
    });
    html.find('input[name="entranceCount"]').on('change', (ev: any) => {
      this.config.entranceCount = parseInt(ev.target.value) || 1;
    });
    html.find('input[name="randomSeed"]').on('change', (ev: any) => {
      const v = ev.target.value.trim();
      this.config.randomSeed = v ? parseInt(v) : undefined;
    });

    // Advanced options
    html.find('input[name="allowRotation"]').on('change', (ev: any) => {
      this.config.allowRotation = ev.target.checked;
    });
    html.find('input[name="wallMergeEnabled"]').on('change', (ev: any) => {
      this.config.wallMergeEnabled = ev.target.checked;
    });
    html.find('input[name="branchingFactor"]').on('change', (ev: any) => {
      this.config.branchingFactor = parseFloat(ev.target.value) || 0;
    });
    html.find('input[name="deadEndRatio"]').on('change', (ev: any) => {
      this.config.deadEndRatio = parseFloat(ev.target.value) || 0;
    });
    html.find('input[name="loopChance"]').on('change', (ev: any) => {
      this.config.loopChance = parseFloat(ev.target.value) || 0;
    });
    html.find('input[name="corridorDensity"]').on('change', (ev: any) => {
      this.config.corridorDensity = parseFloat(ev.target.value) || 0;
    });
    html.find('input[name="maxSolveTimeMs"]').on('change', (ev: any) => {
      this.config.maxSolveTimeMs = parseInt(ev.target.value) || 10000;
    });

    // Endpoints
    this._bindEndpointListeners(html);
    html.find('.add-endpoint').on('click', () => {
      this.config.endpoints.push({ roomType: 'boss', count: 1, minDepth: 1 });
      this.render(false);
    });

    // Room pool
    this._bindPoolListeners(html);
    html.find('.add-pool').on('click', () => {
      this.config.roomPool.push({ roomType: 'empty', weight: 1 });
      this.render(false);
    });

    // Preview & Generate
    html.find('.maze-preview-btn').on('click', () => this._onPreview());
    html.find('.maze-generate-btn').on('click', () => this._onGenerate());
  }

  // ------------------------------------------------------------------
  // Dynamic list bindings
  // ------------------------------------------------------------------

  private _bindEndpointListeners(html: any): void {
    for (let i = 0; i < this.config.endpoints.length; i++) {
      html.find(`select[name="ep-type-${i}"]`).on('change', (ev: any) => {
        this.config.endpoints[i].roomType = ev.target.value as RoomType;
      });
      html.find(`input[name="ep-count-${i}"]`).on('change', (ev: any) => {
        this.config.endpoints[i].count = parseInt(ev.target.value) || 1;
      });
      html.find(`input[name="ep-minDepth-${i}"]`).on('change', (ev: any) => {
        this.config.endpoints[i].minDepth = parseInt(ev.target.value) || 0;
      });
      html.find(`input[name="ep-maxDepth-${i}"]`).on('change', (ev: any) => {
        const v = ev.target.value.trim();
        this.config.endpoints[i].maxDepth = v ? parseInt(v) : undefined;
      });
    }
    html.find('.remove-endpoint').on('click', (ev: any) => {
      const idx = parseInt(ev.currentTarget.dataset.idx);
      this.config.endpoints.splice(idx, 1);
      this.render(false);
    });
  }

  private _bindPoolListeners(html: any): void {
    for (let i = 0; i < this.config.roomPool.length; i++) {
      html.find(`select[name="rp-type-${i}"]`).on('change', (ev: any) => {
        this.config.roomPool[i].roomType = ev.target.value as RoomType;
      });
      html.find(`input[name="rp-weight-${i}"]`).on('change', (ev: any) => {
        this.config.roomPool[i].weight = parseFloat(ev.target.value) || 1;
      });
      html.find(`input[name="rp-max-${i}"]`).on('change', (ev: any) => {
        const v = ev.target.value.trim();
        this.config.roomPool[i].maxCount = v ? parseInt(v) : undefined;
      });
    }
    html.find('.remove-pool').on('click', (ev: any) => {
      const idx = parseInt(ev.currentTarget.dataset.idx);
      this.config.roomPool.splice(idx, 1);
      this.render(false);
    });
  }

  // ------------------------------------------------------------------
  // Preview
  // ------------------------------------------------------------------

  private _onPreview(): void {
    const service = MazeBuilderService.getInstance();
    const templates = MapTemplateService.getInstance().getAll();
    if (templates.length === 0) {
      ui.notifications.warn('没有可用的地图模板，请先创建模板。');
      return;
    }

    const layout = service.solveLayout(this.config, templates);
    if (!layout) {
      ui.notifications.warn('迷宫求解失败，请调整参数或增加模板。');
      return;
    }

    this._lastLayout = layout;

    const previewCanvas = this.element?.find('#maze-preview-canvas')[0] as HTMLCanvasElement;
    if (!previewCanvas) return;

    const rendered = service.renderPreview(layout, templates, 400);
    previewCanvas.width = rendered.width;
    previewCanvas.height = rendered.height;
    const ctx = previewCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    ctx.drawImage(rendered, 0, 0);

    const hint = this.element?.find('#maze-preview-hint');
    if (hint?.length) {
      hint.text(`布局: ${layout.placements.length} 个图块, ${layout.entranceIndices.length} 个入口`);
    }
  }

  // ------------------------------------------------------------------
  // Generate
  // ------------------------------------------------------------------

  private async _onGenerate(): Promise<void> {
    const scene = canvas?.scene;
    if (!scene) {
      ui.notifications.error('没有活动场景');
      return;
    }

    const templates = MapTemplateService.getInstance().getAll();
    if (templates.length === 0) {
      ui.notifications.warn('没有可用的地图模板，请先创建模板。');
      return;
    }

    // Use viewport centre as origin
    const originX = this._getViewportCenterX();
    const originY = this._getViewportCenterY();

    const service = MazeBuilderService.getInstance();
    const result = await service.buildAndPlace(this.config, originX, originY, templates);
    if (result) {
      ui.notifications.info(`迷宫已生成: ${result.tileIds.length} 图块, ${result.wallCount} 墙壁`);
    }
  }

  private _getViewportCenterX(): number {
    try {
      const stage = canvas?.stage;
      if (stage?.worldTransform) {
        const wt = stage.worldTransform;
        return (window.innerWidth / 2 - wt.tx) / wt.a;
      }
    } catch { /* fallback */ }
    return 0;
  }

  private _getViewportCenterY(): number {
    try {
      const stage = canvas?.stage;
      if (stage?.worldTransform) {
        const wt = stage.worldTransform;
        return (window.innerHeight / 2 - wt.ty) / wt.d;
      }
    } catch { /* fallback */ }
    return 0;
  }

  // ------------------------------------------------------------------
  // Static open helper
  // ------------------------------------------------------------------

  private static _instance: MazeConfigApp | null = null;

  static open(): void {
    if (MazeConfigApp._instance) {
      MazeConfigApp._instance.render(true);
    } else {
      MazeConfigApp._instance = new MazeConfigApp();
      MazeConfigApp._instance.render(true);
    }
  }
}
