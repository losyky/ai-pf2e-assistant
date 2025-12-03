/**
 * 术语系统配置管理器
 * 直接打开术语导入器
 */

import { BaseConfigManager } from './base-config-manager';
import { MODULE_ID } from '../../constants';

declare const game: Game;

// 导入术语导入器（延迟加载）
let terminologyImporter: any = null;

export class TerminologyConfigManager extends BaseConfigManager {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'ai-pf2e-terminology-config',
      title: '术语系统管理',
      template: `modules/${MODULE_ID}/templates/config-managers/terminology-config-manager.html`,
      width: 600
    });
  }

  async getData(options?: any): Promise<any> {
    const data = await super.getData(options);
    return data;
  }

  async _updateObject(event: Event, formData: any): Promise<void> {
    // 直接关闭，不需要保存
    this.close();
  }

  activateListeners(html: JQuery): void {
    super.activateListeners(html);
  }

  /**
   * 渲染时直接打开术语导入器
   */
  async render(force?: boolean, options?: any): Promise<any> {
    // 直接打开术语导入器，不显示自己
    await this._openTerminologyImporter();
    return this;
  }

  /**
   * 打开术语导入器
   */
  private async _openTerminologyImporter(): Promise<void> {
    try {
      // 动态导入术语导入器
      if (!terminologyImporter) {
        const module = await import('../terminology-importer');
        terminologyImporter = new module.TerminologyImporter();
      }
      
      terminologyImporter.render(true);
    } catch (error) {
      console.error('Failed to open terminology importer:', error);
    }
  }
}

