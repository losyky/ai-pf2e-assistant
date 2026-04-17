import { MODULE_ID } from '../constants';
import type { AIService } from '../services/ai-service';
import type { MazeBlueprint, MazeBlueprintDropData } from './maze-blueprint-types';
import { MazeBlueprintService } from './maze-blueprint-service';
import { MazeBuilderService } from './maze-builder-service';
import { MapTemplateService } from './map-template-service';
import { MapGuideImageService } from './map-guide-image-service';
import { MapRotationHelper } from './map-rotation-helper';
import { ROOM_TYPE_COLORS } from './maze-types';
import { MazePlacementPreview } from './maze-placement-preview';
import { MazeConfigApp } from './maze-config-app';
import { MazeBlueprintEditorApp } from './maze-blueprint-editor-app';

declare const Application: any;
declare const foundry: any;
declare const ui: any;
declare const Dialog: any;
declare const canvas: any;

export class MazeBlueprintPanelApp extends Application {
  private static _instance: MazeBlueprintPanelApp | null = null;
  private aiService: AIService | null = null;

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'maze-blueprint-panel',
      template: `modules/${MODULE_ID}/templates/maze-blueprint-panel.hbs`,
      width: 380,
      height: 520,
      resizable: true,
      classes: ['ai-pf2e-assistant-container', 'maze-blueprint-panel-app'],
    });
  }

  get title(): string {
    return '迷宫蓝图面板';
  }

  setAIService(aiService: AIService): void {
    this.aiService = aiService;
  }

  static open(aiService?: AIService): MazeBlueprintPanelApp {
    if (!MazeBlueprintPanelApp._instance) {
      MazeBlueprintPanelApp._instance = new MazeBlueprintPanelApp();
    }
    if (aiService) {
      MazeBlueprintPanelApp._instance.setAIService(aiService);
    }
    MazeBlueprintPanelApp._instance.render(true);
    return MazeBlueprintPanelApp._instance;
  }

  getData(): any {
    const service = MazeBlueprintService.getInstance();
    const blueprints = service.getAll();
    return {
      hasBlueprints: blueprints.length > 0,
      blueprints: blueprints.map(bp => {
        const missing = service.checkIntegrity(bp);
        return {
          id: bp.id,
          name: bp.name,
          gridWidth: bp.gridWidth,
          gridHeight: bp.gridHeight,
          placementCount: bp.placements.length,
          hasIntegrityIssue: missing.length > 0,
        };
      }),
    };
  }

  toObject(): any {
    return { id: this.id, appId: this.appId };
  }

  activateListeners(html: any): void {
    super.activateListeners(html);

    html.find('.panel-btn[data-action="new"]').on('click', () => this._onNew());
    html.find('.panel-btn[data-action="import"]').on('click', () => this._onImport());

    html.find('.blueprint-action-btn').on('click', (ev: any) => {
      ev.stopPropagation();
      const action = ev.currentTarget.dataset.action;
      const id = ev.currentTarget.dataset.blueprintId;
      if (!id) return;
      switch (action) {
        case 'place': this._onPlace(id); break;
        case 'edit': this._onEdit(id); break;
        case 'export': this._onExport(id); break;
        case 'delete': this._onDelete(id); break;
      }
    });

    html.find('.blueprint-card').on('dragstart', (ev: any) => {
      const blueprintId = (ev.currentTarget as HTMLElement).dataset.blueprintId;
      if (!blueprintId) return;
      const dragData: MazeBlueprintDropData = { type: 'MazeBlueprint', blueprintId };
      const dataStr = JSON.stringify(dragData);
      const dt = ev.originalEvent?.dataTransfer;
      if (dt) {
        dt.setData('text/plain', dataStr);
        dt.setData('application/json', dataStr);
        dt.effectAllowed = 'copy';
      }
    });

    this._renderThumbnails(html);
  }

  // ------------------------------------------------------------------
  // Thumbnail rendering
  // ------------------------------------------------------------------

  private _renderThumbnails(html: any): void {
    const service = MazeBlueprintService.getInstance();
    const templateService = MapTemplateService.getInstance();
    const guideService = MapGuideImageService.getInstance();

    html.find('.blueprint-thumb-canvas').each((_: number, el: HTMLCanvasElement) => {
      const bpId = el.dataset.blueprintId;
      if (!bpId) return;

      const bp = service.getById(bpId);
      if (!bp) return;

      this._renderBlueprintThumbnail(el, bp, templateService, guideService);
    });
  }

  private _renderBlueprintThumbnail(
    cvs: HTMLCanvasElement,
    bp: MazeBlueprint,
    templateService: MapTemplateService,
    guideService: MapGuideImageService,
  ): void {
    const N = bp.cellSize;
    const totalCols = bp.gridWidth * N;
    const totalRows = bp.gridHeight * N;
    const maxDim = 96;
    const cellPx = Math.floor(Math.min(maxDim / totalCols, maxDim / totalRows));
    const tilePxW = N * cellPx;
    const tilePxH = N * cellPx;

    cvs.width = totalCols * cellPx;
    cvs.height = totalRows * cellPx;
    const ctx = cvs.getContext('2d')!;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, cvs.width, cvs.height);

    for (const p of bp.placements) {
      const t = templateService.getById(p.templateId);
      if (!t) continue;

      const rotated = MapRotationHelper.rotateTemplate(t, p.rotation);
      const tileCvs = guideService.renderToCanvas(
        rotated,
        rotated.gridCols * cellPx,
        rotated.gridRows * cellPx,
      );

      const dx = p.gridX * tilePxW;
      const dy = p.gridY * tilePxH;
      ctx.drawImage(tileCvs, dx, dy);

      const roomType = t.roomType || 'empty';
      const color = ROOM_TYPE_COLORS[roomType] || '#FFFFFF';
      const cx = dx + tilePxW / 2;
      const cy = dy + tilePxH / 2;
      const radius = Math.max(3, Math.min(tilePxW, tilePxH) * 0.15);

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  private _onNew(): void {
    MazeConfigApp.open(this.aiService || undefined);
  }

  private _onEdit(id: string): void {
    const service = MazeBlueprintService.getInstance();
    const bp = service.getById(id);
    if (!bp) {
      ui.notifications.warn('蓝图不存在');
      return;
    }
    new MazeBlueprintEditorApp(bp, () => this.render(false)).render(true);
  }

  private async _onPlace(id: string): Promise<void> {
    if (!canvas?.scene) {
      ui.notifications.warn('请先打开一个场景');
      return;
    }

    const service = MazeBlueprintService.getInstance();
    const bp = service.getById(id);
    if (!bp) return;

    const missing = service.checkIntegrity(bp);
    if (missing.length > 0) {
      ui.notifications.warn(`蓝图引用了 ${missing.length} 个已删除的模板，无法放置`);
      return;
    }

    try {
      const preview = new MazePlacementPreview(bp);
      const placement = await preview.start();
      if (!placement) {
        ui.notifications.info('已取消放置');
        return;
      }

      const builderService = MazeBuilderService.getInstance();
      const result = await builderService.placeBlueprint(bp, placement.originX, placement.originY);
      if (result) {
        ui.notifications.info(
          `迷宫已放置: ${result.tileIds.length} 图块, ${result.wallCount} 墙壁`,
        );
      }
    } catch (err: any) {
      ui.notifications.error(`放置失败: ${err.message || err}`);
    }
  }

  private _onExport(id: string): void {
    const service = MazeBlueprintService.getInstance();
    const bp = service.getById(id);
    if (!bp) return;

    const json = service.exportToJSON(bp);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maze-${bp.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
    ui.notifications.info(`蓝图「${bp.name}」已导出`);
  }

  private _onImport(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const service = MazeBlueprintService.getInstance();
        const bp = service.importFromJSON(text);
        await service.save(bp);
        ui.notifications.info(`蓝图「${bp.name}」已导入`);
        this.render(false);
      } catch (err: any) {
        ui.notifications.error(`导入失败: ${err.message || err}`);
      }
    };
    input.click();
  }

  private _onDelete(id: string): void {
    const service = MazeBlueprintService.getInstance();
    const bp = service.getById(id);
    if (!bp) return;

    Dialog.confirm({
      title: '删除蓝图',
      content: `<p>确定要删除迷宫蓝图「${bp.name}」吗？此操作不可撤销。</p>`,
      yes: async () => {
        await service.remove(id);
        this.render(false);
        ui.notifications.info('蓝图已删除');
      },
    });
  }

  close(options?: any): Promise<void> {
    MazeBlueprintPanelApp._instance = null;
    return super.close(options);
  }
}
