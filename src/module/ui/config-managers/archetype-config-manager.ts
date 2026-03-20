/**
 * 变体生成器配置管理器
 * 管理变体生成系统的模型配置
 */

import { BaseConfigManager } from './base-config-manager';
import { MODULE_ID } from '../../constants';

declare const game: Game;

export class ArchetypeConfigManager extends BaseConfigManager {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'ai-pf2e-archetype-config',
      title: '变体生成器配置',
      template: `modules/${MODULE_ID}/templates/config-managers/archetype-config-manager.html`,
      width: 650
    });
  }

  async getData(options?: any): Promise<any> {
    const data = await super.getData(options);
    
    return foundry.utils.mergeObject(data, {
      models: {
        design: this.getSetting('archetypeDesignModel') || 'gpt-4o',
        generate: this.getSetting('archetypeGenerateModel') || 'gpt-4o'
      }
    });
  }

  async _updateObject(event: Event, formData: any): Promise<void> {
    try {
      await this.saveSettings({
        'archetypeDesignModel': formData.designModel,
        'archetypeGenerateModel': formData.generateModel
      });

      this.showSuccess('变体生成器配置已保存');
    } catch (error) {
      console.error('Failed to save archetype config:', error);
      this.showError('保存配置失败，请查看控制台了解详情');
    }
  }

  activateListeners(html: JQuery): void {
    super.activateListeners(html);

    html.find('button[name="close"]').on('click', () => this.close());
  }
}
