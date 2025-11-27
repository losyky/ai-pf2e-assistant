import { MODULE_ID } from '../constants';

/**
 * 日志管理工具类
 * 提供统一的日志输出接口，支持调试模式控制
 */
export class Logger {
  /**
   * 检查是否处于调试模式
   * 从game.settings读取debugMode设置
   */
  private static isDebugMode(): boolean {
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

  /**
   * 调试日志 - 仅在调试模式下输出
   * 用于：模块初始化、UI渲染、拖拽交互等详细信息
   */
  static debug(message: string, ...args: any[]): void {
    if (this.isDebugMode()) {
      console.log(`[${MODULE_ID}] ${message}`, ...args);
    }
  }

  /**
   * 信息日志 - 仅在调试模式下输出
   * 用于：一般性信息输出
   */
  static info(message: string, ...args: any[]): void {
    if (this.isDebugMode()) {
      console.info(`[${MODULE_ID}] ${message}`, ...args);
    }
  }

  /**
   * 合成流程日志 - 始终输出
   * 用于：神龛合成、专长合成、装备合成等关键流程步骤
   */
  static logSynthesis(message: string, ...args: any[]): void {
    console.log(`[${MODULE_ID}][合成] ${message}`, ...args);
  }

  /**
   * AI调用日志 - 始终输出
   * 用于：AI API调用、响应解析、重试等AI相关操作
   */
  static logAI(message: string, ...args: any[]): void {
    console.log(`[${MODULE_ID}][AI] ${message}`, ...args);
  }

  /**
   * 警告日志 - 始终输出
   */
  static warn(message: string, ...args: any[]): void {
    console.warn(`[${MODULE_ID}] ${message}`, ...args);
  }

  /**
   * 错误日志 - 始终输出
   */
  static error(message: string, ...args: any[]): void {
    console.error(`[${MODULE_ID}] ${message}`, ...args);
  }

  /**
   * 分组日志开始 - 仅在调试模式下输出
   */
  static groupStart(label: string): void {
    if (this.isDebugMode()) {
      console.group(`[${MODULE_ID}] ${label}`);
    }
  }

  /**
   * 分组日志结束 - 仅在调试模式下输出
   */
  static groupEnd(): void {
    if (this.isDebugMode()) {
      console.groupEnd();
    }
  }
}

