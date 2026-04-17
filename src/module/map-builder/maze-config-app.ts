import { MODULE_ID } from '../constants';
import type { AIService } from '../services/ai-service';
import type { MapTemplate } from './types';
import type {
  MazeAIConfig,
  MazeAIGenerationResult,
  MazeBlueprint,
} from './maze-blueprint-types';
import { createDefaultMazeAIConfig, MAZE_TEMPLATE_SIZE_OPTIONS } from './maze-blueprint-types';
import { MazeAIService } from './maze-ai-service';
import { MazeBlueprintService } from './maze-blueprint-service';
import { MazeBuilderService } from './maze-builder-service';
import { MapTemplateService } from './map-template-service';
import { MapGuideImageService } from './map-guide-image-service';
import { MapRotationHelper } from './map-rotation-helper';
import { MazePlacementPreview } from './maze-placement-preview';
import { ROOM_TYPE_COLORS, ROOM_TYPE_CONFIG } from './maze-types';
import type { RoomType } from './types';

declare const Application: any;
declare const foundry: any;
declare const ui: any;
declare const canvas: any;
declare const Handlebars: any;

export class MazeConfigApp extends Application {
  private config: MazeAIConfig;
  private mazeDescription: string = '';
  private modifyDescription: string = '';
  private blueprintName: string = '';
  private isGenerating: boolean = false;

  private currentResult: MazeAIGenerationResult | null = null;
  private currentBlueprint: MazeBlueprint | null = null;
  private connectivityWarnings: number = 0;
  private reasoning: string = '';

