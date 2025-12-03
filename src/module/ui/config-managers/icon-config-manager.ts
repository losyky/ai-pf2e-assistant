/**
 * 图标生成配置管理器
 * 管理AI图标生成的相关配置
 */

import { BaseConfigManager } from './base-config-manager';
import { MODULE_ID } from '../../constants';

declare const game: Game;

export class IconConfigManager extends BaseConfigManager {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'ai-pf2e-icon-config',
      title: '图标生成配置',
      template: `modules/${MODULE_ID}/templates/config-managers/icon-config-manager.html`,
      width: 600
    });
  }

  async getData(options?: any): Promise<any> {
    const data = await super.getData(options);
    
    return foundry.utils.mergeObject(data, {
      enabled: this.getSetting('enableIconGeneration') ?? false,
      model: this.getSetting('imageModel') || 'flux-pro',
      size: this.getSetting('iconSize') || '1024x1024',
      style: this.getSetting('iconStyle') || 'fantasy art',
      // 尺寸选项
      sizeOptions: {
        '256x256': '256x256',
        '512x512': '512x512',
        '768x768': '768x768',
        '1024x1024': '1024x1024',
        '1024x768': '1024x768',
        '768x1024': '768x1024'
      },
      // 风格选项
      styleOptions: {
        'fantasy art': '奇幻艺术',
        'pixel art': '像素艺术',
        'realistic': '写实风格',
        'cartoon': '卡通风格',
        'medieval': '中世纪风格'
      }
    });
  }

  async _updateObject(event: Event, formData: any): Promise<void> {
    try {
      // 保存所有图标配置
      await this.saveSettings({
        'enableIconGeneration': formData.enabled,
        'imageModel': formData.model,
        'iconSize': formData.size,
        'iconStyle': formData.style
      });

      this.showSuccess('图标生成配置已保存');
    } catch (error) {
      console.error('Failed to save icon config:', error);
      this.showError('保存配置失败，请查看控制台了解详情');
    }
  }

  activateListeners(html: JQuery): void {
    super.activateListeners(html);

    // 关闭按钮
    html.find('button[name="close"]').on('click', () => this.close());
  }
}

