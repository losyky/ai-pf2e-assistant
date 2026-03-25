import type { MapWallType, MapRotation, RoomType, RoomRarity } from './types';

export type { RoomType, RoomRarity };

export const ROOM_TYPE_CONFIG: Record<RoomType, { label: string; icon: string }> = {
  'corridor':  { label: '走廊',   icon: 'fas fa-road' },
  'entrance':  { label: '入口',   icon: 'fas fa-door-open' },
  'boss':      { label: 'Boss房', icon: 'fas fa-skull-crossbones' },
  'treasure':  { label: '宝库',   icon: 'fas fa-gem' },
  'trap':      { label: '陷阱房', icon: 'fas fa-exclamation-triangle' },
  'puzzle':    { label: '谜题房', icon: 'fas fa-puzzle-piece' },
  'rest':      { label: '休息区', icon: 'fas fa-campground' },
  'shop':      { label: '商店',   icon: 'fas fa-store' },
  'shrine':    { label: '神殿',   icon: 'fas fa-place-of-worship' },
  'empty':     { label: '空房',   icon: 'fas fa-square' },
  'custom':    { label: '自定义', icon: 'fas fa-tag' },
};

export const ROOM_RARITY_CONFIG: Record<RoomRarity, { label: string; color: string }> = {
  'common':   { label: '普通', color: '#AAAAAA' },
  'uncommon': { label: '罕见', color: '#33AA33' },
  'rare':     { label: '稀有', color: '#3366FF' },
  'unique':   { label: '独特', color: '#AA33FF' },
};

// ============================================================
// Portal analysis
// ============================================================

export type EdgeSide = 'top' | 'right' | 'bottom' | 'left';

export interface Portal {
  side: EdgeSide;
  /** Start index along the edge (in cells, 0-based) */
  startCell: number;
  /** Passable width in cells */
  width: number;
  /** Centre position offset (cells, from edge start) */
  centerOffset: number;
  /** Wall types present across this portal opening (empty = fully open) */
  wallTypes: MapWallType[];
}

export interface TemplateProfile {
  templateId: string;
  portals: Portal[];
  /** Number of impassable (black) cells */
  blackArea: number;
  /** Number of passable (grey) cells */
  greyArea: number;
  boundingBox: { cols: number; rows: number };
}

// ============================================================
// Maze configuration
// ============================================================

export interface MazeEndpointConfig {
  roomType: RoomType;
  count: number;
  minDepth: number;
  maxDepth?: number;
}

export interface MazeRoomPoolEntry {
  roomType: RoomType;
  weight: number;
  maxCount?: number;
}

export interface MazeConfig {
  mazeWidth: number;
  mazeHeight: number;
  entranceCount: number;

  endpoints: MazeEndpointConfig[];
  roomPool: MazeRoomPoolEntry[];

  allowRotation: boolean;
  branchingFactor: number;
  deadEndRatio: number;
  loopChance: number;

  wallMergeEnabled: boolean;
  randomSeed?: number;
  maxSolveTimeMs: number;
  corridorDensity: number;
}

export function createDefaultMazeConfig(): MazeConfig {
  return {
    mazeWidth: 5,
    mazeHeight: 5,
    entranceCount: 1,
    endpoints: [
      { roomType: 'boss', count: 1, minDepth: 3 },
    ],
    roomPool: [
      { roomType: 'corridor', weight: 3 },
      { roomType: 'empty', weight: 2 },
      { roomType: 'trap', weight: 1 },
      { roomType: 'treasure', weight: 1 },
    ],
    allowRotation: false,
    branchingFactor: 0.4,
    deadEndRatio: 0.2,
    loopChance: 0.1,
    wallMergeEnabled: true,
    maxSolveTimeMs: 10000,
    corridorDensity: 0.3,
  };
}

// ============================================================
// Maze layout (solver output)
// ============================================================

export interface MazeCellPlacement {
  templateId: string;
  rotation: MapRotation;
  /** Grid position in the maze grid (not pixel coords) */
  gridX: number;
  gridY: number;
}

export interface MazeLayout {
  config: MazeConfig;
  placements: MazeCellPlacement[];
  /** BFS depth from entrance for each placement (index-aligned) */
  depths: number[];
  entranceIndices: number[];
}

// ============================================================
// Wall merge priority
// ============================================================

/**
 * Higher number = higher priority when merging overlapping walls.
 * Impassable walls beat passable ones; secret-door > door > ethereal.
 */
export const WALL_MERGE_PRIORITY: Record<MapWallType, number> = {
  'normal':      60,
  'invisible':   50,
  'window':      40,
  'secret-door': 30,
  'door':        20,
  'ethereal':    10,
};

// ============================================================
// Occupancy matrix
// ============================================================

export type OccupancyState = 'free' | 'black' | 'grey';
