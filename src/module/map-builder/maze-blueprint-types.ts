import type { MapRotation, RoomType } from './types';

// ============================================================
// Maze AI Configuration
// ============================================================

export interface MazeAIConfig {
  templateCellSize: number;
  mazeWidth: number;
  mazeHeight: number;
  wallMergeEnabled: boolean;
  theme?: string;
}

/**
 * Square presets from MAP_SIZE_PRESETS that are suitable for maze tiles.
 * Maps preset ID → gridCols (which equals gridRows for square presets).
 */
export const MAZE_TEMPLATE_SIZE_OPTIONS: { id: string; label: string; cellSize: number }[] = [
  { id: '8x8',   label: '8×8 (1024×1024px)',   cellSize: 8 },
  { id: '16x16', label: '16×16 (2048×2048px)',  cellSize: 16 },
  { id: '32x32', label: '32×32 (4096×4096px)',  cellSize: 32 },
];

export function createDefaultMazeAIConfig(): MazeAIConfig {
  return {
    templateCellSize: 8,
    mazeWidth: 4,
    mazeHeight: 4,
    wallMergeEnabled: true,
    theme: '',
  };
}

// ============================================================
// Maze Blueprint (persisted)
// ============================================================

export interface MazeBlueprintPlacement {
  gridX: number;
  gridY: number;
  templateId: string;
  rotation: MapRotation;
}

export interface MazeBlueprint {
  id: string;
  name: string;
  description: string;
  createdAt: number;

  gridWidth: number;
  gridHeight: number;
  cellSize: number;

  templateIds: string[];
  placements: MazeBlueprintPlacement[];

  metadata?: {
    theme?: string;
    aiModel?: string;
    reasoning?: string;
    config?: MazeAIConfig;
  };
}

// ============================================================
// AI generation intermediate types
// ============================================================

export interface MazeAITemplateDef {
  name: string;
  roomType: RoomType;
  cells: boolean[][];
  walls: MazeAIWallDef[];
}

export interface MazeAIWallDef {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  wallType?: 'normal' | 'door' | 'secret-door' | 'window';
}

export interface MazeAIPlacementDef {
  gridX: number;
  gridY: number;
  templateName: string;
  rotation: 0 | 90 | 180 | 270;
}

export interface MazeAIGenerationResult {
  templates: MazeAITemplateDef[];
  layout: {
    placements: MazeAIPlacementDef[];
  };
  reasoning?: string;
}

// ============================================================
// Maze connectivity graph (system-generated, guarantees reachability)
// ============================================================

export interface PortRequirement {
  N: boolean;
  E: boolean;
  S: boolean;
  W: boolean;
}

export interface MazeConnectivityGraph {
  width: number;
  height: number;
  /** port requirements keyed by "x,y" */
  ports: Map<string, PortRequirement>;
}

// ============================================================
// Drop data for maze blueprint placement
// ============================================================

export interface MazeBlueprintDropData {
  type: 'MazeBlueprint';
  blueprintId: string;
}
