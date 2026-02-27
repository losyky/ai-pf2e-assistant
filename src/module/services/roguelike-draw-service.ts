/**
 * Roguelike 抽取服务
 * 基于 PF2e CompendiumBrowser 的索引数据进行筛选和随机抽取
 *
 * PF2e indexData 结构参考 (各 tab 略有不同):
 * - feat:      { name, img, uuid, level, traits: string[], rarity, category, ... }
 * - spell:     { name, img, uuid, rank, traits: string[], rarity, traditions, ... }
 * - equipment: { name, img, uuid, level, traits: string[], rarity, category, ... }
 * - action:    { name, img, uuid, traits: string[], actionType, category, ... } (无 level/rarity)
 *
 * PF2e featCategories (entry.category):
 *   ancestry, ancestryfeature, class, classfeature, general, skill, archetype, pfsboon, bonus
 */

export interface RoguelikeDrawConfig {
  actor?: any;
  totalDraws?: number;
  itemsPerDraw?: number;
  selectablePerDraw?: number;
  contentTypes?: string[];
  /** 专长子分类过滤（仅对 feat tab 生效），为空则不过滤 */
  featCategories?: string[];
  levelRange?: { min: number; max: number };
  rarityFilter?: string[];
  requiredTraits?: string[];
  excludedTraits?: string[];
  allowDuplicates?: boolean;
  /** 应用的 banlist ID 列表（来自模块设置中的 roguelikeBanlists） */
  banListIds?: string[];
  title?: string;
}

export interface DrawPoolItem {
  name: string;
  img: string;
  uuid: string;
  level: number;
  rarity: string;
  traits: string[];
  category: string;
  sourceTab: string;
}

/** PF2e 专长分类配置（key → 本地化翻译 key） */
export const FEAT_CATEGORIES: Record<string, string> = {
  ancestry:       'PF2E.Item.Feat.Category.Ancestry',
  ancestryfeature:'PF2E.Item.Feat.Category.AncestryFeature',
  class:          'PF2E.Item.Feat.Category.Class',
  classfeature:   'PF2E.Item.Feat.Category.ClassFeature',
  general:        'PF2E.Item.Feat.Category.General',
  skill:          'PF2E.Item.Feat.Category.Skill',
  archetype:      'PF2E.Item.Feat.Category.Archetype',
  pfsboon:        'PF2E.Item.Feat.Category.PFSBoon',
  bonus:          'PF2E.Item.Feat.Category.Bonus',
};

const TAB_NAMES = ['feat', 'spell', 'equipment', 'action'] as const;
type TabName = typeof TAB_NAMES[number];

export class RoguelikeDrawService {

  private static getCompendiumBrowser(): any {
    return (game as any).pf2e?.compendiumBrowser;
  }

  static async initTabs(contentTypes: string[]): Promise<void> {
    const browser = this.getCompendiumBrowser();
    if (!browser) {
      throw new Error('PF2e CompendiumBrowser 不可用，请确保 PF2e 系统已加载');
    }

    const validTypes = contentTypes.filter(t => TAB_NAMES.includes(t as TabName));
    if (validTypes.length === 0) {
      throw new Error('无效的内容类型: ' + contentTypes.join(', ') + '。有效类型: ' + TAB_NAMES.join(', '));
    }

    for (const tabName of validTypes) {
      const tab = browser.tabs[tabName];
      if (tab && !tab.isInitialized) {
        await tab.init();
      }
    }
  }

  /**
   * 构建物品池：从 CompendiumBrowser 的 indexData 中按条件筛选
   */
  static buildItemPool(config: RoguelikeDrawConfig): DrawPoolItem[] {
    const browser = this.getCompendiumBrowser();
    if (!browser) return [];

    const contentTypes = config.contentTypes || ['feat'];
    const featCategories = config.featCategories && config.featCategories.length > 0
      ? new Set(config.featCategories)
      : null;
    const levelMin = config.levelRange?.min ?? 0;
    const levelMax = config.levelRange?.max ?? 20;
    const requiredTraits = config.requiredTraits || [];
    const excludedTraits = config.excludedTraits || [];
    const rarityFilter = config.rarityFilter || [];

    // 构建 banlist 排除集合
    const bannedUuids = this.resolveBannedUuids(config.banListIds || []);

    const pool: DrawPoolItem[] = [];

    for (const tabName of contentTypes) {
      const tab = browser.tabs[tabName];
      if (!tab || !tab.isInitialized || !tab.indexData) continue;

      for (const entry of tab.indexData) {
        // Ban list 过滤
        if (bannedUuids.has(entry.uuid)) continue;

        const entryLevel = this.getEntryLevel(entry, tabName);
        const entryRarity = entry.rarity || 'common';
        const entryTraits: string[] = entry.traits || [];
        const entryCategory: string = entry.category || '';

        // feat 子分类过滤
        if (tabName === 'feat' && featCategories !== null) {
          if (!featCategories.has(entryCategory)) continue;
        }

        if (!this.matchesFilter(entryTraits, entryRarity, entryLevel, levelMin, levelMax, requiredTraits, excludedTraits, rarityFilter)) {
          continue;
        }

        pool.push({
          name: entry.name,
          img: entry.img,
          uuid: entry.uuid,
          level: entryLevel,
          rarity: entryRarity,
          traits: entryTraits,
          category: entryCategory,
          sourceTab: tabName,
        });
      }
    }

    return pool;
  }

