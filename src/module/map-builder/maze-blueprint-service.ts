import { MODULE_ID } from '../constants';
import type { MazeBlueprint, MazeBlueprintPlacement } from './maze-blueprint-types';
import { MapTemplateService } from './map-template-service';

declare const game: any;
declare const foundry: any;

const SETTING_KEY = 'mazeBlueprints';

interface StoredBlueprint {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  gridWidth: number;
  gridHeight: number;
  cellSize: number;
  templateIds: string;
  placements: string;
  metadata?: string;
}

function serialize(bp: MazeBlueprint): StoredBlueprint {
  return {
    id: bp.id,
    name: bp.name,
    description: bp.description,
    createdAt: bp.createdAt,
    gridWidth: bp.gridWidth,
    gridHeight: bp.gridHeight,
    cellSize: bp.cellSize,
    templateIds: JSON.stringify(bp.templateIds),
    placements: JSON.stringify(bp.placements),
    metadata: bp.metadata ? JSON.stringify(bp.metadata) : undefined,
  };
}

function deserialize(s: StoredBlueprint): MazeBlueprint {
  let templateIds: string[] = [];
  try { templateIds = JSON.parse(s.templateIds || '[]'); } catch { /* empty */ }

  let placements: MazeBlueprintPlacement[] = [];
  try { placements = JSON.parse(s.placements || '[]'); } catch { /* empty */ }

  let metadata: MazeBlueprint['metadata'];
  if (s.metadata) {
    try { metadata = JSON.parse(s.metadata); } catch { /* empty */ }
  }

  return {
    id: s.id,
    name: s.name,
    description: s.description,
    createdAt: s.createdAt,
    gridWidth: s.gridWidth,
    gridHeight: s.gridHeight,
    cellSize: s.cellSize,
    templateIds,
    placements,
    metadata,
  };
}

export class MazeBlueprintService {
  private static instance: MazeBlueprintService;

  private constructor() {}

  static getInstance(): MazeBlueprintService {
    if (!MazeBlueprintService.instance) {
      MazeBlueprintService.instance = new MazeBlueprintService();
    }
    return MazeBlueprintService.instance;
  }

  // ------------------------------------------------------------------
  // CRUD
  // ------------------------------------------------------------------

  getAll(): MazeBlueprint[] {
    try {
      const raw = game.settings.get(MODULE_ID, SETTING_KEY);
      if (!raw) return [];

      let items: any[];
      if (typeof raw === 'string') {
        try { items = JSON.parse(raw); } catch { return []; }
      } else if (Array.isArray(raw)) {
        items = raw;
      } else {
        return [];
      }

      if (!Array.isArray(items)) return [];

      return items
        .map((item: any) => {
          if (typeof item === 'string') {
            try { item = JSON.parse(item); } catch { return null; }
          }
          if (!item || !item.id) return null;
          return deserialize(item as StoredBlueprint);
        })
        .filter((bp): bp is MazeBlueprint => bp !== null);
    } catch {
      return [];
    }
  }

  getById(id: string): MazeBlueprint | undefined {
    return this.getAll().find(bp => bp.id === id);
  }

  async save(blueprint: MazeBlueprint): Promise<void> {
    this.validate(blueprint);
    const all = this.getAll();
    const idx = all.findIndex(bp => bp.id === blueprint.id);
    if (idx >= 0) {
      all[idx] = blueprint;
    } else {
      all.push(blueprint);
    }
    const stored = all.map(bp => serialize(bp));
    await game.settings.set(MODULE_ID, SETTING_KEY, stored);
  }

  async remove(id: string): Promise<void> {
    const all = this.getAll().filter(bp => bp.id !== id);
    const stored = all.map(bp => serialize(bp));
    await game.settings.set(MODULE_ID, SETTING_KEY, stored);
  }

  // ------------------------------------------------------------------
  // Validation
  // ------------------------------------------------------------------

  validate(blueprint: MazeBlueprint): void {
    if (!blueprint.id) throw new Error('蓝图缺少 ID');
    if (!blueprint.name) throw new Error('蓝图缺少名称');
    if (blueprint.gridWidth < 1 || blueprint.gridHeight < 1) {
      throw new Error('迷宫尺寸必须大于 0');
    }
    if (blueprint.cellSize < 1) {
      throw new Error('模板格子数必须大于 0');
    }
    if (!Array.isArray(blueprint.placements) || blueprint.placements.length === 0) {
      throw new Error('蓝图必须包含至少一个放置项');
    }
  }

  /**
   * Check whether all referenced templates still exist.
   * Returns IDs of missing templates.
   */
  checkIntegrity(blueprint: MazeBlueprint): string[] {
    const templateService = MapTemplateService.getInstance();
    const missing: string[] = [];
    for (const tid of blueprint.templateIds) {
      if (!templateService.getById(tid)) {
        missing.push(tid);
      }
    }
    return missing;
  }

  // ------------------------------------------------------------------
  // Import / Export
  // ------------------------------------------------------------------

  exportToJSON(blueprint: MazeBlueprint): string {
    return JSON.stringify(blueprint, null, 2);
  }

  importFromJSON(json: string): MazeBlueprint {
    const data = JSON.parse(json);
    if (!data.gridWidth || !data.gridHeight || !data.placements) {
      throw new Error('无效的迷宫蓝图 JSON');
    }
    data.id = foundry.utils.randomID();
    data.createdAt = Date.now();
    return data as MazeBlueprint;
  }
}
