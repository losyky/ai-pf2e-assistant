import { MODULE_ID, MAP_CELL_SIZE } from '../constants';
import { MapDropData, MapTemplate, MapStyleConfig, WALL_TYPE_CONFIG } from './types';
import { MapTemplateService } from './map-template-service';
import { MapGuideImageService } from './map-guide-image-service';
import { MapImageGenerationService } from './map-image-generation-service';
import { MapPlacementPreview } from './map-placement-preview';
import { Logger } from '../utils/logger';

declare const game: any;
declare const canvas: any;
declare const ui: any;
declare const Hooks: any;

export class MapDropHandler {
  private static registered = false;
  private static _lastHandledTimestamp = 0;

  static register(): void {
    if (MapDropHandler.registered) return;
    MapDropHandler.registered = true;

    Hooks.on('dropCanvasData', (_canvasObj: any, data: any) => {
      if (data?.type === 'MapTemplate') {
        Logger.debug('dropCanvasData hook received MapTemplate:', data.templateId);
        MapDropHandler._lastHandledTimestamp = Date.now();
        MapDropHandler.handleDrop(data as MapDropData);
        return false;
      }
    });

    MapDropHandler._registerBoardFallback();
    Logger.debug('MapDropHandler registered (hook + DOM fallback)');
  }

  private static _registerBoardFallback(): void {
    const attach = () => {
      const board = document.getElementById('board');
      if (!board) {
        Logger.debug('MapDropHandler: #board not found, will retry on canvasReady');
        return false;
      }
      board.addEventListener('drop', (event: DragEvent) => {
        MapDropHandler._onBoardDrop(event);
      });
      Logger.debug('MapDropHandler: board fallback listener attached');
      return true;
    };

    if (!attach()) {
      Hooks.once('canvasReady', () => attach());
    }
  }

