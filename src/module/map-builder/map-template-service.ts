import { MODULE_ID, MAP_CELL_SIZE, MAP_DEFAULT_COLS, MAP_DEFAULT_ROWS } from '../constants';
import { MapTemplate, MapWallSegment, MapWallType, RoomType, RoomRarity } from './types';

declare const game: any;
declare const foundry: any;

interface StoredMapTemplate {
  id: string;
  name: string;
  description: string;
  gridCols?: number;
  gridRows?: number;
  gridSize?: number;
  cells: string;
  walls: string;
  roomType?: RoomType;
  roomTags?: string;
  rarity?: RoomRarity;
}

function serialize(t: MapTemplate): StoredMapTemplate {
  const s: StoredMapTemplate = {
    id: t.id,
    name: t.name,
    description: t.description,
    gridCols: t.gridCols,
    gridRows: t.gridRows,
    cells: t.cells.map(row => row.map(c => c ? '1' : '0').join('')).join(''),
    walls: JSON.stringify(t.walls),
  };
  if (t.roomType) s.roomType = t.roomType;
  if (t.rarity) s.rarity = t.rarity;
  if (t.roomTags && t.roomTags.length > 0) s.roomTags = JSON.stringify(t.roomTags);
  return s;
}

function deserialize(s: StoredMapTemplate): MapTemplate {
  const cols = s.gridCols ?? s.gridSize ?? MAP_DEFAULT_COLS;
  const rows = s.gridRows ?? s.gridSize ?? MAP_DEFAULT_ROWS;
  const cells: boolean[][] = [];
  const cellStr = s.cells || '';
  for (let r = 0; r < rows; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < cols; c++) {
      row.push(cellStr[r * cols + c] === '1');
    }
    cells.push(row);
  }
  let walls: MapWallSegment[] = [];
  try { walls = JSON.parse(s.walls || '[]'); } catch { /* empty */ }
  let roomTags: string[] | undefined;
  if (s.roomTags) {
    try { roomTags = JSON.parse(s.roomTags); } catch { /* empty */ }
  }
  const t: MapTemplate = {
    id: s.id,
    name: s.name,
    description: s.description,
    gridCols: cols,
    gridRows: rows,
    cellSize: MAP_CELL_SIZE,
    cells,
    walls,
  };
  if (s.roomType) t.roomType = s.roomType;
  if (s.rarity) t.rarity = s.rarity;
  if (roomTags && roomTags.length > 0) t.roomTags = roomTags;
  return t;
}

function migrateOldFormat(raw: any): StoredMapTemplate | null {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  if (typeof raw.cells === 'string' && typeof raw.walls === 'string') {
    return raw as StoredMapTemplate;
  }
  try {
    const cols = raw.gridCols ?? raw.gridSize ?? MAP_DEFAULT_COLS;
    const rows = raw.gridRows ?? raw.gridSize ?? MAP_DEFAULT_ROWS;
    const t: MapTemplate = {
      id: raw.id,
      name: raw.name || '',
      description: raw.description || '',
      gridCols: cols,
      gridRows: rows,
      cellSize: MAP_CELL_SIZE,
      cells: raw.cells || [],
      walls: raw.walls || [],
    };
    return serialize(t);
  } catch {
    return null;
  }
}

export class MapTemplateService {
  private static instance: MapTemplateService;

  private constructor() {}

  static getInstance(): MapTemplateService {
    if (!MapTemplateService.instance) {
      MapTemplateService.instance = new MapTemplateService();
    }
    return MapTemplateService.instance;
  }

  getAll(): MapTemplate[] {
    try {
      const raw = game.settings.get(MODULE_ID, 'mapTemplates');
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

      return items.map((item: any) => {
        if (typeof item === 'string') {
          try { item = JSON.parse(item); } catch { return null; }
        }
        const stored = migrateOldFormat(item);
        return stored ? deserialize(stored) : null;
      }).filter((t): t is MapTemplate => t !== null);
    } catch {
      return [];
    }
  }

  getById(id: string): MapTemplate | undefined {
    return this.getAll().find(t => t.id === id);
  }

  async save(template: MapTemplate): Promise<void> {
    this.validate(template);
    const all = this.getAll();
    const idx = all.findIndex(t => t.id === template.id);
    if (idx >= 0) {
      all[idx] = template;
    } else {
      all.push(template);
    }
    const stored = all.map(t => serialize(t));
    await game.settings.set(MODULE_ID, 'mapTemplates', stored);
  }

