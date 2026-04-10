import { MODULE_ID, MAP_CELL_SIZE, MAP_TILES_DIR } from '../constants';
import { MapDropData, MapTemplate, MapStyleConfig, WALL_TYPE_CONFIG, MapRotation } from './types';
import type { MazeBlueprintDropData } from './maze-blueprint-types';
import { MapTemplateService } from './map-template-service';
import { MapGuideImageService } from './map-guide-image-service';
import { MapImageGenerationService } from './map-image-generation-service';
import { MapPlacementPreview, PlacementResult } from './map-placement-preview';
import { MapRotationHelper } from './map-rotation-helper';
import { MazeBlueprintService } from './maze-blueprint-service';
import { MazeBuilderService } from './maze-builder-service';
import { Logger } from '../utils/logger';

declare const game: any;
declare const canvas: any;
declare const ui: any;
declare const Hooks: any;
declare const foundry: any;

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
      if (data?.type === 'MazeBlueprint') {
        Logger.debug('dropCanvasData hook received MazeBlueprint:', data.blueprintId);
        MapDropHandler._lastHandledTimestamp = Date.now();
        MapDropHandler.handleBlueprintDrop(data as MazeBlueprintDropData);
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
    if (data?.type === 'MazeBlueprint') {
      Logger.debug('Board fallback drop received MazeBlueprint:', data.blueprintId);
      MapDropHandler._lastHandledTimestamp = Date.now();
      MapDropHandler.handleBlueprintDrop(data as MazeBlueprintDropData, event);
      return;
    }
    if (data?.type !== 'MapTemplate') return;

    Logger.debug('Board fallback drop received MapTemplate:', data.templateId);
    MapDropHandler._lastHandledTimestamp = Date.now();
    MapDropHandler.handleDrop(data as MapDropData, event);
  }

  static async startPlacement(templateId: string, defaultRotation?: MapRotation): Promise<void> {
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

    const preview = new MapPlacementPreview(template, defaultRotation);
    const result = await preview.start();
    if (!result) {
      ui.notifications.info('已取消放置');
      return;
    }

    const data: MapDropData = { type: 'MapTemplate', templateId };
    return MapDropHandler.handleDropAtWithRotation(data, result.x, result.y, result.rotation);
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

  static async handleBlueprintDrop(data: MazeBlueprintDropData, dropEvent?: DragEvent): Promise<void> {
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

    const service = MazeBlueprintService.getInstance();
    const bp = service.getById(data.blueprintId);
    if (!bp) {
      ui.notifications.error('找不到迷宫蓝图');
      return;
    }

    const missing = service.checkIntegrity(bp);
    if (missing.length > 0) {
      ui.notifications.warn(`蓝图引用了 ${missing.length} 个已删除的模板，无法放置`);
      return;
    }

    try {
      const builderService = MazeBuilderService.getInstance();
      const result = await builderService.placeBlueprint(bp, dropX, dropY);
      if (result) {
        ui.notifications.info(
          `迷宫已放置: ${result.tileIds.length} 图块, ${result.wallCount} 墙壁`,
        );
      }
    } catch (err: any) {
      ui.notifications.error(`迷宫放置失败: ${err.message || err}`);
    }
  }

  static async handleDropAt(data: MapDropData, dropX: number, dropY: number): Promise<void> {
    return MapDropHandler.handleDropAtWithRotation(data, dropX, dropY, 0);
  }

  static async handleDropAtWithRotation(
    data: MapDropData,
    dropX: number,
    dropY: number,
    rotation: MapRotation
  ): Promise<void> {
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

    const rotatedTemplate = MapRotationHelper.rotateTemplate(template, rotation);

    Logger.debug(`Placing template at (${dropX}, ${dropY}), rotation ${rotation}, size ${rotatedTemplate.gridCols * MAP_CELL_SIZE}x${rotatedTemplate.gridRows * MAP_CELL_SIZE}`);
    ui.notifications.info(`正在放置地图模板「${template.name}」(朝向: ${MapRotationHelper.getRotationLabel(rotation)})...`);

    try {
      const guideService = MapGuideImageService.getInstance();
      const guidePath = await guideService.uploadGuideImage(rotatedTemplate);

      const tileId = await MapDropHandler._createTileAndWalls(rotatedTemplate, dropX, dropY, guidePath, true);

      ui.notifications.info(`已放置 ${rotatedTemplate.walls.length} 面墙壁，开始生成地图图片...`);

      MapDropHandler._generateMapImage(rotatedTemplate, tileId, dropX, dropY, rotation).catch(err => {
        console.error(`${MODULE_ID} | 地图图像生成失败:`, err);
        ui.notifications.error(`地图图像生成失败: ${err.message}`);
      });

    } catch (err: any) {
      console.error(`${MODULE_ID} | 地图模板放置失败:`, err);
      ui.notifications.error(`放置失败: ${err.message}`);
    }
  }

  /**
   * 放置已有图像（来自图库）。
   * imageRotation 是该图像文件生成时使用的旋转角度（图像内容已是对应方向）。
   * 放置预览以 imageRotation 为默认方向，用户可再次选择旋转。
   * 图像文件不做物理旋转，通过 FVTT Tile 的 rotation 属性旋转显示。
   */
  static async placeWithExistingImage(
    templateId: string,
    imagePath: string,
    imageRotation: MapRotation = 0
  ): Promise<void> {
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

    // 传入原始模板，defaultRotation 设为图像已有的旋转角度，预览默认以此方向展示
    const preview = new MapPlacementPreview(template, imageRotation);
    const result = await preview.start();
    if (!result) {
      ui.notifications.info('已取消放置');
      return;
    }

    try {
      const finalRotation = result.rotation;
      // 墙体坐标用旋转后的模板
      const rotatedTemplate = MapRotationHelper.rotateTemplate(template, finalRotation);

      // 额外旋转 = 最终选择的角度 - 图像原始角度
      // 这是需要叠加给 FVTT Tile.rotation 的角度（图像文件本身已旋转 imageRotation）
      const tileRotation = ((finalRotation - imageRotation + 360) % 360) as MapRotation;

      // 图像文件的尺寸（已旋转 imageRotation 后的实际像素）
      const imageCols = (imageRotation === 90 || imageRotation === 270) ? template.gridRows : template.gridCols;
      const imageRows = (imageRotation === 90 || imageRotation === 270) ? template.gridCols : template.gridRows;

      await MapDropHandler._createTileAndWallsWithRotation(
        rotatedTemplate, result.x, result.y, imagePath, false,
        imageCols, imageRows, tileRotation
      );
      ui.notifications.info(`已放置地图「${template.name}」(${rotatedTemplate.walls.length} 面墙壁, 朝向: ${MapRotationHelper.getRotationLabel(finalRotation)})`);
    } catch (err: any) {
      console.error(`${MODULE_ID} | 地图放置失败:`, err);
      ui.notifications.error(`放置失败: ${err.message}`);
    }
  }

  /**
   * 创建图块和墙体（图像不旋转，Tile.rotation = 0，适用于新生成地图）。
   * template 应已包含旋转后的 gridCols/gridRows/cells/walls。
   * dropX/dropY 是图块左上角的世界坐标。
   */
  private static async _createTileAndWalls(
    template: MapTemplate,
    dropX: number,
    dropY: number,
    imagePath: string,
    isGenerating: boolean,
  ): Promise<string> {
    return MapDropHandler._createTileAndWallsWithRotation(
      template, dropX, dropY, imagePath, isGenerating,
      template.gridCols, template.gridRows, 0
    );
  }

  /**
   * 创建图块和墙体，支持通过 FVTT Tile.rotation 旋转已有图像。
   *
   * @param template       已经按最终旋转方向处理过的模板（墙体坐标正确）
   * @param dropX/dropY    旋转后内容的左上角世界坐标（供墙体坐标和用户视觉放置点使用）
   * @param imagePath      图像文件路径（文件本身以 imageCols×imageRows 方向存储）
   * @param imageCols      图像文件实际的列数（原始存储方向）
   * @param imageRows      图像文件实际的行数（原始存储方向）
   * @param tileRotation   FVTT Tile.rotation 旋转角度（0/90/180/270）
   */
  private static async _createTileAndWallsWithRotation(
    template: MapTemplate,
    dropX: number,
    dropY: number,
    imagePath: string,
    isGenerating: boolean,
    imageCols: number,
    imageRows: number,
    tileRotation: MapRotation,
  ): Promise<string> {
    const scene = canvas?.scene;
    if (!scene) throw new Error('没有活动场景');

    // 图像文件的实际像素尺寸（旋转前）
    const imagePixelW = imageCols * MAP_CELL_SIZE;
    const imagePixelH = imageRows * MAP_CELL_SIZE;

    // 旋转后内容的实际展示尺寸（供墙体坐标参考）
    const contentPixelW = template.gridCols * MAP_CELL_SIZE;
    const contentPixelH = template.gridRows * MAP_CELL_SIZE;

    // FVTT Tile 的 x/y 是原始图像（旋转前）的左上角，旋转绕图像中心进行。
    // 用户放置点 (dropX, dropY) 是旋转后内容的左上角，需换算到图像左上角。
    // 旋转后内容中心 = (dropX + contentPixelW/2, dropY + contentPixelH/2)
    // 图像中心   = (tileX + imagePixelW/2,   tileY + imagePixelH/2)
    // 两者相同，故：tileX = dropX + (contentPixelW - imagePixelW)/2
    const tileX = dropX + (contentPixelW - imagePixelW) / 2;
    const tileY = dropY + (contentPixelH - imagePixelH) / 2;

    const tileData: Record<string, any> = {
      x: tileX,
      y: tileY,
      width: imagePixelW,
      height: imagePixelH,
      rotation: tileRotation,
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

    // 墙体坐标从 dropX/dropY（旋转后内容左上角）出发，使用旋转后模板的坐标
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
    _dropY: number,
    rotation: MapRotation = 0
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
      const imagePath = await genService.generateMapImage(template, styleConfig, rotation);

      // 验证 Tile 是否仍然存在
      const tile = scene.tiles.get(tileId);
      if (!tile) {
        Logger.warn(`Tile ${tileId} 不存在，可能已被删除。跳过更新。`);
        ui.notifications.warn('地图图块已被删除，无法应用生成的图像。');
        return;
      }

      await scene.updateEmbeddedDocuments('Tile', [{
        _id: tileId,
        'texture.src': imagePath,
        [`flags.${MODULE_ID}.isGenerating`]: false,
      }]);

      ui.notifications.info('地图图片生成完成！');
    } catch (err: any) {
      Logger.error('地图图像生成失败:', err);
      ui.notifications.error(`AI 图像生成失败: ${err.message}`);
      
      // 验证 Tile 是否仍然存在再更新错误状态
      const tile = scene.tiles.get(tileId);
      if (tile) {
        try {
          await scene.updateEmbeddedDocuments('Tile', [{
            _id: tileId,
            [`flags.${MODULE_ID}.isGenerating`]: false,
            [`flags.${MODULE_ID}.generateError`]: err.message,
          }]);
        } catch (updateErr: any) {
          Logger.error('更新 Tile 错误状态失败:', updateErr);
        }
      }
    }
  }
}
