/**
 * 平衡系统配置管理器
 * 管理平衡关键词系统
 */

import { BaseConfigManager } from './base-config-manager';
import { MODULE_ID } from '../../constants';

declare const game: Game;

// 导入平衡关键词管理器（延迟加载）
let balanceKeywordsManager: any = null;

export class BalanceConfigManager extends BaseConfigManager {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'ai-pf2e-balance-config',
      title: '平衡系统管理',
      template: `modules/${MODULE_ID}/templates/config-managers/balance-config-manager.html`,
      width: 600
    });
  }

  async getData(options?: any): Promise<any> {
    const data = await super.getData(options);
    
    // 获取关键词统计信息
    const stats = await this._getBalanceKeywordsStats();
    
    return foundry.utils.mergeObject(data, {
      stats: stats
    });
  }

  async _updateObject(event: Event, formData: any): Promise<void> {
    // 平衡系统管理器主要是打开子窗口，不需要保存配置
    this.close();
  }

  activateListeners(html: JQuery): void {
    super.activateListeners(html);

    // 打开关键词管理器按钮
    html.find('.open-balance-manager').on('click', async () => {
      await this._openBalanceManager();
    });

    // 重置为默认按钮
    html.find('.reset-keywords').on('click', async () => {
      await this._resetKeywords();
    });

    // 关闭按钮
    html.find('button[name="close"]').on('click', () => this.close());
  }

  /**
   * 获取关键词统计信息
   */
  private async _getBalanceKeywordsStats(): Promise<any> {
    try {
      // 尝试从平衡服务获取数据
      const { BalanceDataService } = await import('../../services/balance-data-service');
      const service = new BalanceDataService();
      const keywords = service.getAllKeywords() || [];
      
      // 按类别统计
      const byCategory: Record<string, number> = {};
      keywords.forEach((keyword: any) => {
        const category = keyword.category || 'general';
        byCategory[category] = (byCategory[category] || 0) + 1;
      });

      return {
        total: keywords.length,
        byCategory: byCategory
      };
    } catch (error) {
      console.warn('Failed to get balance keywords stats:', error);
      return {
        total: 0,
        byCategory: {}
      };
    }
  }

  /**
   * 打开关键词管理器
   */
  private async _openBalanceManager(): Promise<void> {
    try {
      // 动态导入平衡关键词管理器
      if (!balanceKeywordsManager) {
        const module = await import('../balance-keywords-manager');
        balanceKeywordsManager = new module.BalanceKeywordsManager();
      }
      
      balanceKeywordsManager.render(true);
    } catch (error) {
      console.error('Failed to open balance keywords manager:', error);
      this.showError('无法打开关键词管理器，请查看控制台了解详情');
    }
  }

  /**
   * 重置关键词为默认
   */
  private async _resetKeywords(): Promise<void> {
    const confirmed = await Dialog.confirm({
      title: '确认重置',
      content: '<p>确定要将所有关键词重置为默认值吗？</p><p><strong>此操作不可撤销！</strong></p>',
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    if (!confirmed) return;

    try {
      const { BalanceDataService } = await import('../../services/balance-data-service');
      const service = new BalanceDataService();
      await service.resetToDefaults();
      
      this.showSuccess('关键词已重置为默认值');
      
      // 刷新显示
      this.render(true);
    } catch (error) {
      console.error('Failed to reset keywords:', error);
      this.showError('重置失败，请查看控制台了解详情');
    }
  }
}