  private mazeAIService: MazeAIService | null = null;

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'maze-config',
      title: '迷宫构造器 (AI)',
      template: `modules/${MODULE_ID}/templates/maze-config.hbs`,
      width: 520,
      height: 'auto' as any,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'maze-config-app'],
    });
  }

  constructor(options?: any) {
    super(options);
    this.config = createDefaultMazeAIConfig();

    if (typeof Handlebars?.registerHelper === 'function') {
      try {
        Handlebars.registerHelper('eq', function (a: any, b: any) { return a === b; });
      } catch { /* already registered */ }
    }
  }

  setAIService(aiService: AIService): void {
    this.mazeAIService = new MazeAIService(aiService);
  }

  getData(): any {
    const templateCards = this._buildTemplateCards();

    return {
      config: this.config,
      mazeDescription: this.mazeDescription,
      isGenerating: this.isGenerating,
      hasResult: this.currentResult !== null,
      reasoning: this.reasoning,
      templateCards,
      templateSizeOptions: MAZE_TEMPLATE_SIZE_OPTIONS.map(opt => ({
        ...opt,
        selected: opt.cellSize === this.config.templateCellSize,
      })),
      previewHint: this.currentBlueprint
        ? `${this.currentBlueprint.gridWidth}×${this.currentBlueprint.gridHeight}, ${this.currentBlueprint.placements.length} 图块`
        : '',
      connectivityWarnings: this.connectivityWarnings > 0 ? this.connectivityWarnings : 0,
      blueprintName: this.blueprintName,
    };
  }

  private _buildTemplateCards(): Array<{
    name: string; typeLabel: string; typeColor: string; templateId: string;
  }> {
    if (!this.currentResult || !this.currentBlueprint || !this.mazeAIService) return [];

    const templateService = MapTemplateService.getInstance();
    const cards: Array<{ name: string; typeLabel: string; typeColor: string; templateId: string }> = [];

    for (const tDef of this.currentResult.templates) {
      const rt = (tDef.roomType || 'empty') as RoomType;
      const matchId = this.currentBlueprint.templateIds.find(tid => {
        const t = this.mazeAIService!.getPendingTemplate(tid) || templateService.getById(tid);
        return t?.name?.includes(tDef.name);
      });
      cards.push({
        name: tDef.name,
        typeLabel: ROOM_TYPE_CONFIG[rt]?.label || rt,
        typeColor: ROOM_TYPE_COLORS[rt] || '#AAAAAA',
        templateId: matchId || '',
      });
    }
    return cards;
  }

  toObject(): any {
    return { id: this.id, appId: this.appId };
  }

  activateListeners(html: any): void {
    super.activateListeners(html);

    // Prompt input
    html.find('textarea[name="mazeDescription"]').on('input', (ev: any) => {
      this.mazeDescription = ev.target.value;
    });
    html.find('.maze-generate-btn').on('click', () => this._onGenerate());

    // Advanced toggle
    html.find('.maze-advanced-toggle').on('click', () => {
      const panel = html.find('.maze-advanced-panel');
      panel.slideToggle(150);
    });

    // Advanced config fields
    html.find('input[name="mazeWidth"]').on('change', (ev: any) => {
      this.config.mazeWidth = Math.max(2, Math.min(10, parseInt(ev.target.value) || 4));
    });
    html.find('input[name="mazeHeight"]').on('change', (ev: any) => {
      this.config.mazeHeight = Math.max(2, Math.min(10, parseInt(ev.target.value) || 4));
    });
    html.find('select[name="templateCellSize"]').on('change', (ev: any) => {
      this.config.templateCellSize = parseInt(ev.target.value) || 3;
    });
    html.find('input[name="wallMergeEnabled"]').on('change', (ev: any) => {
      this.config.wallMergeEnabled = ev.target.checked;
    });

    // Modify
    html.find('textarea[name="modifyDescription"]').on('input', (ev: any) => {
      this.modifyDescription = ev.target.value;
    });
    html.find('.maze-modify-btn').on('click', () => this._onModify());

    // Save / Place
    html.find('input[name="blueprintName"]').on('change', (ev: any) => {
      this.blueprintName = ev.target.value.trim();
    });
    html.find('.maze-save-btn').on('click', () => this._onSave());
    html.find('.maze-place-btn').on('click', () => this._onPlace());

    // Render canvases after DOM is ready
    if (this.currentResult && this.currentBlueprint) {
      requestAnimationFrame(() => {
        this._renderTemplateThumbnails(html);
        this._renderMazePreview(html);
      });
    }
  }

  // ------------------------------------------------------------------
  // Generate
  // ------------------------------------------------------------------

  private async _onGenerate(): Promise<void> {
    if (!this.mazeAIService) {
      ui.notifications.error('AI 服务未初始化，请检查 API 配置');
      return;
    }
    if (!this.mazeDescription.trim()) {
      ui.notifications.warn('请输入迷宫描述');
      return;
    }

    this.isGenerating = true;
    this.render(false);

    try {
      const result = await this.mazeAIService.generate(
        this.mazeDescription,
        this.config,
      );

      this.currentResult = result;
      this.reasoning = result.reasoning || '';

      const blueprint = await this.mazeAIService.materialize(
        result,
        this.config,
        this.blueprintName || '新迷宫',
        this.mazeDescription,
      );
      this.currentBlueprint = blueprint;

      const issues = this.mazeAIService.validateConnectivity(blueprint);
      this.connectivityWarnings = issues.length;

      if (!this.blueprintName) {
        this.blueprintName = blueprint.name;
      }

      ui.notifications.info(
        `迷宫生成完成: ${result.templates.length} 种模板, ${result.layout.placements.length} 个放置`,
      );
    } catch (err: any) {
      console.error('[MazeConfigApp] Generation failed:', err);
      ui.notifications.error(`迷宫生成失败: ${err.message || err}`);
    } finally {
      this.isGenerating = false;
      this.render(false);
    }
  }

  // ------------------------------------------------------------------
  // Modify
  // ------------------------------------------------------------------

  private async _onModify(): Promise<void> {
    if (!this.mazeAIService || !this.currentResult) {
      ui.notifications.warn('请先生成迷宫');
      return;
    }
    if (!this.modifyDescription.trim()) {
      ui.notifications.warn('请输入修改要求');
      return;
    }

    this.isGenerating = true;
    this.render(false);

    try {
      const result = await this.mazeAIService.modify(
        this.modifyDescription,
        this.currentResult,
        this.config,
      );

      this.currentResult = result;
      this.reasoning = result.reasoning || '';

      const blueprint = await this.mazeAIService.materialize(
        result,
        this.config,
        this.blueprintName || '新迷宫',
        this.mazeDescription,
      );
      this.currentBlueprint = blueprint;

      const issues = this.mazeAIService.validateConnectivity(blueprint);
      this.connectivityWarnings = issues.length;

      this.modifyDescription = '';
      ui.notifications.info('迷宫修改完成');
    } catch (err: any) {
      console.error('[MazeConfigApp] Modify failed:', err);
      ui.notifications.error(`迷宫修改失败: ${err.message || err}`);
    } finally {
      this.isGenerating = false;
      this.render(false);
    }
  }

  // ------------------------------------------------------------------
  // Save
  // ------------------------------------------------------------------

  private async _onSave(): Promise<void> {
    if (!this.currentBlueprint) {
      ui.notifications.warn('没有可保存的迷宫');
      return;
    }

    const bp = { ...this.currentBlueprint };
    if (this.blueprintName.trim()) {
      bp.name = this.blueprintName.trim();
    }

    try {
      if (this.mazeAIService) {
        const committed = await this.mazeAIService.commitPendingTemplates();
        if (committed > 0) {
          console.log(`[MazeConfigApp] Committed ${committed} templates to storage`);
        }
      }
      const service = MazeBlueprintService.getInstance();
      await service.save(bp);
      ui.notifications.info(`蓝图「${bp.name}」已保存（含 ${bp.templateIds.length} 个模板）`);
    } catch (err: any) {
      ui.notifications.error(`保存失败: ${err.message || err}`);
    }
  }

  // ------------------------------------------------------------------
  // Place
  // ------------------------------------------------------------------

  private async _onPlace(): Promise<void> {
    if (!this.currentBlueprint) {
      ui.notifications.warn('没有可放置的迷宫');
      return;
    }
    const scene = canvas?.scene;
    if (!scene) {
      ui.notifications.error('没有活动场景');
      return;
    }

    try {
      if (this.mazeAIService) {
        await this.mazeAIService.commitPendingTemplates();
      }

      const pendingProvider = this.mazeAIService
        ? (id: string) => this.mazeAIService!.getPendingTemplate(id)
        : undefined;
      const preview = new MazePlacementPreview(this.currentBlueprint, pendingProvider);
      const placement = await preview.start();
      if (!placement) {
        ui.notifications.info('已取消放置');
        return;
      }

      const builderService = MazeBuilderService.getInstance();
      const result = await builderService.placeBlueprint(
        this.currentBlueprint,
        placement.originX,
        placement.originY,
      );
      if (result) {
        ui.notifications.info(
          `迷宫已放置: ${result.tileIds.length} 图块, ${result.wallCount} 墙壁`,
        );
      }
    } catch (err: any) {
      ui.notifications.error(`放置失败: ${err.message || err}`);
    }
  }

  // ------------------------------------------------------------------
  // Canvas rendering
  // ------------------------------------------------------------------

  private _renderTemplateThumbnails(html: any): void {
    if (!this.currentBlueprint || !this.mazeAIService) return;
    const templateService = MapTemplateService.getInstance();
    const guideService = MapGuideImageService.getInstance();
    const cards = this._buildTemplateCards();

    html.find('.maze-tpl-thumb').each((_: number, cvs: HTMLCanvasElement) => {
      const idx = parseInt(cvs.dataset.tplIdx || '0');
      const card = cards[idx];
      if (!card?.templateId) return;

      const t = this.mazeAIService!.getPendingTemplate(card.templateId) || templateService.getById(card.templateId);
      if (!t) return;

      const thumbSize = 80;
      const cellPx = Math.floor(thumbSize / Math.max(t.gridCols, t.gridRows));
      const rendered = guideService.renderToCanvas(t, t.gridCols * cellPx, t.gridRows * cellPx);

      cvs.width = thumbSize;
      cvs.height = thumbSize;
      const ctx = cvs.getContext('2d')!;
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, thumbSize, thumbSize);
      const ox = Math.floor((thumbSize - rendered.width) / 2);
      const oy = Math.floor((thumbSize - rendered.height) / 2);
      ctx.drawImage(rendered, ox, oy);
    });
  }

  private _renderMazePreview(html: any): void {
    if (!this.currentBlueprint || !this.mazeAIService) return;

    const previewCanvas = html.find('#maze-preview-canvas')[0] as HTMLCanvasElement;
    if (!previewCanvas) return;

    const bp = this.currentBlueprint;
    const templateService = MapTemplateService.getInstance();
    const guideService = MapGuideImageService.getInstance();
    const builderService = MazeBuilderService.getInstance();

    const templates = bp.templateIds
      .map(id => this.mazeAIService!.getPendingTemplate(id) || templateService.getById(id))
      .filter((t): t is MapTemplate => t !== null);
    if (templates.length === 0) return;

    const N = bp.cellSize;
    const mid = Math.floor(N / 2);
    const totalCols = bp.gridWidth * N;
    const totalRows = bp.gridHeight * N;
    const maxDim = 480;
    const cellPx = Math.floor(Math.min(maxDim / totalCols, maxDim / totalRows));
    const tilePxW = N * cellPx;
    const tilePxH = N * cellPx;

    previewCanvas.width = totalCols * cellPx;
    previewCanvas.height = totalRows * cellPx;
    const ctx = previewCanvas.getContext('2d')!;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

    const templateMap = new Map(templates.map(t => [t.id, t]));

    // Build placement grid for boundary passage detection
    const placementGrid = new Map<string, { cells: boolean[][]; roomType: string }>();
    const rotatedCache = new Map<string, MapTemplate>();

    for (const p of bp.placements) {
      const t = templateMap.get(p.templateId);
      if (!t) continue;
      const rotated = MapRotationHelper.rotateTemplate(t, p.rotation);
      placementGrid.set(`${p.gridX},${p.gridY}`, {
        cells: rotated.cells,
        roomType: t.roomType || 'empty',
      });
      rotatedCache.set(`${p.gridX},${p.gridY}`, rotated);
    }

    // Render tiles with passage-fixed walls (doors, ethereal, open gaps)
    for (const p of bp.placements) {
      const t = templateMap.get(p.templateId);
      if (!t) continue;
      const rotated = rotatedCache.get(`${p.gridX},${p.gridY}`)!;

      const fixedWalls = builderService.fixWallsForPosition(
        rotated, p.gridX, p.gridY, placementGrid,
      );
      const fixedTemplate = { ...rotated, walls: fixedWalls };

      const tileCvs = guideService.renderToCanvas(
        fixedTemplate,
        rotated.gridCols * cellPx,
        rotated.gridRows * cellPx,
      );

      const dx = p.gridX * tilePxW;
      const dy = p.gridY * tilePxH;
      ctx.drawImage(tileCvs, dx, dy);

      ctx.strokeStyle = 'rgba(255,215,0,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(dx, dy, tilePxW, tilePxH);
    }

    // Connectivity overlay: lines between connected rooms
    const drawnEdges = new Set<string>();
    for (const p of bp.placements) {
      const myData = placementGrid.get(`${p.gridX},${p.gridY}`);
      if (!myData) continue;

      const neighbors = [
        { dx: 1, dy: 0 },
        { dx: 0, dy: 1 },
      ];

      for (const nb of neighbors) {
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

    // Room type badges (drawn last, on top of everything)
    for (const p of bp.placements) {
      const t = templateMap.get(p.templateId);
      if (!t) continue;

      const dx = p.gridX * tilePxW;
      const dy = p.gridY * tilePxH;
      const cx = dx + tilePxW / 2;
      const cy = dy + tilePxH / 2;
      const radius = Math.max(6, Math.min(tilePxW, tilePxH) * 0.2);
      const roomType = (t.roomType || 'empty') as RoomType;
      const color = ROOM_TYPE_COLORS[roomType] || '#FFFFFF';

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 1;
      ctx.stroke();

      const label = ROOM_TYPE_CONFIG[roomType]?.label?.[0] || '?';
      ctx.fillStyle = '#000';
      ctx.font = `bold ${Math.max(8, radius)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, cy);
    }
  }

  // ------------------------------------------------------------------
  // Static open helper
  // ------------------------------------------------------------------

  private static _instance: MazeConfigApp | null = null;

  static open(aiService?: AIService): void {
    if (!MazeConfigApp._instance) {
      MazeConfigApp._instance = new MazeConfigApp();
    }
    if (aiService) {
      MazeConfigApp._instance.setAIService(aiService);
    }
    MazeConfigApp._instance.render(true);
  }
}
