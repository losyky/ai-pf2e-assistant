/**
 * 怪物抽取服务
 * 从 PF2e bestiary compendium packs 获取怪物数据，按条件筛选并随机抽取
 *
 * PF2e bestiary index 结构参考:
 * - name, img, uuid, type: "npc"
 * - system.details.level.value (等级)
 * - system.traits.rarity (稀有度)
 * - system.traits.value[] (特征，如 construct, undead, beast)
 * - system.traits.size.value (体型，如 tiny, sm, med, lg, huge, grg)
 */

declare const game: any;

export interface MonsterDrawConfig {
  totalDraws?: number;
  monstersPerDraw?: number;
  selectablePerDraw?: number;
  levelRange?: { min: number; max: number };
  rarityFilter?: string[];
  requiredTraits?: string[];
  excludedTraits?: string[];
  sizeFilter?: string[];
  allowDuplicates?: boolean;
  /** 限定哪些 compendium pack 作为来源（pack ID），为空则使用所有 bestiary packs */
  sourcePacks?: string[];
  title?: string;
}

export interface DrawPoolMonster {
  name: string;
  img: string;
  uuid: string;
  level: number;
  rarity: string;
  traits: string[];
  size: string;
  source: string;
}

export const CREATURE_SIZES: Record<string, string> = {
  tiny: '超小型',
  sm:   '小型',
  med:  '中型',
  lg:   '大型',
  huge: '巨型',
  grg:  '超巨型',
};

export class MonsterDrawService {

  private static getCompendiumBrowser(): any {
    return (game as any).pf2e?.compendiumBrowser;
  }

  /**
   * 初始化 bestiary tab（如果 CompendiumBrowser 有的话）
   */
  static async initBestiaryTab(): Promise<void> {
    const browser = this.getCompendiumBrowser();
    if (!browser) return;

    const tab = browser.tabs?.bestiary;
    if (tab && !tab.isInitialized) {
      await tab.init();
    }
  }

  /**
   * 获取所有可用的 bestiary compendium packs
   */
  static getAvailableBestiaryPacks(): { id: string; label: string }[] {
    const packs: { id: string; label: string }[] = [];
    if (!game.packs) return packs;

    for (const pack of game.packs) {
      if (pack.documentName === 'Actor') {
        packs.push({ id: pack.collection, label: pack.metadata?.label || pack.collection });
      }
    }
    return packs;
  }

  /**
   * 构建怪物池：优先从 CompendiumBrowser bestiary tab 获取，
   * 否则回退到直接遍历 compendium packs 的 index
   */
  static async buildMonsterPool(config: MonsterDrawConfig): Promise<DrawPoolMonster[]> {
    const browser = this.getCompendiumBrowser();
    const bestiaryTab = browser?.tabs?.bestiary;

    if (bestiaryTab?.isInitialized && bestiaryTab.indexData) {
      return this.buildPoolFromBestiaryTab(bestiaryTab, config);
    }

    return this.buildPoolFromPacks(config);
  }

  /**
   * 从 CompendiumBrowser bestiary tab 的 indexData 构建池
   */
  private static buildPoolFromBestiaryTab(tab: any, config: MonsterDrawConfig): DrawPoolMonster[] {
    const pool: DrawPoolMonster[] = [];
    const sourcePackSet = config.sourcePacks?.length ? new Set(config.sourcePacks) : null;

    for (const entry of tab.indexData) {
      if (sourcePackSet) {
        const packId = this.extractPackId(entry.uuid);
        if (packId && !sourcePackSet.has(packId)) continue;
      }

      const level = entry.level ?? entry.system?.details?.level?.value ?? 0;
      const rarity = entry.rarity ?? entry.system?.traits?.rarity ?? 'common';
      const traits: string[] = entry.traits ?? entry.system?.traits?.value ?? [];
      const size: string = entry.size ?? entry.system?.traits?.size?.value ?? 'med';
      const source = this.extractPackId(entry.uuid) || '';

      if (!this.matchesMonsterFilter(level, rarity, traits, size, config)) continue;

      pool.push({
        name: entry.name,
        img: entry.img || 'systems/pf2e/icons/default-icons/npc.svg',
        uuid: entry.uuid,
        level,
        rarity,
        traits,
        size,
        source,
      });
    }

    return pool;
  }

