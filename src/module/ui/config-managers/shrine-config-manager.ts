/**
 * 神龛系统配置管理器
 * 管理神龛系统的模型配置和流程开关
 */

import { BaseConfigManager } from './base-config-manager';
import { MODULE_ID } from '../../constants';

declare const game: Game;

export class ShrineConfigManager extends BaseConfigManager {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'ai-pf2e-shrine-config',
      title: '神龛系统配置',
      template: `modules/${MODULE_ID}/templates/config-managers/shrine-config-manager.html`,
      width: 650
    });
  }

  async getData(options?: any): Promise<any> {
    const data = await super.getData(options);
    
    return foundry.utils.mergeObject(data, {
      models: {
        design: this.getSetting('shrineDesignModel') || 'gpt-4o',
        format: this.getSetting('shrineFormatModel') || 'gpt-4o',
        direct: this.getSetting('shrineDirectModel') || 'gpt-4o',
        iconPrompt: this.getSetting('shrineIconPromptModel') || 'gpt-4o-mini'
      },
      feat: {
        enableDesign: this.getSetting('shrineEnableDesign') ?? true,
        enableFormat: this.getSetting('shrineEnableFormat') ?? true
      },
      spell: {
        enableDesign: this.getSetting('shrineSpellDesignEnabled') ?? true,
        enableFormat: this.getSetting('shrineSpellFormatEnabled') ?? true
      }
    });
  }

  async _updateObject(event: Event, formData: any): Promise<void> {
    try {
      // 保存所有神龛配置
      await this.saveSettings({
        'shrineDesignModel': formData.designModel,
        'shrineFormatModel': formData.formatModel,
        'shrineDirectModel': formData.directModel,
        'shrineIconPromptModel': formData.iconPromptModel,
        'shrineEnableDesign': formData.featEnableDesign,
        'shrineEnableFormat': formData.featEnableFormat,
        'shrineSpellDesignEnabled': formData.spellEnableDesign,
        'shrineSpellFormatEnabled': formData.spellEnableFormat
      });

      this.showSuccess('神龛系统配置已保存');
    } catch (error) {
      console.error('Failed to save shrine config:', error);
      this.showError('保存配置失败，请查看控制台了解详情');
    }
  }

  activateListeners(html: JQuery): void {
    super.activateListeners(html);

    // 关闭按钮
    html.find('button[name="close"]').on('click', () => this.close());
  }
}