  /**
   * 读取模块设置中的 banlist 数据，构建禁用 UUID 集合
   */
  private static resolveBannedUuids(banListIds: string[]): Set<string> {
    if (banListIds.length === 0) return new Set();

    const g = game as any;
    let allBanlists: RoguelikeBanList[] = [];
    try {
      allBanlists = g.settings?.get('ai-pf2e-assistant', 'roguelikeBanlists') || [];
    } catch { return new Set(); }

    const banned = new Set<string>();
    for (const id of banListIds) {
      const list = allBanlists.find((b: RoguelikeBanList) => b.id === id);
      if (list) {
        for (const item of list.items) {
          banned.add(item.uuid);
        }
      }
    }
    return banned;
  }

  /**
   * 获取条目的等级，法术用 rank，动作没有等级（返回 0）
   */
  private static getEntryLevel(entry: any, tabName: string): number {
    if (tabName === 'spell') {
      return entry.rank ?? entry.level ?? 0;
    }
    return entry.level ?? 0;
  }

  private static matchesFilter(
    traits: string[],
    rarity: string,
    level: number,
    levelMin: number,
    levelMax: number,
    requiredTraits: string[],
    excludedTraits: string[],
    rarityFilter: string[],
  ): boolean {
    if (level < levelMin || level > levelMax) return false;

    for (const t of requiredTraits) {
      if (!traits.includes(t)) return false;
    }

    for (const t of excludedTraits) {
      if (traits.includes(t)) return false;
    }

    if (rarityFilter.length > 0) {
      if (!rarityFilter.includes(rarity)) return false;
    }

    return true;
  }

  /**
   * Fisher-Yates 随机抽取
   */
  static drawRandomItems(pool: DrawPoolItem[], count: number, excludeUuids?: Set<string>): DrawPoolItem[] {
    let available = excludeUuids
      ? pool.filter(item => !excludeUuids.has(item.uuid))
      : [...pool];

    const resultCount = Math.min(count, available.length);
    const result: DrawPoolItem[] = [];

    for (let i = available.length - 1; i >= 0 && result.length < resultCount; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
      result.push(available[i]);
    }

    return result;
  }

  static async loadFullItemData(uuid: string): Promise<any> {
    try {
      const item = await (globalThis as any).fromUuid(uuid);
      return item ? item.toObject() : null;
    } catch (error) {
      console.error('[RoguelikeDrawService] 加载物品失败: ' + uuid, error);
      return null;
    }
  }

  static async getAvailableTraits(tabName: string): Promise<{ value: string; label: string }[]> {
    const browser = this.getCompendiumBrowser();
    if (!browser) return [];

    const tab = browser.tabs[tabName];
    if (!tab) return [];

    if (!tab.isInitialized) {
      await tab.init();
    }

    const filterData = await tab.getFilterData();
    return filterData?.traits?.options || [];
  }

  private static readonly FEAT_CATEGORY_FALLBACK: Record<string, string> = {
    ancestry: '族裔专长',
    ancestryfeature: '族裔特性',
    class: '职业专长',
    classfeature: '职业特性',
    general: '通用专长',
    skill: '技能专长',
    archetype: '典范专长',
    pfsboon: 'PFS恩惠',
    bonus: '额外专长',
  };

  /**
   * 获取专长分类选项列表（已本地化）
   */
  static getFeatCategoryOptions(): { value: string; label: string }[] {
    const g = game as any;
    const resolve = (value: string, labelKey: string): string => {
      const localized = g.i18n?.localize(labelKey);
      if (localized && localized !== labelKey) return localized;
      return this.FEAT_CATEGORY_FALLBACK[value] || value;
    };

    const configCategories = g.CONFIG?.PF2E?.featCategories;
    if (configCategories && typeof configCategories === 'object') {
      return Object.entries(configCategories).map(([value, labelKey]) => ({
        value,
        label: typeof labelKey === 'string' ? resolve(value, labelKey) : (this.FEAT_CATEGORY_FALLBACK[value] || value),
      }));
    }
    return Object.entries(FEAT_CATEGORIES).map(([value, labelKey]) => ({
      value,
      label: resolve(value, labelKey),
    }));
  }

  static getValidTabNames(): string[] {
    return [...TAB_NAMES];
  }
}

/** Ban list 数据结构 */
export interface RoguelikeBanList {
  id: string;
  name: string;
  items: RoguelikeBanListItem[];
}

export interface RoguelikeBanListItem {
  uuid: string;
  name: string;
  img: string;
  sourceTab: string;
  category?: string;
  level?: number;
}
