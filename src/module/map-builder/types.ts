export type MapWallType = 'normal' | 'door' | 'secret-door' | 'ethereal' | 'invisible' | 'window';

export interface MapWallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  wallType?: MapWallType;
}

/**
 * FVTT wall document properties keyed by our wall type.
 */
/**
 * FVTT V12+ wall restriction values:
 *   NONE=0, LIMITED=10, NORMAL=20
 * Door types: NONE=0, DOOR=1, SECRET=2
 * Door states: CLOSED=0, OPEN=1, LOCKED=2
 */
export const WALL_TYPE_CONFIG: Record<MapWallType, {
  label: string;
  editorColor: string;
  editorDash: number[];
  fvtt: { move: number; sense: number; door: number; ds?: number };
}> = {
  'normal':      { label: '普通墙',   editorColor: '#FF3333', editorDash: [],       fvtt: { move: 20, sense: 20, door: 0 } },
  'door':        { label: '门',       editorColor: '#33AAFF', editorDash: [],       fvtt: { move: 20, sense: 20, door: 1, ds: 0 } },
  'secret-door': { label: '暗门',     editorColor: '#AA33FF', editorDash: [],       fvtt: { move: 20, sense: 20, door: 2, ds: 0 } },
  'ethereal':    { label: '幽灵墙',   editorColor: '#44DDAA', editorDash: [6, 4],   fvtt: { move: 0, sense: 20, door: 0 } },
  'invisible':   { label: '隐形墙',   editorColor: '#FFAA33', editorDash: [3, 3],   fvtt: { move: 20, sense: 0, door: 0 } },
  'window':      { label: '窗户',     editorColor: '#66CCFF', editorDash: [8, 3],   fvtt: { move: 20, sense: 10, door: 0 } },
};

export interface MapTemplate {
  id: string;
  name: string;
  description: string;
  gridCols: number;
  gridRows: number;
  cellSize: number;
  cells: boolean[][];
  walls: MapWallSegment[];
}

export interface MapSizePreset {
  id: string;
  label: string;
  gridCols: number;
  gridRows: number;
  pixelWidth: number;
  pixelHeight: number;
  geminiAspectRatio: string;
  geminiImageSize: string;
}

export interface MapStyleConfig {
  stylePrompt: string;
  negativePrompt: string;
  imageModel: string;
  styleReferenceImage?: string;
  /** 有风格参考图时是否仍使用地图风格提示词；默认 true；设为 false 则仅用参考图风格 */
  useStylePromptWhenHasRefImage?: boolean;
  /** 提示词语言：'zh' 中文，'en' 英文；默认 'zh' */
  promptLanguage?: 'zh' | 'en';
}

export interface MapDropData {
  type: 'MapTemplate';
  templateId: string;
}
