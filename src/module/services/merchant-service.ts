/**
 * 商人生成服务
 * 基于 RoguelikeDrawService 的筛选逻辑，随机生成商人 NPC 及其货物库存。
 * 对于非物品类型（feat/spell/action）自动生成学习卷轴消耗品。
 */

import { RoguelikeDrawService, DrawPoolItem, RoguelikeDrawConfig } from './roguelike-draw-service';

export interface MerchantTypeConfig {
  id: string;
  name: string;
  description?: string;

  contentTypes: string[];
  featCategories?: string[];
  equipmentCategories?: string[];
  levelRange: { min: number; max: number };
  rarityFilter?: string[];
  requiredTraits?: string[];
  excludedTraits?: string[];
  banListIds?: string[];

  itemCount: { min: number; max: number };
  priceMultiplier?: number;

  scrollPrefix?: string;
  scrollImg?: string;
}

export interface MerchantGenerateConfig {
  typeId?: string;
  name?: string;
  /** 直接提供完整配置（优先于 typeId） */
  contentTypes?: string[];
  featCategories?: string[];
  equipmentCategories?: string[];
  levelRange?: { min: number; max: number };
  rarityFilter?: string[];
  requiredTraits?: string[];
  excludedTraits?: string[];
  banListIds?: string[];
  itemCount?: { min: number; max: number };
  priceMultiplier?: number;
  scrollPrefix?: string;
  scrollImg?: string;
  /** 是否在生成后打开商人表单 */
  openSheet?: boolean;
}

const DEFAULT_SCROLL_IMG = 'icons/sundries/scrolls/scroll-runed-brown-purple.webp';
const DEFAULT_SCROLL_PREFIX = '学习卷轴：';

/**
 * 按等级计算学习卷轴基础价格 (gp)
 * 参考 PF2e 卷轴价格表并做简化
 */
const SCROLL_PRICE_BY_LEVEL: Record<number, number> = {
  0: 2, 1: 4, 2: 7, 3: 12, 4: 20,
  5: 30, 6: 50, 7: 70, 8: 100,
  9: 150, 10: 200, 11: 300, 12: 400,
  13: 600, 14: 900, 15: 1300, 16: 2000,
  17: 3000, 18: 5000, 19: 8000, 20: 14000,
};

function getScrollPrice(level: number): number {
  if (level <= 0) return SCROLL_PRICE_BY_LEVEL[0];
  if (level >= 20) return SCROLL_PRICE_BY_LEVEL[20];
  return SCROLL_PRICE_BY_LEVEL[level] ?? SCROLL_PRICE_BY_LEVEL[0];
}

const SOURCE_TAB_LABEL: Record<string, string> = {
  feat: '专长',
  spell: '法术',
  action: '动作',
};

export class MerchantService {

  /**
   * 从 game.settings 加载已保存的商人类型配置列表
   */
  static getMerchantTypes(): MerchantTypeConfig[] {
    try {
      return (game as any).settings?.get('ai-pf2e-assistant', 'merchantTypes') || [];
    } catch {
      return [];
    }
  }

  /**
   * 保存商人类型配置列表
   */
  static async saveMerchantTypes(types: MerchantTypeConfig[]): Promise<void> {
    await (game as any).settings.set('ai-pf2e-assistant', 'merchantTypes', types);
  }

  /**
   * 根据 ID 查找商人类型配置
   */
  static getMerchantTypeById(typeId: string): MerchantTypeConfig | undefined {
    return this.getMerchantTypes().find(t => t.id === typeId);
  }

  /**
   * 生成商人 Actor（PF2e loot 类型）
   */
  static async generateMerchant(config: MerchantGenerateConfig): Promise<any> {
    const resolved = this.resolveConfig(config);
    if (!resolved) {
      (globalThis as any).ui?.notifications?.error('无效的商人配置');
      return null;
    }

    const { name, typeConfig } = resolved;

    await RoguelikeDrawService.initTabs(typeConfig.contentTypes);

    const drawConfig: RoguelikeDrawConfig = {
      contentTypes: typeConfig.contentTypes,
      featCategories: typeConfig.featCategories,
      equipmentCategories: typeConfig.equipmentCategories,
      levelRange: typeConfig.levelRange,
      rarityFilter: typeConfig.rarityFilter,
      requiredTraits: typeConfig.requiredTraits,
      excludedTraits: typeConfig.excludedTraits,
      banListIds: typeConfig.banListIds,
    };

    const pool = RoguelikeDrawService.buildItemPool(drawConfig);
    if (pool.length === 0) {
      (globalThis as any).ui?.notifications?.warn('当前筛选条件下没有可用物品，请调整商人配置');
      return null;
    }

    const { min, max } = typeConfig.itemCount;
    const count = min + Math.floor(Math.random() * (max - min + 1));
    const drawnItems = RoguelikeDrawService.drawRandomItems(pool, count);

    if (drawnItems.length === 0) {
      (globalThis as any).ui?.notifications?.warn('抽取物品为空');
      return null;
    }

    const itemDataArray = await this.buildMerchantItems(
      drawnItems,
      typeConfig.priceMultiplier ?? 1,
      typeConfig.scrollPrefix ?? DEFAULT_SCROLL_PREFIX,
      typeConfig.scrollImg ?? DEFAULT_SCROLL_IMG,
    );

    const Actor = (globalThis as any).Actor;
    const merchant = await Actor.create({
      name: name,
      type: 'loot',
      img: 'icons/environment/settlement/market-stall.webp',
      system: {
        lootSheetType: 'Merchant',
      },
      items: itemDataArray,
    });

    if (merchant) {
      (globalThis as any).ui?.notifications?.info(`商人 "${name}" 已生成（${itemDataArray.length} 件商品）`);

      if (config.openSheet !== false) {
        merchant.sheet?.render(true);
      }
    }

    return merchant;
  }

