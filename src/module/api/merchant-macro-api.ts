/**
 * 商人系统宏 API
 * 提供通过宏调用商人生成、配置管理等功能
 */

import { MerchantService, MerchantGenerateConfig } from '../services/merchant-service';

export class MerchantMacroAPI {

  /**
   * 生成商人 NPC
   *
   * @example
   * // 使用预设商人类型
   * game.modules.get('ai-pf2e-assistant').api.merchant.generate({
   *   typeId: 'weapon-merchant',
   *   name: '铁匠铺老板'
   * });
   *
   * @example
   * // 使用内联配置
   * game.modules.get('ai-pf2e-assistant').api.merchant.generate({
   *   name: '游荡魔法师',
   *   contentTypes: ['spell', 'equipment'],
   *   equipmentCategories: ['consumable'],
   *   levelRange: { min: 1, max: 10 },
   *   itemCount: { min: 10, max: 20 }
   * });
   */
  static async generate(config: MerchantGenerateConfig = {}): Promise<any> {
    if (!(game as any).user?.isGM) {
      (globalThis as any).ui?.notifications?.error('只有 GM 可以生成商人');
      return null;
    }

    return MerchantService.generateMerchant(config);
  }

  /**
   * 打开商人类型配置管理器（仅 GM）
   */
  static async openConfig(): Promise<void> {
    if (!(game as any).user?.isGM) {
      (globalThis as any).ui?.notifications?.error('只有 GM 可以管理商人配置');
      return;
    }

    const { MerchantConfigApp } = await import('../ui/merchant-config-app');
    new MerchantConfigApp({}).render(true);
  }

  /**
   * 打开商人宏生成器（仅 GM）
   */
  static async openGenerator(): Promise<void> {
    if (!(game as any).user?.isGM) {
      (globalThis as any).ui?.notifications?.error('只有 GM 可以使用商人宏生成器');
      return;
    }

    const { MerchantGeneratorApp } = await import('../ui/merchant-generator-app');
    new MerchantGeneratorApp().render(true);
  }
}

export const MERCHANT_MACRO_EXAMPLES = {
  preset: `// 使用预设商人类型生成
game.modules.get('ai-pf2e-assistant').api.merchant.generate({
  typeId: 'weapon-merchant',
  name: '铁匠铺老板'
});`,

  inline: `// 内联配置生成商人
game.modules.get('ai-pf2e-assistant').api.merchant.generate({
  name: '游荡魔法师',
  contentTypes: ['spell', 'equipment'],
  equipmentCategories: ['consumable'],
  levelRange: { min: 1, max: 10 },
  itemCount: { min: 10, max: 20 }
});`,

  scrollMerchant: `// 学习卷轴商人（专长+法术）
game.modules.get('ai-pf2e-assistant').api.merchant.generate({
  name: '知识商人',
  contentTypes: ['feat', 'spell'],
  featCategories: ['general', 'skill'],
  levelRange: { min: 1, max: 8 },
  rarityFilter: ['common', 'uncommon'],
  itemCount: { min: 8, max: 15 }
});`,

  openConfig: `// 打开商人配置管理器（仅GM）
game.modules.get('ai-pf2e-assistant').api.merchant.openConfig();`,

  openGenerator: `// 打开商人宏生成器（仅GM）
game.modules.get('ai-pf2e-assistant').api.merchant.openGenerator();`,
};
