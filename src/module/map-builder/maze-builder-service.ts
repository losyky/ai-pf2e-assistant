import { MODULE_ID, MAP_CELL_SIZE } from '../constants';
import { MapTemplate, MapWallSegment, MapWallType, WALL_TYPE_CONFIG } from './types';
import { MazeConfig, MazeLayout } from './maze-types';
import { MapTemplateService } from './map-template-service';
import { MapGuideImageService } from './map-guide-image-service';
import { MapRotationHelper } from './map-rotation-helper';
import { MazeLayoutSolver } from './maze-layout-solver';
import { MazeWallMerger } from './maze-wall-merger';

declare const canvas: any;
declare const ui: any;
declare const game: any;

export interface MazeBuildResult {
  layout: MazeLayout;
  tileIds: string[];
  wallCount: number;
}

/**
 * Top-level orchestrator: analyse → solve → merge → place.
 */
export class MazeBuilderService {
  private static instance: MazeBuilderService;

  private constructor() {}

  static getInstance(): MazeBuilderService {
    if (!MazeBuilderService.instance) {
      MazeBuilderService.instance = new MazeBuilderService();
    }
    return MazeBuilderService.instance;
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Solve a maze layout from the given config without placing anything.
   * Returns null if the solver fails.
   */
  solveLayout(config: MazeConfig, templates?: MapTemplate[]): MazeLayout | null {
    const pool = templates ?? this._getTemplatePool(config);
    if (pool.length === 0) return null;

    const solver = new MazeLayoutSolver(config);
    return solver.solve(pool);
  }

  /**
   * Full pipeline: solve + place onto the current scene.
   */
  async buildAndPlace(
    config: MazeConfig,
    originX: number,
    originY: number,
    templates?: MapTemplate[],
  ): Promise<MazeBuildResult | null> {
    const scene = canvas?.scene;
    if (!scene) {
      ui.notifications.error('没有活动场景');
      return null;
    }

    ui.notifications.info('正在求解迷宫布局...');

    const pool = templates ?? this._getTemplatePool(config);
    const layout = this.solveLayout(config, pool);
    if (!layout) {
      ui.notifications.error('迷宫求解失败，请尝试调整参数或增加模板池。');
      return null;
    }

    ui.notifications.info(`迷宫布局完成，共 ${layout.placements.length} 个图块，正在放置...`);

    const result = await this._placeLayout(layout, pool, originX, originY);
    ui.notifications.info(
      `迷宫放置完成: ${result.tileIds.length} 个图块, ${result.wallCount} 面墙壁`,
    );
    return result;
  }

  /**
   * Render a preview canvas of the solved layout (no scene placement).
   */
  renderPreview(layout: MazeLayout, templates: MapTemplate[], maxDim = 512): HTMLCanvasElement {
    const templateMap = new Map(templates.map(t => [t.id, t]));
    const guideService = MapGuideImageService.getInstance();

    const refTemplate = templates[0];
    const cellCols = refTemplate?.gridCols ?? 16;
    const cellRows = refTemplate?.gridRows ?? 16;

    const totalCols = layout.config.mazeWidth * cellCols;
    const totalRows = layout.config.mazeHeight * cellRows;
    const cellPx = Math.floor(Math.min(maxDim / totalCols, maxDim / totalRows));

    const cvs = document.createElement('canvas');
    cvs.width = totalCols * cellPx;
    cvs.height = totalRows * cellPx;
    const ctx = cvs.getContext('2d')!;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, cvs.width, cvs.height);

    for (const p of layout.placements) {
      const t = templateMap.get(p.templateId);
      if (!t) continue;

      const rotated = MapRotationHelper.rotateTemplate(t, p.rotation);
      const tileCvs = guideService.renderToCanvas(
        rotated,
        rotated.gridCols * cellPx,
        rotated.gridRows * cellPx,
      );

      const dx = p.gridX * cellCols * cellPx;
      const dy = p.gridY * cellRows * cellPx;
      ctx.drawImage(tileCvs, dx, dy);

      // Grid outline
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 1;
      ctx.strokeRect(dx, dy, rotated.gridCols * cellPx, rotated.gridRows * cellPx);
    }

    return cvs;
  }

  // ------------------------------------------------------------------
  // Internal: place onto scene
  // ------------------------------------------------------------------