  async remove(id: string): Promise<void> {
    const all = this.getAll().filter(t => t.id !== id);
    const stored = all.map(t => serialize(t));
    await game.settings.set(MODULE_ID, 'mapTemplates', stored);
  }

  validate(template: MapTemplate): void {
    if (!template.id) throw new Error('模板缺少 ID');
    if (!template.name) throw new Error('模板缺少名称');
    if (template.cellSize !== MAP_CELL_SIZE) throw new Error(`格子尺寸必须为 ${MAP_CELL_SIZE}`);
    if (template.gridCols < 1 || template.gridRows < 1) throw new Error('网格尺寸必须大于 0');
    if (!Array.isArray(template.cells) || template.cells.length !== template.gridRows) {
      throw new Error(`cells 行数必须为 ${template.gridRows}`);
    }
    for (const row of template.cells) {
      if (!Array.isArray(row) || row.length !== template.gridCols) {
        throw new Error(`cells 每行必须有 ${template.gridCols} 个元素`);
      }
    }
  }

  createEmpty(name: string = '新模板', cols: number = MAP_DEFAULT_COLS, rows: number = MAP_DEFAULT_ROWS): MapTemplate {
    const cells: boolean[][] = [];
    for (let r = 0; r < rows; r++) {
      cells.push(new Array(cols).fill(true));
    }
    return {
      id: foundry.utils.randomID(),
      name,
      description: '',
      gridCols: cols,
      gridRows: rows,
      cellSize: MAP_CELL_SIZE,
      cells,
      walls: [],
    };
  }

