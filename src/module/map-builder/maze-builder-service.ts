import { MODULE_ID, MAP_CELL_SIZE, MAP_TILES_DIR } from '../constants';
import { MapTemplate, MapWallSegment, MapWallType, MapRotation, WALL_TYPE_CONFIG } from './types';
import { MazeConfig, MazeLayout, ROOM_TYPE_COLORS, ROOM_TYPE_CONFIG } from './maze-types';
import type { MazeBlueprint } from './maze-blueprint-types';
import { MapTemplateService } from './map-template-service';
import { MapGuideImageService } from './map-guide-image-service';
import { MapRotationHelper } from './map-rotation-helper';
import { MazeLayoutSolver } from './maze-layout-solver';
import { MazeWallMerger } from './maze-wall-merger';
import { Logger } from '../utils/logger';

declare const foundry: any;
declare const FilePicker: any;

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
   * Shows the connectivity graph with room type colours, connection lines,
   * and depth labels overlaid on top of the tile guide images.
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

    const tilePxW = cellCols * cellPx;
    const tilePxH = cellRows * cellPx;

    const cvs = document.createElement('canvas');
    cvs.width = totalCols * cellPx;
    cvs.height = totalRows * cellPx;
    const ctx = cvs.getContext('2d')!;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, cvs.width, cvs.height);

    // Draw tile guide images
    for (const p of layout.placements) {
      const t = templateMap.get(p.templateId);
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
    }

    const graph = layout.graph;
    if (!graph) {
      // Fallback: just draw grid outlines like before
      for (const p of layout.placements) {
        const dx = p.gridX * tilePxW;
        const dy = p.gridY * tilePxH;
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 1;
        ctx.strokeRect(dx, dy, tilePxW, tilePxH);
      }
      return cvs;
    }

    // Build a lookup from grid position to node
    const nodeAt = new Map<string, typeof graph.nodes[0]>();
    for (const n of graph.nodes) {
      nodeAt.set(`${n.gridX},${n.gridY}`, n);
    }

    // Draw connection lines between adjacent rooms
    const drawnEdges = new Set<string>();
    for (const edge of graph.edges) {
      const key = edge.fromId < edge.toId
        ? `${edge.fromId}-${edge.toId}`
        : `${edge.toId}-${edge.fromId}`;
      if (drawnEdges.has(key)) continue;
      drawnEdges.add(key);

      const fromNode = graph.nodes.find(n => n.id === edge.fromId);
      const toNode = graph.nodes.find(n => n.id === edge.toId);
      if (!fromNode || !toNode) continue;

      const fx = fromNode.gridX * tilePxW + tilePxW / 2;
      const fy = fromNode.gridY * tilePxH + tilePxH / 2;
      const tx = toNode.gridX * tilePxW + tilePxW / 2;
      const ty = toNode.gridY * tilePxH + tilePxH / 2;

      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = Math.max(2, cellPx * 0.3);
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Draw room type indicators and depth labels
    for (const node of graph.nodes) {
      const cx = node.gridX * tilePxW + tilePxW / 2;
      const cy = node.gridY * tilePxH + tilePxH / 2;
      const radius = Math.max(6, Math.min(tilePxW, tilePxH) * 0.25);

      const color = ROOM_TYPE_COLORS[node.roomType] || '#FFFFFF';

      // Filled circle with room type color
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Room type icon letter
      const label = ROOM_TYPE_CONFIG[node.roomType]?.label?.[0] || '?';
      ctx.fillStyle = '#000000';
      ctx.font = `bold ${Math.max(8, radius)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, cy);

      // Depth label (small, top-left corner of tile)
      if (node.depth >= 0) {
        const depthX = node.gridX * tilePxW + 4;
        const depthY = node.gridY * tilePxH + 12;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `${Math.max(8, cellPx * 0.6)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.globalAlpha = 0.7;
        ctx.fillText(`d${node.depth}`, depthX, depthY);
        ctx.globalAlpha = 1;
      }
    }

    return cvs;
  }

  // ------------------------------------------------------------------
  // Blueprint-based placement
  // ------------------------------------------------------------------

  /**
   * Place a saved MazeBlueprint onto the current scene.
   */
  async placeBlueprint(
    blueprint: MazeBlueprint,
    originX: number,
    originY: number,
  ): Promise<MazeBuildResult | null> {
    const scene = canvas?.scene;
    if (!scene) {
      ui.notifications.error('没有活动场景');
      return null;
    }

    const templateService = MapTemplateService.getInstance();
    const templates = blueprint.templateIds
      .map(id => templateService.getById(id))
      .filter((t): t is MapTemplate => t !== null);

    if (templates.length === 0) {
      ui.notifications.error('蓝图引用的模板不存在');
      return null;
    }

    ui.notifications.info(`正在放置迷宫蓝图「${blueprint.name}」...`);

    const templateMap = new Map(templates.map(t => [t.id, t]));
    const guideService = MapGuideImageService.getInstance();
    const N = blueprint.cellSize;

    // Pre-scan tile gallery for existing tile images
    const tileCache = await this._scanExistingTiles(blueprint.templateIds);

    const tileIds: string[] = [];
    const allWallTiles: Array<{
      walls: MapWallSegment[];
      offsetX: number;
      offsetY: number;
      cellSize: number;
    }> = [];

    let usedExisting = 0;
    let usedRotated = 0;
    let usedGuide = 0;

    for (const p of blueprint.placements) {
      const baseTemplate = templateMap.get(p.templateId);
      if (!baseTemplate) continue;

      const rotated = MapRotationHelper.rotateTemplate(baseTemplate, p.rotation);
      const tileW = rotated.gridCols * MAP_CELL_SIZE;
      const tileH = rotated.gridRows * MAP_CELL_SIZE;

      const dropX = originX + p.gridX * N * MAP_CELL_SIZE;
      const dropY = originY + p.gridY * N * MAP_CELL_SIZE;

      // Resolve texture: existing tile > rotated tile > guide image
      const resolved = this._resolveTexture(
        baseTemplate.id, p.rotation, tileCache,
      );
      let textureSrc: string;
      let fvttRotation = 0;

      if (resolved) {
        textureSrc = resolved.path;
        fvttRotation = resolved.fvttRotation;
        if (resolved.fvttRotation === 0) usedExisting++; else usedRotated++;
      } else {
        try {
          textureSrc = await guideService.uploadGuideImage(rotated);
        } catch {
          textureSrc = '';
        }
        usedGuide++;
      }

      // For rotated tiles, we need the IMAGE dimensions (not the rotated template dims)
      const imageW = fvttRotation === 90 || fvttRotation === 270 ? tileH : tileW;
      const imageH = fvttRotation === 90 || fvttRotation === 270 ? tileW : tileH;
      const tileX = dropX + (tileW - imageW) / 2;
      const tileY = dropY + (tileH - imageH) / 2;

      const tileData: Record<string, any> = {
        x: tileX,
        y: tileY,
        width: imageW,
        height: imageH,
        rotation: fvttRotation,
        texture: { src: textureSrc },
        flags: {
          [MODULE_ID]: {
            mapTemplateId: baseTemplate.id,
            isMapTile: true,
            isMazeTile: true,
            mazeBlueprintId: blueprint.id,
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

    const wallMergeEnabled = blueprint.metadata?.config?.wallMergeEnabled ?? true;
    let finalWalls: MapWallSegment[];
    if (wallMergeEnabled) {
      finalWalls = MazeWallMerger.mergeSegments(allWallTiles);
    } else {
      finalWalls = allWallTiles.flatMap(t => t.walls);
    }

    const wallDocs = this._buildBlueprintWallDocs(finalWalls, allWallTiles, tileIds, wallMergeEnabled, blueprint.id);
    if (wallDocs.length > 0) {
      await scene.createEmbeddedDocuments('Wall', wallDocs);
    }

    const stats = [];
    if (usedExisting > 0) stats.push(`${usedExisting} 已有图块`);
    if (usedRotated > 0) stats.push(`${usedRotated} 旋转图块`);
    if (usedGuide > 0) stats.push(`${usedGuide} 垫图`);
    ui.notifications.info(
      `迷宫放置完成: ${tileIds.length} 图块 (${stats.join(', ')}), ${wallDocs.length} 墙壁`,
    );

    return {
      layout: null as any,
      tileIds,
      wallCount: wallDocs.length,
    };
  }

  // ------------------------------------------------------------------
  // Tile image resolution for blueprint placement
  // ------------------------------------------------------------------

  /**
   * Scan MAP_TILES_DIR for existing tile images for the given template IDs.
   * Returns a map: templateId → array of { path, rotation }.
   */
  private async _scanExistingTiles(
    templateIds: string[],
  ): Promise<Map<string, Array<{ path: string; rotation: MapRotation }>>> {
    const result = new Map<string, Array<{ path: string; rotation: MapRotation }>>();
    const FP = (foundry?.applications?.apps?.FilePicker?.implementation) || FilePicker;

    for (const tid of templateIds) {
      const dir = `${MAP_TILES_DIR}/${tid}`;
      try {
        const browse = await FP.browse('data', dir);
        const files: Array<{ path: string; rotation: MapRotation }> = [];
        for (const filePath of (browse.files || [])) {
          const filename = filePath.split('/').pop() || '';
          if (!filename.endsWith('.png') && !filename.endsWith('.webp')) continue;
          const rotMatch = filename.match(/-r(\d+)\.\w+$/);
          const rotation = rotMatch ? parseInt(rotMatch[1], 10) as MapRotation : 0;
          files.push({ path: filePath, rotation });
        }
        if (files.length > 0) result.set(tid, files);
      } catch {
        // directory doesn't exist or is empty
      }
    }
    Logger.debug(`[MazeBuilder] Tile cache: ${result.size} templates with existing tiles`);
    return result;
  }

  /**
   * Find the best existing tile for a template at a desired rotation.
   * Priority: exact rotation match > any rotation (apply FVTT rotation).
   */
  private _resolveTexture(
    templateId: string,
    desiredRotation: MapRotation,
    cache: Map<string, Array<{ path: string; rotation: MapRotation }>>,
  ): { path: string; fvttRotation: number } | null {
    const tiles = cache.get(templateId);
    if (!tiles || tiles.length === 0) return null;

    // 1st priority: exact rotation match
    const exact = tiles.find(t => t.rotation === desiredRotation);
    if (exact) return { path: exact.path, fvttRotation: 0 };

    // 2nd priority: use any tile and apply FVTT rotation offset
    const best = tiles[0];
    const fvttRotation = ((desiredRotation - best.rotation + 360) % 360);
    return { path: best.path, fvttRotation };
  }

  private _buildBlueprintWallDocs(
    _mergedWalls: MapWallSegment[],
    allWallTiles: Array<{ walls: MapWallSegment[]; offsetX: number; offsetY: number; cellSize: number }>,
    tileIds: string[],
    wallMergeEnabled: boolean,
    blueprintId: string,
  ): any[] {
    if (wallMergeEnabled) {
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
              mazeBlueprintId: blueprintId,
              mapTileId: tileIds[(m as any)._tileIdx] || tileIds[0],
            },
          },
        };
        if (cfg.ds !== undefined) doc.ds = cfg.ds;
        docs.push(doc);
      }
      return docs;
    }

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
              mazeBlueprintId: blueprintId,
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
  // Internal: place onto scene (legacy algorithm-based)
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