  /**
   * 从 compendium packs 直接构建池（回退方案）
   */
  private static async buildPoolFromPacks(config: MonsterDrawConfig): Promise<DrawPoolMonster[]> {
    const pool: DrawPoolMonster[] = [];
    if (!game.packs) return pool;

    const sourcePackSet = config.sourcePacks?.length ? new Set(config.sourcePacks) : null;

    for (const pack of game.packs) {
      if (pack.documentName !== 'Actor') continue;
      if (sourcePackSet && !sourcePackSet.has(pack.collection)) continue;

      const index = await pack.getIndex({ fields: [
        'system.details.level.value',
        'system.traits.rarity',
        'system.traits.value',
        'system.traits.size.value',
        'img',
        'type',
      ]});

      for (const entry of index) {
        if (entry.type !== 'npc') continue;

        const level = entry.system?.details?.level?.value ?? 0;
        const rarity = entry.system?.traits?.rarity ?? 'common';
        const traits: string[] = entry.system?.traits?.value ?? [];
        const size: string = entry.system?.traits?.size?.value ?? 'med';

        if (!this.matchesMonsterFilter(level, rarity, traits, size, config)) continue;

        pool.push({
          name: entry.name,
          img: entry.img || 'systems/pf2e/icons/default-icons/npc.svg',
          uuid: `Compendium.${pack.collection}.Actor.${entry._id}`,
          level,
          rarity,
          traits,
          size,
          source: pack.collection,
        });
      }
    }

    return pool;
  }

  private static matchesMonsterFilter(
    level: number,
    rarity: string,
    traits: string[],
    size: string,
    config: MonsterDrawConfig,
  ): boolean {
    const levelMin = config.levelRange?.min ?? -1;
    const levelMax = config.levelRange?.max ?? 25;
    if (level < levelMin || level > levelMax) return false;

    if (config.rarityFilter?.length) {
      if (!config.rarityFilter.includes(rarity)) return false;
    }

    if (config.requiredTraits?.length) {
      for (const t of config.requiredTraits) {
        if (!traits.includes(t)) return false;
      }
    }

    if (config.excludedTraits?.length) {
      for (const t of config.excludedTraits) {
        if (traits.includes(t)) return false;
      }
    }

    if (config.sizeFilter?.length) {
      if (!config.sizeFilter.includes(size)) return false;
    }

    return true;
  }

  /**
   * Fisher-Yates 随机抽取
   */
  static drawRandomMonsters(pool: DrawPoolMonster[], count: number, excludeUuids?: Set<string>): DrawPoolMonster[] {
    let available = excludeUuids
      ? pool.filter(m => !excludeUuids.has(m.uuid))
      : [...pool];

    const resultCount = Math.min(count, available.length);
    const result: DrawPoolMonster[] = [];

    for (let i = available.length - 1; i >= 0 && result.length < resultCount; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
      result.push(available[i]);
    }

    return result;
  }

  /**
   * 加载完整怪物数据
   */
  static async loadFullMonsterData(uuid: string): Promise<any> {
    try {
      const actor = await (globalThis as any).fromUuid(uuid);
      return actor ? actor.toObject() : null;
    } catch (error) {
      console.error('[MonsterDrawService] 加载怪物失败: ' + uuid, error);
      return null;
    }
  }

  /**
   * 将怪物导入为世界 Actor
   */
  static async importMonsterToWorld(monsterData: any): Promise<any> {
    try {
      delete monsterData._id;
      if (monsterData._stats) delete monsterData._stats;
      const created = await (globalThis as any).Actor.create(monsterData);
      return created;
    } catch (error) {
      console.error('[MonsterDrawService] 导入怪物失败:', error);
      throw error;
    }
  }

  /**
   * 获取可用的怪物特征列表
   */
  static async getAvailableTraits(): Promise<{ value: string; label: string }[]> {
    const browser = this.getCompendiumBrowser();
    if (!browser) return [];

    const tab = browser.tabs?.bestiary;
    if (!tab) return [];

    if (!tab.isInitialized) {
      await tab.init();
    }

    const filterData = await tab.getFilterData();
    return filterData?.traits?.options || [];
  }

  /**
   * 获取体型选项列表
   */
  static getSizeOptions(): { value: string; label: string }[] {
    return Object.entries(CREATURE_SIZES).map(([value, label]) => ({ value, label }));
  }

  private static extractPackId(uuid: string): string | null {
    const match = uuid.match(/^Compendium\.([^.]+\.[^.]+)\./);
    return match ? match[1] : null;
  }
}
