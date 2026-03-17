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
  /** 装备子分类过滤（仅对 equipment tab 生效），为空则不过滤。按 item type 筛选 */
  equipmentCategories?: string[];
  levelRange?: { min: number; max: number };
  rarityFilter?: string[];
  requiredTraits?: string[];
  excludedTraits?: string[];
  allowDuplicates?: boolean;
  /** 应用的 banlist ID 列表（来自模块设置中的 roguelikeBanlists） */
  banListIds?: string[];
  title?: string;
  /** 触发本次抽取的宏UUID，用于点数系统追踪 */
  macroUuid?: string;
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

/** PF2e 装备子分类配置（按 item type 区分） */
export const EQUIPMENT_CATEGORIES: Record<string, string> = {
  weapon:     'TYPES.Item.weapon',
  armor:      'TYPES.Item.armor',
  shield:     'TYPES.Item.shield',
  equipment:  'TYPES.Item.equipment',
  consumable: 'TYPES.Item.consumable',
  treasure:   'TYPES.Item.treasure',
  backpack:   'TYPES.Item.backpack',
  kit:        'TYPES.Item.kit',
};

const TAB_NAMES = ['feat', 'spell', 'equipment', 'action'] as const;

/** 合法的装备文档类型集合 */
const EQUIPMENT_TYPE_SET = new Set(Object.keys(EQUIPMENT_CATEGORIES));
type TabName = typeof TAB_NAMES[number];

export class RoguelikeDrawService {

  private static getCompendiumBrowser(): any {
    return (game as any).pf2e?.compendiumBrowser;
  }

  /**
   * UUID → 物品文档类型 (weapon/armor/shield/equipment/consumable/...) 的映射缓存。
   * PF2e CompendiumBrowser 的 tab.indexData 不一定包含 Foundry 标准的 `type` 字段，
   * 因此需要从原始 pack index 中提取并缓存。
   */
  private static equipmentTypeMap: Map<string, string> = new Map();

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