  private static _onBoardDrop(event: DragEvent): void {
    if (Date.now() - MapDropHandler._lastHandledTimestamp < 500) return;

    let data: any;
    try {
      const raw = event.dataTransfer?.getData('application/json')
        || event.dataTransfer?.getData('text/plain');
      if (!raw) return;
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (data?.type !== 'MapTemplate') return;

    Logger.debug('Board fallback drop received MapTemplate:', data.templateId);
    MapDropHandler._lastHandledTimestamp = Date.now();
    MapDropHandler.handleDrop(data as MapDropData, event);
  }

  static async startPlacement(templateId: string): Promise<void> {
    const templateService = MapTemplateService.getInstance();
    const template = templateService.getById(templateId);
    if (!template) {
      ui.notifications.error('找不到模板数据');
      return;
    }
    if (!canvas?.scene) {
      ui.notifications.error('没有活动场景');
      return;
    }

    const preview = new MapPlacementPreview(template);
    const pos = await preview.start();
    if (!pos) {
      ui.notifications.info('已取消放置');
      return;
    }

    const data: MapDropData = { type: 'MapTemplate', templateId };
    return MapDropHandler.handleDropAt(data, pos.x, pos.y);
  }

  static async placeAtCenter(templateId: string): Promise<void> {
    return MapDropHandler.startPlacement(templateId);
  }

  static async handleDrop(data: MapDropData, dropEvent?: DragEvent): Promise<void> {
    const scene = canvas?.scene;
    if (!scene) {
      ui.notifications.error('没有活动场景');
      return;
    }

    const gridSize = scene.grid?.size || MAP_CELL_SIZE;
    let dropX: number;
    let dropY: number;

    if (dropEvent) {
      const pos = MapDropHandler._clientToCanvas(dropEvent.clientX, dropEvent.clientY);
      dropX = Math.round(pos.x / gridSize) * gridSize;
      dropY = Math.round(pos.y / gridSize) * gridSize;
    } else if (canvas.mousePosition) {
      const pos = canvas.mousePosition;
      dropX = Math.round(pos.x / gridSize) * gridSize;
      dropY = Math.round(pos.y / gridSize) * gridSize;
    } else {
      const viewCenter = MapDropHandler._getViewportCenter();
      dropX = Math.round(viewCenter.x / gridSize) * gridSize;
      dropY = Math.round(viewCenter.y / gridSize) * gridSize;
    }

    return MapDropHandler.handleDropAt(data, dropX, dropY);
  }

  static async handleDropAt(data: MapDropData, dropX: number, dropY: number): Promise<void> {
    const templateService = MapTemplateService.getInstance();
    const template = templateService.getById(data.templateId);
    if (!template) {
      ui.notifications.error('找不到模板数据');
      return;
    }

    const scene = canvas?.scene;
    if (!scene) {
      ui.notifications.error('没有活动场景');
      return;
    }

    Logger.debug(`Placing template at (${dropX}, ${dropY}), size ${template.gridCols * MAP_CELL_SIZE}x${template.gridRows * MAP_CELL_SIZE}`);
    ui.notifications.info(`正在放置地图模板「${template.name}」...`);

    try {
      const guideService = MapGuideImageService.getInstance();
      const guidePath = await guideService.uploadGuideImage(template);

      const tileId = await MapDropHandler._createTileAndWalls(template, dropX, dropY, guidePath, true);

      ui.notifications.info(`已放置 ${template.walls.length} 面墙壁，开始生成地图图片...`);

      MapDropHandler._generateMapImage(template, tileId, dropX, dropY).catch(err => {
        console.error(`${MODULE_ID} | 地图图像生成失败:`, err);
        ui.notifications.error(`地图图像生成失败: ${err.message}`);
      });

    } catch (err: any) {
      console.error(`${MODULE_ID} | 地图模板放置失败:`, err);
      ui.notifications.error(`放置失败: ${err.message}`);
    }
  }

  static async placeWithExistingImage(templateId: string, imagePath: string): Promise<void> {
    const templateService = MapTemplateService.getInstance();
    const template = templateService.getById(templateId);
    if (!template) {
      ui.notifications.error('找不到模板数据');
      return;
    }
    if (!canvas?.scene) {
      ui.notifications.error('没有活动场景');
      return;
    }

    const preview = new MapPlacementPreview(template);
    const pos = await preview.start();
    if (!pos) {
      ui.notifications.info('已取消放置');
      return;
    }

    try {
      await MapDropHandler._createTileAndWalls(template, pos.x, pos.y, imagePath, false);
      ui.notifications.info(`已放置地图「${template.name}」(${template.walls.length} 面墙壁)`);
    } catch (err: any) {
      console.error(`${MODULE_ID} | 地图放置失败:`, err);
      ui.notifications.error(`放置失败: ${err.message}`);
    }
  }

  private static async _createTileAndWalls(
    template: MapTemplate,
    dropX: number,
    dropY: number,
    imagePath: string,
    isGenerating: boolean,
  ): Promise<string> {
    const scene = canvas?.scene;
    if (!scene) throw new Error('没有活动场景');

    const totalWidth = template.gridCols * MAP_CELL_SIZE;
    const totalHeight = template.gridRows * MAP_CELL_SIZE;

    const tileData = {
      x: dropX,
      y: dropY,
      width: totalWidth,
      height: totalHeight,
      texture: { src: imagePath },
      flags: {
        [MODULE_ID]: {
          mapTemplateId: template.id,
          isMapTile: true,
          isGenerating,
        }
      }
    };

    const tiles = await scene.createEmbeddedDocuments('Tile', [tileData]);
    const tileId = tiles[0]?.id;
    if (!tileId) throw new Error('创建图块失败');

    const wallDocs = template.walls.map(w => {
      const cfg = WALL_TYPE_CONFIG[w.wallType || 'normal'].fvtt;
      const doc: Record<string, any> = {
        c: [
          dropX + w.x1 * MAP_CELL_SIZE,
          dropY + w.y1 * MAP_CELL_SIZE,
          dropX + w.x2 * MAP_CELL_SIZE,
          dropY + w.y2 * MAP_CELL_SIZE,
        ],
        move: cfg.move ?? 20,
        sense: cfg.sense ?? 20,
        door: cfg.door ?? 0,
        flags: {
          [MODULE_ID]: {
            mapTemplateId: template.id,
            mapTileId: tileId,
          }
        }
      };
      if (cfg.ds !== undefined) doc.ds = cfg.ds;
      return doc;
    });

    if (wallDocs.length > 0) {
      await scene.createEmbeddedDocuments('Wall', wallDocs);
    }

    return tileId;
  }

  private static _clientToCanvas(clientX: number, clientY: number): { x: number; y: number } {
    try {
      const stage = canvas?.stage;
      if (stage?.worldTransform) {
        const wt = stage.worldTransform;
        return {
          x: (clientX - wt.tx) / wt.a,
          y: (clientY - wt.ty) / wt.d,
        };
      }
      if (typeof canvas?.clientCoordinatesFromCanvas === 'function') {
        return canvas.clientCoordinatesFromCanvas({ x: clientX, y: clientY });
      }
    } catch (e) {
      Logger.debug('clientToCanvas failed, using mousePosition fallback:', e);
    }
    return canvas?.mousePosition ?? { x: 0, y: 0 };
  }

  private static _getViewportCenter(): { x: number; y: number } {
    try {
      const stage = canvas?.stage;
      if (stage?.worldTransform) {
        const wt = stage.worldTransform;
        const hw = window.innerWidth / 2;
        const hh = window.innerHeight / 2;
        return {
          x: (hw - wt.tx) / wt.a,
          y: (hh - wt.ty) / wt.d,
        };
      }
    } catch { /* fallback */ }
    return { x: 0, y: 0 };
  }

  private static async _generateMapImage(
    template: MapTemplate,
    tileId: string,
    _dropX: number,
    _dropY: number
  ): Promise<void> {
    const scene = canvas?.scene;
    if (!scene) return;

    const styleConfig = (scene.getFlag(MODULE_ID, 'mapStyle') as MapStyleConfig) || {
      stylePrompt: '',
      negativePrompt: '',
      imageModel: '',
    };

    if (!styleConfig.stylePrompt) {
      ui.notifications.warn('未配置地图风格提示词，跳过 AI 图像生成。请在「风格配置」中设置提示词后重新拖入模板。');
      return;
    }

    try {
      const genService = MapImageGenerationService.getInstance();
      const imagePath = await genService.generateMapImage(template, styleConfig);

      await scene.updateEmbeddedDocuments('Tile', [{
        _id: tileId,
        'texture.src': imagePath,
        [`flags.${MODULE_ID}.isGenerating`]: false,
      }]);

      ui.notifications.info('地图图片生成完成！');
    } catch (err: any) {
      ui.notifications.error(`AI 图像生成失败: ${err.message}`);
      await scene.updateEmbeddedDocuments('Tile', [{
        _id: tileId,
        [`flags.${MODULE_ID}.isGenerating`]: false,
        [`flags.${MODULE_ID}.generateError`]: err.message,
      }]);
    }
  }
}