  private async _placeLayout(
    layout: MazeLayout,
    pool: MapTemplate[],
    originX: number,
    originY: number,
  ): Promise<MazeBuildResult> {
    const scene = canvas.scene;
    const templateMap = new Map(pool.map(t => [t.id, t]));
    const guideService = MapGuideImageService.getInstance();

    const tileIds: string[] = [];

    // Collect all walls for merging
    const allWallTiles: Array<{
      walls: MapWallSegment[];
      offsetX: number;
      offsetY: number;
      cellSize: number;
    }> = [];

    // 1. Create tiles (with guide images)
    for (const p of layout.placements) {
      const baseTemplate = templateMap.get(p.templateId);
      if (!baseTemplate) continue;

      const rotated = MapRotationHelper.rotateTemplate(baseTemplate, p.rotation);
      const tileW = rotated.gridCols * MAP_CELL_SIZE;
      const tileH = rotated.gridRows * MAP_CELL_SIZE;

      const dropX = originX + p.gridX * baseTemplate.gridCols * MAP_CELL_SIZE;
      const dropY = originY + p.gridY * baseTemplate.gridRows * MAP_CELL_SIZE;

      let guidePath: string;
      try {
        guidePath = await guideService.uploadGuideImage(rotated);
      } catch {
        guidePath = '';
      }

      const tileData = {
        x: dropX,
        y: dropY,
        width: tileW,
        height: tileH,
        texture: { src: guidePath },
        flags: {
          [MODULE_ID]: {
            mapTemplateId: baseTemplate.id,
            isMapTile: true,
            isMazeTile: true,
            isGenerating: false,
          },
        },
      };

      const tiles = await scene.createEmbeddedDocuments('Tile', [tileData]);
      const tileId = tiles[0]?.id;
      if (tileId) tileIds.push(tileId);

      allWallTiles.push({
        walls: rotated.walls,
        offsetX: dropX,
        offsetY: dropY,
        cellSize: MAP_CELL_SIZE,
      });
    }

    // 2. Merge walls if enabled
    let finalWalls: MapWallSegment[];
    if (layout.config.wallMergeEnabled) {
      finalWalls = MazeWallMerger.mergeSegments(allWallTiles);
    } else {
      finalWalls = allWallTiles.flatMap(t => t.walls);
    }

    // 3. Create wall documents
    const wallDocs = this._buildWallDocs(finalWalls, allWallTiles, tileIds, layout);
    if (wallDocs.length > 0) {
      await scene.createEmbeddedDocuments('Wall', wallDocs);
    }

    return {
      layout,
      tileIds,
      wallCount: wallDocs.length,
    };
  }

  /**
   * Convert merged wall segments into FVTT wall documents.
   */
  private _buildWallDocs(
    mergedWalls: MapWallSegment[],
    allWallTiles: Array<{ walls: MapWallSegment[]; offsetX: number; offsetY: number; cellSize: number }>,
    tileIds: string[],
    layout: MazeLayout,
  ): any[] {
    // When merged, walls may no longer map 1:1 to individual tiles, so we
    // need to generate absolute coords and use the first tile as the owner.
    if (layout.config.wallMergeEnabled) {
      return this._buildMergedWallDocs(mergedWalls, allWallTiles, tileIds);
    }
    return this._buildPerTileWallDocs(allWallTiles, tileIds);
  }

  private _buildMergedWallDocs(
    _mergedSegments: MapWallSegment[],
    allWallTiles: Array<{ walls: MapWallSegment[]; offsetX: number; offsetY: number; cellSize: number }>,
    tileIds: string[],
  ): any[] {
    // Re-merge to get absolute-coord walls
    const docs: any[] = [];
    const merged = MazeWallMerger.mergeWalls(
      allWallTiles.flatMap((tile, tileIdx) =>
        tile.walls.map(w => ({
          c: [
            tile.offsetX + w.x1 * tile.cellSize,
            tile.offsetY + w.y1 * tile.cellSize,
            tile.offsetX + w.x2 * tile.cellSize,
            tile.offsetY + w.y2 * tile.cellSize,
          ],
          wallType: w.wallType || 'normal' as any,
          _tileIdx: tileIdx,
        })),
      ),
    );

    for (const m of merged) {
      const wt: MapWallType = (m as any).wallType || 'normal';
      const cfg = WALL_TYPE_CONFIG[wt].fvtt;
      const doc: Record<string, any> = {
        c: m.c,
        move: cfg.move ?? 20,
        sense: cfg.sense ?? 20,
        door: cfg.door ?? 0,
        flags: {
          [MODULE_ID]: {
            isMazeWall: true,
            mapTileId: tileIds[(m as any)._tileIdx] || tileIds[0],
          },
        },
      };
      if (cfg.ds !== undefined) doc.ds = cfg.ds;
      docs.push(doc);
    }
    return docs;
  }

  private _buildPerTileWallDocs(
    allWallTiles: Array<{ walls: MapWallSegment[]; offsetX: number; offsetY: number; cellSize: number }>,
    tileIds: string[],
  ): any[] {
    const docs: any[] = [];
    for (let i = 0; i < allWallTiles.length; i++) {
      const tile = allWallTiles[i];
      for (const w of tile.walls) {
        const cfg = WALL_TYPE_CONFIG[w.wallType || 'normal'].fvtt;
        const doc: Record<string, any> = {
          c: [
            tile.offsetX + w.x1 * tile.cellSize,
            tile.offsetY + w.y1 * tile.cellSize,
            tile.offsetX + w.x2 * tile.cellSize,
            tile.offsetY + w.y2 * tile.cellSize,
          ],
          move: cfg.move ?? 20,
          sense: cfg.sense ?? 20,
          door: cfg.door ?? 0,
          flags: {
            [MODULE_ID]: {
              isMazeWall: true,
              mapTileId: tileIds[i] || tileIds[0],
            },
          },
        };
        if (cfg.ds !== undefined) doc.ds = cfg.ds;
        docs.push(doc);
      }
    }
    return docs;
  }

  // ------------------------------------------------------------------
  // Template pool selection
  // ------------------------------------------------------------------

  private _getTemplatePool(config: MazeConfig): MapTemplate[] {
    const service = MapTemplateService.getInstance();
    const all = service.getAll();

    // Filter templates that match at least one room type in pool or endpoints
    const allowedTypes = new Set<string>();
    for (const rp of config.roomPool) allowedTypes.add(rp.roomType);
    for (const ep of config.endpoints) allowedTypes.add(ep.roomType);
    allowedTypes.add('entrance');

    return all.filter(t => {
      const rt = t.roomType || 'empty';
      return allowedTypes.has(rt);
    });
  }
}
