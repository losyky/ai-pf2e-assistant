/**
 * 配置管理器基类
 * 为所有子配置管理器提供通用功能
 */

import { MODULE_ID } from '../../constants';

declare const game: Game;
declare const ui: any;

export abstract class BaseConfigManager extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      width: 600,
      height: 'auto',
      classes: ['ai-pf2e-assistant', 'config-manager'],
      resizable: true,
      closeOnSubmit: false,
      submitOnChange: false,
      tabs: []
    });
  }

  /**
   * 获取配置值
   */
  protected getSetting(key: string): any {
    try {
      return game.settings.get(MODULE_ID, key);
    } catch (error) {
      console.warn(`Failed to get setting ${key}:`, error);
      return undefined;
    }
  }

  /**
   * 保存配置值
   */
  protected async setSetting(key: string, value: any): Promise<void> {
    try {
      await game.settings.set(MODULE_ID, key, value);
    } catch (error) {
      console.error(`Failed to set setting ${key}:`, error);
      throw error;
    }
  }

  /**
   * 批量保存配置
   */
  protected async saveSettings(settings: Record<string, any>): Promise<void> {
    const promises = Object.entries(settings).map(([key, value]) => 
      this.setSetting(key, value)
    );
    await Promise.all(promises);
  }

  /**
   * 显示成功消息
   */
  protected showSuccess(message: string): void {
    if (ui?.notifications) {
      ui.notifications.info(message);
    }
  }

  /**
   * 显示错误消息
   */
  protected showError(message: string): void {
    if (ui?.notifications) {
      ui.notifications.error(message);
    }
  }

  /**
   * 显示警告消息
   */
  protected showWarning(message: string): void {
    if (ui?.notifications) {
      ui.notifications.warn(message);
    }
  }

  /**
   * 子类必须实现getData来提供模板数据
   */
  abstract getData(options?: any): Promise<any> | any;

  /**
   * 子类必须实现_updateObject来处理表单提交
   */
  abstract _updateObject(event: Event, formData: any): Promise<void>;
}

