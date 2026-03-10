export const MODULE_ID = 'ai-pf2e-assistant';
export const MODULE_NAME = 'AI PF2e 助手';

// 定义重要文件路径
export const TERMINOLOGY_DATA_FILE = 'terminology-data.json';
export const EXAMPLE_TERMS_FILE = 'static/example-terms.csv';

// 地图构建系统常量
import type { MapSizePreset } from './map-builder/types';

export const MAP_CELL_SIZE = 128;
export const MAP_DEFAULT_COLS = 16;
export const MAP_DEFAULT_ROWS = 16;
export const MAP_GUIDES_DIR = 'map-guides';
export const MAP_TILES_DIR = 'map-tiles';
export const MAP_COLOR_PASSABLE = '#CCCCCC';
export const MAP_COLOR_IMPASSABLE = '#111111';
export const MAP_COLOR_WALL = '#FF0000';
export const MAP_COLOR_WALL_AI = '#888888';
/** 用于 AI 结构图：不同墙类型对应不同颜色，与中文「替换」提示词一致
 *  使用高对比度纯色，避免颜色混淆，提升 AI 模型识别准确度
 */
export const MAP_COLOR_AI_WALL = '#FF0000';       // 纯红 → 墙壁
export const MAP_COLOR_AI_DOOR = '#00FF00';       // 纯绿 → 门/暗门（提升对比度）
export const MAP_COLOR_AI_ETHEREAL = '#00FFFF';   // 纯青 → 幽灵墙/传送门（提升对比度）
export const MAP_COLOR_AI_INVISIBLE = '#FF8800';  // 橙色 → 隐形墙（保持）
export const MAP_COLOR_AI_WINDOW = '#0000FF';     // 纯蓝 → 窗户（提升对比度）
export const MAP_WALL_LINE_WIDTH = 4;

/**
 * All grid presets where both dimensions are multiples of 128px
 * and match a Gemini-supported aspect ratio.
 */
export const MAP_SIZE_PRESETS: MapSizePreset[] = [
  { id: '8x8',   label: '8×8 小房间 (1K, 1:1)',    gridCols: 8,  gridRows: 8,  pixelWidth: 1024, pixelHeight: 1024, geminiAspectRatio: '1:1',  geminiImageSize: '1K' },
  { id: '16x16', label: '16×16 标准 (2K, 1:1)',     gridCols: 16, gridRows: 16, pixelWidth: 2048, pixelHeight: 2048, geminiAspectRatio: '1:1',  geminiImageSize: '2K' },
  { id: '32x8',  label: '32×8 横走廊 (2K, 4:1)',    gridCols: 32, gridRows: 8,  pixelWidth: 4096, pixelHeight: 1024, geminiAspectRatio: '4:1',  geminiImageSize: '2K' },
  { id: '8x32',  label: '8×32 纵走廊 (2K, 1:4)',    gridCols: 8,  gridRows: 32, pixelWidth: 1024, pixelHeight: 4096, geminiAspectRatio: '1:4',  geminiImageSize: '2K' },
  { id: '32x32', label: '32×32 大地图 (4K, 1:1)',   gridCols: 32, gridRows: 32, pixelWidth: 4096, pixelHeight: 4096, geminiAspectRatio: '1:1',  geminiImageSize: '4K' },
  { id: '36x29', label: '36×29 宽幅 (4K, 5:4)',     gridCols: 36, gridRows: 29, pixelWidth: 4608, pixelHeight: 3712, geminiAspectRatio: '5:4',  geminiImageSize: '4K' },
  { id: '29x36', label: '29×36 竖幅 (4K, 4:5)',     gridCols: 29, gridRows: 36, pixelWidth: 3712, pixelHeight: 4608, geminiAspectRatio: '4:5',  geminiImageSize: '4K' },
  { id: '43x24', label: '43×24 横长 (4K, 16:9)',    gridCols: 43, gridRows: 24, pixelWidth: 5504, pixelHeight: 3072, geminiAspectRatio: '16:9', geminiImageSize: '4K' },
  { id: '24x43', label: '24×43 竖长 (4K, 9:16)',    gridCols: 24, gridRows: 43, pixelWidth: 3072, pixelHeight: 5504, geminiAspectRatio: '9:16', geminiImageSize: '4K' },
];

export function getPresetForTemplate(cols: number, rows: number): MapSizePreset | undefined {
  return MAP_SIZE_PRESETS.find(p => p.gridCols === cols && p.gridRows === rows);
}

/**
 * 获取模块文件的完整路径
 * @param filePath 模块内的相对路径
 * @returns 完整的文件路径
 */
export function getModuleFilePath(filePath: string): string {
  return `modules/${MODULE_ID}/${filePath}`;
}

/**
 * 检查是否处于调试模式
 * @returns 如果调试模式开启返回true，否则返回false
 */
export function isDebugMode(): boolean {
  try {
    const game = (globalThis as any).game;
    if (game && game.settings) {
      return game.settings.get(MODULE_ID, 'debugMode') as boolean;
    }
  } catch (error) {
    // 如果settings未初始化，默认返回false
  }
  return false;
} 