  /**
   * 解析生成配置：typeId 指定预设 或 内联配置
   */
  private static resolveConfig(config: MerchantGenerateConfig): { name: string; typeConfig: MerchantTypeConfig } | null {
    if (config.typeId) {
      const preset = this.getMerchantTypeById(config.typeId);
      if (!preset) {
        console.error(`[MerchantService] 未找到商人类型: ${config.typeId}`);
        return null;
      }
      return {
        name: config.name || preset.name,
        typeConfig: { ...preset },
      };
    }

    if (config.contentTypes && config.contentTypes.length > 0) {
      return {
        name: config.name || '商人',
        typeConfig: {
          id: 'inline',
          name: config.name || '商人',
          contentTypes: config.contentTypes,
          featCategories: config.featCategories,
          equipmentCategories: config.equipmentCategories,
          levelRange: config.levelRange || { min: 0, max: 20 },
          rarityFilter: config.rarityFilter,
          requiredTraits: config.requiredTraits,
          excludedTraits: config.excludedTraits,
          banListIds: config.banListIds,
          itemCount: config.itemCount || { min: 5, max: 15 },
          priceMultiplier: config.priceMultiplier,
          scrollPrefix: config.scrollPrefix,
          scrollImg: config.scrollImg,
        },
      };
    }

    return null;
  }

  /**
   * 将抽取结果转换为商人库存物品数据
   * equipment 直接从合集加载原始数据，feat/spell/action 生成学习卷轴
   */
  private static async buildMerchantItems(
    items: DrawPoolItem[],
    priceMultiplier: number,
    scrollPrefix: string,
    scrollImg: string,
  ): Promise<any[]> {
    const result: any[] = [];

    for (const item of items) {
      try {
        if (item.sourceTab === 'equipment') {
          const fullData = await RoguelikeDrawService.loadFullItemData(item.uuid);
          if (fullData) {
            if (priceMultiplier !== 1 && fullData.system?.price?.value) {
              fullData.system.price.value = this.multiplyPrice(fullData.system.price.value, priceMultiplier);
            }
            delete fullData._id;
            result.push(fullData);
          }
        } else {
          const scrollData = this.createScrollItem(item, priceMultiplier, scrollPrefix, scrollImg);
          result.push(scrollData);
        }
      } catch (error) {
        console.warn(`[MerchantService] 处理物品失败: ${item.name}`, error);
      }
    }

    return result;
  }

  /**
   * 为非 equipment 物品创建学习卷轴消耗品
   */
  private static createScrollItem(
    item: DrawPoolItem,
    priceMultiplier: number,
    scrollPrefix: string,
    scrollImg: string,
  ): any {
    const basePrice = getScrollPrice(item.level);
    const finalPrice = Math.round(basePrice * priceMultiplier);
    const typeLabel = SOURCE_TAB_LABEL[item.sourceTab] || item.sourceTab;

    return {
      name: `${scrollPrefix}${item.name}`,
      type: 'consumable',
      img: scrollImg,
      system: {
        description: {
          value: `<p>使用此卷轴可以学习以下${typeLabel}：</p>`
            + `<p><strong>@UUID[${item.uuid}]{${item.name}}</strong></p>`
            + `<p><em>等级 ${item.level} · ${this.localizeRarity(item.rarity)}</em></p>`,
        },
        consumableType: { value: 'other' },
        price: { value: { gp: finalPrice } },
        traits: {
          value: ['consumable'],
          rarity: item.rarity || 'common',
        },
        quantity: 1,
        weight: { value: 'L' },
        usage: { value: 'held-in-one-hand' },
      },
    };
  }

  /**
   * 对 PF2e 价格对象应用倍率
   */
  private static multiplyPrice(priceValue: any, multiplier: number): any {
    if (!priceValue || typeof priceValue !== 'object') return priceValue;
    const result = { ...priceValue };
    for (const key of ['pp', 'gp', 'sp', 'cp']) {
      if (typeof result[key] === 'number') {
        result[key] = Math.round(result[key] * multiplier);
      }
    }
    return result;
  }

  private static localizeRarity(rarity: string): string {
    const map: Record<string, string> = {
      common: '普通',
      uncommon: '罕见',
      rare: '稀有',
      unique: '独特',
    };
    return map[rarity] || rarity;
  }
}