    // 若需要使用 equipment tab，构建 UUID→type 缓存
    if (validTypes.includes('equipment') && this.equipmentTypeMap.size === 0) {
      await this.buildEquipmentTypeMap();
    }
  }

  /**
   * 从 indexData 的 options 中提取装备类型。
   * PF2e v13-dev 将 type 编码在 options Set 中，格式为 "type:weapon"、"type:armor" 等。
   */
  private static extractTypeFromOptions(options: Set<string> | string[]): string | null {
    const optionsArray = Array.isArray(options) ? options : Array.from(options);
    for (const opt of optionsArray) {
      if (opt.startsWith('type:') && !opt.includes(':category:') && !opt.includes(':group:')) {
        const type = opt.substring(5); // 去掉 "type:" 前缀
        if (EQUIPMENT_TYPE_SET.has(type)) {
          return type;
        }
      }
    }
    return null;
  }

  /**
   * 从 indexData 的 options 中提取专长分类。
   * PF2e v13-dev 将 category 编码在 options Set 中，格式为 "category:general"、"category:skill" 等。
   */
  private static extractCategoryFromOptions(options: Set<string> | string[]): string | null {
    const optionsArray = Array.isArray(options) ? options : Array.from(options);
    for (const opt of optionsArray) {
      if (opt.startsWith('category:')) {
        return opt.substring(9); // 去掉 "category:" 前缀
      }
    }
    return null;
  }

  /**
   * 从 indexData 的 options 中提取特质列表。
   * PF2e v13-dev 将 traits 编码在 options Set 中，格式为 "trait:fire"、"trait:healing" 等。
   */
  private static extractTraitsFromOptions(options: Set<string> | string[]): string[] {
    const optionsArray = Array.isArray(options) ? options : Array.from(options);
    const traits: string[] = [];
    for (const opt of optionsArray) {
      if (opt.startsWith('trait:')) {
        traits.push(opt.substring(6)); // 去掉 "trait:" 前缀
      }
    }
    return traits;
  }

  /**
   * 从 Foundry 原始 pack index 构建 UUID→type 映射。
   * 仅在首次需要时执行一次，后续复用缓存。
   */
  private static async buildEquipmentTypeMap(): Promise<void> {
    const browser = this.getCompendiumBrowser();
    if (!browser) return;

    const tab = browser.tabs.equipment;
    if (!tab?.isInitialized || !tab.indexData) return;

    console.log('[RoguelikeDrawService] 开始构建装备类型映射...');

    // 策略1：检查 indexData 是否直接包含 type 字段（旧版本 PF2e）
    let foundDirectType = false;
    for (const entry of tab.indexData) {
      if (entry.type && EQUIPMENT_TYPE_SET.has(entry.type)) {
        foundDirectType = true;
        break;
      }
    }

    if (foundDirectType) {
      // indexData 本身已包含 type，直接建立映射
      for (const e of tab.indexData) {
        if (e.type) this.equipmentTypeMap.set(e.uuid, e.type);
      }
      console.log(`[RoguelikeDrawService] ✓ 从 indexData.type 构建装备类型映射: ${this.equipmentTypeMap.size} 条`);
      return;
    }

    // 策略2：从 indexData 的 options 中提取 type（新版本 PF2e v13-dev）
    let foundInOptions = false;
    for (const entry of tab.indexData) {
      if (entry.options) {
        const type = this.extractTypeFromOptions(entry.options);
        if (type) {
          this.equipmentTypeMap.set(entry.uuid, type);
          foundInOptions = true;
        }
      }
    }

    if (foundInOptions) {
      console.log(`[RoguelikeDrawService] ✓ 从 indexData.options 提取装备类型映射: ${this.equipmentTypeMap.size} 条`);
      return;
    }

    // 策略3：回退到原始 pack index（最后手段）
    console.log('[RoguelikeDrawService] indexData 不含 type 信息，回退到 pack index...');
    const g = game as any;
    if (!g.packs) return;

    for (const pack of g.packs) {
      if (pack.documentName !== 'Item') continue;
      try {
        const index = await pack.getIndex();
        for (const entry of index) {
          if (EQUIPMENT_TYPE_SET.has(entry.type)) {
            this.equipmentTypeMap.set(entry.uuid, entry.type);
          }
        }
      } catch {
        // 忽略无法访问的 pack
      }
    }
    console.log(`[RoguelikeDrawService] ✓ 从 pack index 构建装备类型映射: ${this.equipmentTypeMap.size} 条`);
  }

  /**
   * 构建物品池：从 CompendiumBrowser 的 indexData 中按条件筛选
   */
  static buildItemPool(config: RoguelikeDrawConfig): DrawPoolItem[] {
    const browser = this.getCompendiumBrowser();
    if (!browser) {
      console.error('[RoguelikeDrawService] CompendiumBrowser 不可用');
      return [];
    }

    const contentTypes = config.contentTypes || ['feat'];
    const featCategories = config.featCategories && config.featCategories.length > 0
      ? new Set(config.featCategories)
      : null;
    const equipmentCategories = config.equipmentCategories && config.equipmentCategories.length > 0
      ? new Set(config.equipmentCategories)
      : null;
    const levelMin = config.levelRange?.min ?? 0;
    const levelMax = config.levelRange?.max ?? 20;
    const requiredTraits = config.requiredTraits || [];
    const excludedTraits = config.excludedTraits || [];
    const rarityFilter = config.rarityFilter || [];

    // 调试：输出配置信息
    console.log('[RoguelikeDrawService] buildItemPool 配置:', {
      contentTypes,
      featCategories: featCategories ? Array.from(featCategories) : null,
      equipmentCategories: equipmentCategories ? Array.from(equipmentCategories) : null,
      levelRange: { min: levelMin, max: levelMax },
      requiredTraits,
      excludedTraits,
      rarityFilter,
      equipmentTypeMapSize: this.equipmentTypeMap.size
    });

    // 构建 banlist 排除集合
    const bannedUuids = this.resolveBannedUuids(config.banListIds || []);

    const pool: DrawPoolItem[] = [];
    let equipmentFilteredCount = 0; // 调试：记录被装备分类过滤掉的数量
    let totalEquipmentCount = 0; // 调试：记录总装备数量
    let traitFilteredCount = 0; // 调试：记录被特质过滤掉的数量
    let totalProcessedCount = 0; // 调试：记录总处理数量

    for (const tabName of contentTypes) {
      const tab = browser.tabs[tabName];
      if (!tab || !tab.isInitialized || !tab.indexData) {
        console.warn(`[RoguelikeDrawService] Tab ${tabName} 不可用或未初始化`);
        continue;
      }

      console.log(`[RoguelikeDrawService] 处理 ${tabName} tab，共 ${tab.indexData.length} 条数据`);

      for (const entry of tab.indexData) {
        totalProcessedCount++;
        
        // 统计装备数量
        if (tabName === 'equipment') {
          totalEquipmentCount++;
        }

        // Ban list 过滤
        if (bannedUuids.has(entry.uuid)) continue;

        const entryLevel = this.getEntryLevel(entry, tabName);
        const entryRarity = entry.rarity || 'common';
        
        // 获取 traits：直接字段 → options 提取 → 空数组
        let entryTraits: string[] = entry.traits || [];
        if (entryTraits.length === 0 && entry.options) {
          entryTraits = this.extractTraitsFromOptions(entry.options);
        }
        
        // 获取 category：直接字段 → options 提取 → 空字符串
        let entryCategory: string = entry.category || '';
        if (!entryCategory && entry.options) {
          entryCategory = this.extractCategoryFromOptions(entry.options) || '';
        }

        // feat 子分类过滤
        if (tabName === 'feat' && featCategories !== null) {
          if (!featCategories.has(entryCategory)) continue;
        }

        // equipment 子分类过滤（按 item type）
        // 注意：PF2e v13-dev 将 type 编码在 options 中，格式为 "type:weapon"
        if (tabName === 'equipment' && equipmentCategories !== null) {
          // 多层 fallback：直接字段 → options 提取 → 映射表 → 空字符串
          let entryType = entry.type || '';
          
          if (!entryType && entry.options) {
            entryType = this.extractTypeFromOptions(entry.options) || '';
          }
          
          if (!entryType) {
            entryType = this.equipmentTypeMap.get(entry.uuid) || '';
          }
          
          // 调试：记录前5个装备的类型信息
          if (totalEquipmentCount <= 5) {
            console.log(`[RoguelikeDrawService] 装备 #${totalEquipmentCount}:`, {
              name: entry.name,
              'entry.type': entry.type,
              'entry.options': entry.options ? Array.from(entry.options).filter((o: string) => o.startsWith('type:')) : undefined,
              '从options提取': entry.options ? this.extractTypeFromOptions(entry.options) : null,
              '从映射表获取': this.equipmentTypeMap.get(entry.uuid),
              '最终类型': entryType,
              '是否匹配': equipmentCategories.has(entryType)
            });
          }
          
          if (!equipmentCategories.has(entryType)) {
            equipmentFilteredCount++;
            continue;
          }
        }

        const filterResult = this.matchesFilter(entryTraits, entryRarity, entryLevel, levelMin, levelMax, requiredTraits, excludedTraits, rarityFilter);
        
        // 调试：输出前5个被特质过滤掉的物品
        if (!filterResult && requiredTraits.length > 0 && traitFilteredCount < 5) {
          console.log(`[RoguelikeDrawService] 特质过滤示例 #${traitFilteredCount + 1}:`, {
            name: entry.name,
            entryTraits,
            requiredTraits,
            '是否匹配': requiredTraits.map(t => ({
              required: t,
              found: entryTraits.includes(t)
            }))
          });
        }
        
        if (!filterResult) {
          if (requiredTraits.length > 0) {
            traitFilteredCount++;
          }
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

    // 调试日志：输出最终统计信息
    console.log('[RoguelikeDrawService] buildItemPool 完成:', {
      物品池大小: pool.length,
      总处理数量: totalProcessedCount,
      总装备数量: totalEquipmentCount,
      被装备分类过滤掉: equipmentFilteredCount,
      被特质过滤掉: traitFilteredCount
    });

    // 调试日志：如果使用了装备分类过滤且物品池为空，输出诊断信息
    if (contentTypes.includes('equipment') && equipmentCategories !== null && pool.length === 0) {
      console.error('[RoguelikeDrawService] ❌ 装备物品池为空！诊断信息:', {
        请求的分类: Array.from(equipmentCategories),
        总装备数量: totalEquipmentCount,
        被过滤掉的数量: equipmentFilteredCount,
        类型映射表大小: this.equipmentTypeMap.size,
        '提示': '如果类型映射表为空，说明 indexData 不含 type 字段且 pack index 加载失败'
      });
      
      // 输出前10个装备条目的实际结构供调试
      const tab = browser.tabs.equipment;
      if (tab?.indexData && tab.indexData.length > 0) {
        console.error('[RoguelikeDrawService] 前10个装备条目的实际结构:', 
          tab.indexData.slice(0, 10).map((e: any) => ({
            name: e.name,
            uuid: e.uuid,
            'entry.type': e.type,
            '从映射表获取的type': this.equipmentTypeMap.get(e.uuid),
            category: e.category,
            level: e.level,
            '所有字段': Object.keys(e).join(', ')
          }))
        );
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

    // 将特质数组转换为小写，用于不区分大小写的匹配
    const traitsLower = traits.map(t => t.toLowerCase());

    for (const t of requiredTraits) {
      const tLower = t.toLowerCase();
      // 使用不区分大小写的匹配
      if (!traitsLower.includes(tLower)) {
        return false;
      }
    }

    for (const t of excludedTraits) {
      const tLower = t.toLowerCase();
      // 使用不区分大小写的匹配
      if (traitsLower.includes(tLower)) {
        return false;
      }
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

  private static readonly EQUIPMENT_CATEGORY_FALLBACK: Record<string, string> = {
    weapon: '武器',
    armor: '护甲',
    shield: '盾牌',
    equipment: '装备',
    consumable: '消耗品',
    treasure: '财宝',
    backpack: '背包',
    kit: '套组',
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

  /**
   * 获取装备子分类选项列表（已本地化）
   */
  static getEquipmentCategoryOptions(): { value: string; label: string }[] {
    const g = game as any;
    const resolve = (value: string, labelKey: string): string => {
      const localized = g.i18n?.localize(labelKey);
      if (localized && localized !== labelKey) return localized;
      return this.EQUIPMENT_CATEGORY_FALLBACK[value] || value;
    };

    return Object.entries(EQUIPMENT_CATEGORIES).map(([value, labelKey]) => ({
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