  resizeTemplate(template: MapTemplate, newCols: number, newRows: number): void {
    const oldCells = template.cells;
    const newCells: boolean[][] = [];
    for (let r = 0; r < newRows; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < newCols; c++) {
        row.push(oldCells[r]?.[c] ?? true);
      }
      newCells.push(row);
    }
    const walls = template.walls.filter(w =>
      w.x1 >= 0 && w.x1 <= newCols &&
      w.x2 >= 0 && w.x2 <= newCols &&
      w.y1 >= 0 && w.y1 <= newRows &&
      w.y2 >= 0 && w.y2 <= newRows
    );
    template.gridCols = newCols;
    template.gridRows = newRows;
    template.cells = newCells;
    template.walls = walls;
  }

  exportToJSON(template: MapTemplate): string {
    return JSON.stringify(template, null, 2);
  }

  importFromJSON(json: string): MapTemplate {
    const data = JSON.parse(json);
    if (data.gridSize && !data.gridCols) {
      data.gridCols = data.gridSize;
      data.gridRows = data.gridSize;
    }
    data.gridCols = data.gridCols ?? MAP_DEFAULT_COLS;
    data.gridRows = data.gridRows ?? MAP_DEFAULT_ROWS;
    delete data.gridSize;
    data.id = foundry.utils.randomID();
    const t = data as MapTemplate;
    this.validate(t);
    return t;
  }

  // ========================================
  // Wall generation
  // ========================================

  autoGenerateWalls(template: MapTemplate, wallType: MapWallType = 'normal'): MapWallSegment[] {
    const raw: MapWallSegment[] = [];
    const cols = template.gridCols;
    const rows = template.gridRows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!template.cells[r][c]) continue;
        if (r === 0 || !template.cells[r - 1][c]) {
          raw.push({ x1: c, y1: r, x2: c + 1, y2: r, wallType });
        }
        if (r === rows - 1 || !template.cells[r + 1][c]) {
          raw.push({ x1: c, y1: r + 1, x2: c + 1, y2: r + 1, wallType });
        }
        if (c === 0 || !template.cells[r][c - 1]) {
          raw.push({ x1: c, y1: r, x2: c, y2: r + 1, wallType });
        }
        if (c === cols - 1 || !template.cells[r][c + 1]) {
          raw.push({ x1: c + 1, y1: r, x2: c + 1, y2: r + 1, wallType });
        }
      }
    }
    return this.mergeCollinearWalls(this.deduplicateWalls(raw));
  }

  /**
   * Merge collinear wall segments that share an endpoint and have the same type.
   * e.g. (0,0)→(1,0) + (1,0)→(2,0) → (0,0)→(2,0)
   */
  mergeCollinearWalls(walls: MapWallSegment[]): MapWallSegment[] {
    const byType = new Map<string, MapWallSegment[]>();
    for (const w of walls) {
      const t = w.wallType || 'normal';
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t)!.push(w);
    }

    const result: MapWallSegment[] = [];
    for (const [, group] of byType) {
      result.push(...this._mergeGroup(group));
    }
    return result;
  }

  private _mergeGroup(walls: MapWallSegment[]): MapWallSegment[] {
    // Separate into horizontal (same y) and vertical (same x)
    const horizontal: MapWallSegment[] = [];
    const vertical: MapWallSegment[] = [];
    const other: MapWallSegment[] = [];

    for (const w of walls) {
      if (w.y1 === w.y2) horizontal.push(w);
      else if (w.x1 === w.x2) vertical.push(w);
      else other.push(w);
    }

    const result: MapWallSegment[] = [...other];
    result.push(...this._mergeAxis(horizontal, 'h'));
    result.push(...this._mergeAxis(vertical, 'v'));
    return result;
  }

  private _mergeAxis(walls: MapWallSegment[], axis: 'h' | 'v'): MapWallSegment[] {
    if (walls.length === 0) return [];
    const wallType = walls[0].wallType;

    // Group by the fixed coordinate
    const groups = new Map<number, { start: number; end: number }[]>();
    for (const w of walls) {
      const fixed = axis === 'h' ? w.y1 : w.x1;
      const a = axis === 'h' ? Math.min(w.x1, w.x2) : Math.min(w.y1, w.y2);
      const b = axis === 'h' ? Math.max(w.x1, w.x2) : Math.max(w.y1, w.y2);
      if (!groups.has(fixed)) groups.set(fixed, []);
      groups.get(fixed)!.push({ start: a, end: b });
    }

    const result: MapWallSegment[] = [];
    for (const [fixed, segs] of groups) {
      segs.sort((a, b) => a.start - b.start);
      let cur = { ...segs[0] };
      for (let i = 1; i < segs.length; i++) {
        if (segs[i].start <= cur.end) {
          cur.end = Math.max(cur.end, segs[i].end);
        } else {
          result.push(this._makeWall(axis, fixed, cur.start, cur.end, wallType));
          cur = { ...segs[i] };
        }
      }
      result.push(this._makeWall(axis, fixed, cur.start, cur.end, wallType));
    }
    return result;
  }

  private _makeWall(axis: 'h' | 'v', fixed: number, start: number, end: number, wallType?: MapWallType): MapWallSegment {
    if (axis === 'h') {
      return { x1: start, y1: fixed, x2: end, y2: fixed, wallType };
    }
    return { x1: fixed, y1: start, x2: fixed, y2: end, wallType };
  }

  private deduplicateWalls(walls: MapWallSegment[]): MapWallSegment[] {
    const seen = new Set<string>();
    const result: MapWallSegment[] = [];
    for (const w of walls) {
      const t = w.wallType || 'normal';
      const key = [
        Math.min(w.x1, w.x2), Math.min(w.y1, w.y2),
        Math.max(w.x1, w.x2), Math.max(w.y1, w.y2),
        t,
      ].join(',');
      if (!seen.has(key)) {
        seen.add(key);
        result.push(w);
      }
    }
    return result;
  }

  // ========================================
  // 预设模板
  // ========================================

  getPresets(): MapTemplate[] {
    return [
      // 16x16 标准
      this._presetEmptyRoom(),
      this._presetCrossCorridors(),
      this._presetLShape(),
      this._presetTwoRoomsWithDoor(),
      // 8x8 小地图
      this._presetSmallRoom(),
      this._presetSmallArena(),
      // 32x8 / 8x32 走廊
      this._presetLongCorridor(),
      this._presetVerticalPassage(),
    ];
  }

  // ---------- 16x16 ----------

  private _presetEmptyRoom(): MapTemplate {
    const t = this.createEmpty('空房间', 16, 16);
    t.description = '16×16 标准空房间';
    t.walls = this.autoGenerateWalls(t);
    return t;
  }

  private _presetCrossCorridors(): MapTemplate {
    const t = this.createEmpty('十字走廊', 16, 16);
    t.description = '16×16 十字形走廊';
    for (let r = 0; r < 16; r++) {
      for (let c = 0; c < 16; c++) {
        t.cells[r][c] = (r >= 6 && r <= 9) || (c >= 6 && c <= 9);
      }
    }
    t.walls = this.autoGenerateWalls(t);
    return t;
  }

  private _presetLShape(): MapTemplate {
    const t = this.createEmpty('L 形房间', 16, 16);
    t.description = '16×16 L 形布局';
    for (let r = 0; r < 16; r++) {
      for (let c = 0; c < 16; c++) {
        t.cells[r][c] = (r < 8) || (c < 8);
      }
    }
    t.walls = this.autoGenerateWalls(t);
    return t;
  }

  private _presetTwoRoomsWithDoor(): MapTemplate {
    const t = this.createEmpty('双房间带门', 16, 16);
    t.description = '16×16 两个房间，中间有门连接';
    for (let r = 0; r < 16; r++) {
      for (let c = 0; c < 16; c++) {
        t.cells[r][c] = r >= 1 && r <= 14 && c >= 1 && c <= 14;
      }
    }
    // Generate outer walls
    t.walls = this.autoGenerateWalls(t);
    // Add a dividing wall at column 8, with a door gap
    const dividerWalls: MapWallSegment[] = [
      { x1: 8, y1: 1, x2: 8, y2: 7, wallType: 'normal' },
      { x1: 8, y1: 7, x2: 8, y2: 8, wallType: 'door' },
      { x1: 8, y1: 8, x2: 8, y2: 14, wallType: 'normal' },
    ];
    t.walls.push(...dividerWalls);
    return t;
  }

  // ---------- 8x8 ----------

  private _presetSmallRoom(): MapTemplate {
    const t = this.createEmpty('小房间', 8, 8);
    t.description = '8×8 小型房间，带门出口';
    t.walls = this.autoGenerateWalls(t);
    // Replace bottom-center wall segment with a door
    t.walls = t.walls.filter(w => !(w.y1 === 8 && w.y2 === 8 && w.x1 === 3 && w.x2 === 5));
    t.walls.push({ x1: 3, y1: 8, x2: 5, y2: 8, wallType: 'door' });
    return t;
  }

  private _presetSmallArena(): MapTemplate {
    const t = this.createEmpty('小竞技场', 8, 8);
    t.description = '8×8 圆形竞技场';
    const pattern = [
      '00111100',
      '01111110',
      '11111111',
      '11111111',
      '11111111',
      '11111111',
      '01111110',
      '00111100',
    ];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        t.cells[r][c] = pattern[r][c] === '1';
      }
    }
    t.walls = this.autoGenerateWalls(t);
    return t;
  }

  // ---------- 32x8 横走廊 ----------

  private _presetLongCorridor(): MapTemplate {
    const t = this.createEmpty('长走廊', 32, 8);
    t.description = '32×8 带房间的长走廊';
    // Corridor in center rows 2-5, rooms at ends
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 32; c++) {
        const leftRoom = c >= 0 && c <= 6 && r >= 0 && r <= 7;
        const corridor = c >= 6 && c <= 25 && r >= 2 && r <= 5;
        const rightRoom = c >= 25 && c <= 31 && r >= 0 && r <= 7;
        t.cells[r][c] = leftRoom || corridor || rightRoom;
      }
    }
    const outerWalls = this.autoGenerateWalls(t);
    // Add interior doors at room-corridor junctions
    const doors: MapWallSegment[] = [
      { x1: 6, y1: 2, x2: 6, y2: 3, wallType: 'door' },
      { x1: 26, y1: 4, x2: 26, y2: 5, wallType: 'door' },
    ];
    t.walls = [...outerWalls, ...doors];
    return t;
  }

  // ---------- 8x32 纵走廊 ----------

  private _presetVerticalPassage(): MapTemplate {
    const t = this.createEmpty('纵向通道', 8, 32);
    t.description = '8×32 纵向多房间通道';
    for (let r = 0; r < 32; r++) {
      for (let c = 0; c < 8; c++) {
        const topRoom = r >= 0 && r <= 8;
        const corridor = r >= 8 && r <= 23 && c >= 2 && c <= 5;
        const bottomRoom = r >= 23 && r <= 31;
        t.cells[r][c] = topRoom || corridor || bottomRoom;
      }
    }
    const outerWalls = this.autoGenerateWalls(t);
    const doors: MapWallSegment[] = [
      { x1: 2, y1: 8, x2: 3, y2: 8, wallType: 'door' },
      { x1: 4, y1: 24, x2: 5, y2: 24, wallType: 'door' },
    ];
    t.walls = [...outerWalls, ...doors];
    return t;
  }
}
