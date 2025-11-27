export const MODULE_ID = 'ai-pf2e-assistant';
export const MODULE_NAME = 'AI PF2e 助手';

// 定义重要文件路径
export const TERMINOLOGY_DATA_FILE = 'terminology-data.json';
export const EXAMPLE_TERMS_FILE = 'static/example-terms.csv';

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