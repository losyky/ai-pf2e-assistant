import { MODULE_ID } from '../constants';

/**
 * Effect物品服务
 * 用于管理自动化效果物品的创建、存储和管理
 * 这些effect物品通常对应专长或道具的非常态效果，需要单独施加的buff
 */
export class EffectItemService {
  private static instance: EffectItemService;

  private constructor() {}

  public static getInstance(): EffectItemService {
    if (!EffectItemService.instance) {
      EffectItemService.instance = new EffectItemService();
    }
    return EffectItemService.instance;
  }

  /**
   * 为指定物品创建effect物品
   * @param sourceItemName 源物品名称（专长或道具名）
   * @param effectData effect数据
   * @returns 创建的effect物品及其uuid
   */
  public async createEffectForItem(
    sourceItemName: string,
    effectData: EffectItemData
  ): Promise<{ item: any; uuid: string; folder: string }> {
    try {
      console.log(`${MODULE_ID} | 为物品 "${sourceItemName}" 创建effect...`);

      // 1. 获取或创建对应的effect文件夹
      const folder = await this.getOrCreateEffectFolder(sourceItemName);

      // 2. 构建完整的effect物品数据
      const itemData = this.buildEffectItemData(effectData, sourceItemName, folder?.id);

      // 3. 创建effect物品
      const createdItem = await Item.create(itemData);

      if (!createdItem) {
        throw new Error('创建effect物品失败');
      }

      // 4. 获取uuid
      const uuid = createdItem.uuid;

      console.log(`${MODULE_ID} | Effect创建成功:`, {
        name: effectData.name,
        uuid: uuid,
        folder: folder?.name
      });

      return {
        item: createdItem,
        uuid: uuid,
        folder: folder?.name || ''
      };
    } catch (error) {
      console.error(`${MODULE_ID} | 创建effect失败:`, error);
      throw error;
    }
  }

  /**
   * 批量创建多个effect
   * @param sourceItemName 源物品名称
   * @param effectsData effect数据数组
   * @returns 创建的effect物品数组及其uuid
   */
  public async createMultipleEffects(
    sourceItemName: string,
    effectsData: EffectItemData[]
  ): Promise<Array<{ item: any; uuid: string; effectName: string }>> {
    const results: Array<{ item: any; uuid: string; effectName: string }> = [];

    for (const effectData of effectsData) {
      try {
        const result = await this.createEffectForItem(sourceItemName, effectData);
        results.push({
          ...result,
          effectName: effectData.name
        });
      } catch (error) {
        console.error(`${MODULE_ID} | 创建effect "${effectData.name}" 失败:`, error);
        // 继续处理其他effect
      }
    }

    return results;
  }

  /**
   * 获取或创建effect文件夹
   * @param sourceItemName 源物品名称
   * @returns 文件夹对象
   */
  private async getOrCreateEffectFolder(sourceItemName: string): Promise<Folder | null> {
    const folderName = `${sourceItemName} - Effects`;

    try {
      // 查找现有文件夹
      const existingFolder = game.folders?.find(
        (f: Folder) => f.name === folderName && f.type === 'Item'
      );

      if (existingFolder) {
        console.log(`${MODULE_ID} | 找到现有effect文件夹: ${folderName}`);
        return existingFolder;
      }

      // 创建新文件夹
      const newFolder = await Folder.create({
        name: folderName,
        type: 'Item',
        color: '#9b59b6', // 紫色 - effect专用
        sorting: 'a'
      });

      console.log(`${MODULE_ID} | 创建新effect文件夹: ${folderName}`);
      return newFolder as Folder;
    } catch (error) {
      console.error(`${MODULE_ID} | 创建/获取effect文件夹失败:`, error);
      return null;
    }
  }

  /**
   * 构建effect物品数据
   * @param effectData 基础effect数据
   * @param sourceItemName 源物品名称
   * @param folderId 文件夹ID
   * @returns 完整的物品数据
   */
  private buildEffectItemData(
    effectData: EffectItemData,
    sourceItemName: string,
    folderId?: string
  ): any {
    // 确保名称以 "Effect: " 开头
    let effectName = effectData.name;
    if (!effectName.startsWith('Effect: ')) {
      effectName = `Effect: ${effectName}`;
    }
    
    // 验证并修复duration
    const duration = effectData.duration || {
      expiry: 'turn-start',
      sustained: false,
      unit: 'unlimited',
      value: -1
    };
    
    // 确保expiry是有效值
    if (duration.expiry && !['turn-start', 'turn-end', null].includes(duration.expiry)) {
      console.warn(`${MODULE_ID} | 无效的expiry值: ${duration.expiry}，改为turn-start`);
      duration.expiry = 'turn-start';
    }
    
    // 确保traits是空数组（Effect不使用traits）
    const traits = Array.isArray(effectData.traits) ? effectData.traits.filter(t => {
      // 移除无效的trait（如'buff'）
      const validTraits = ['magical', 'emotion', 'fear', 'mental', 'visual', 'auditory']; // 常见有效traits
      if (!validTraits.includes(t)) {
        console.warn(`${MODULE_ID} | 移除无效的trait: ${t}`);
        return false;
      }
      return true;
    }) : [];
    
    const itemData: any = {
      name: effectName,
      type: 'effect',
      img: effectData.img || 'icons/svg/aura.svg',
      system: {
        description: {
          value: effectData.description || `<p>由 ${sourceItemName} 授予</p>`
        },
        duration: duration,
        level: {
          value: effectData.level || 1
        },
        rules: effectData.rules || [],
        start: {
          initiative: null,
          value: 0
        },
        tokenIcon: {
          show: effectData.showTokenIcon !== false
        },
        traits: {
          rarity: effectData.rarity || 'common',
          value: traits
        }
      }
    };

    // 添加文件夹关联
    if (folderId) {
      itemData.folder = folderId;
    }

    // 添加publication信息（如果提供）
    if (effectData.publication) {
      itemData.system.publication = effectData.publication;
    }

    return itemData;
  }

  /**
   * 获取指定物品的所有effect
   * @param sourceItemName 源物品名称
   * @returns effect物品数组
   */
  public async getEffectsForItem(sourceItemName: string): Promise<any[]> {
    const folderName = `${sourceItemName} - Effects`;

    try {
      const folder = game.folders?.find(
        (f: Folder) => f.name === folderName && f.type === 'Item'
      );

      if (!folder) {
        return [];
      }

      const effects = game.items?.filter(
        (item: any) => item.folder?.id === folder.id && item.type === 'effect'
      ) || [];

      return Array.from(effects);
    } catch (error) {
      console.error(`${MODULE_ID} | 获取effect列表失败:`, error);
      return [];
    }
  }

  /**
   * 删除单个effect物品
   * @param effectId effect物品的ID
   */
  public async deleteEffectItem(effectId: string): Promise<void> {
    try {
      const effect = game.items?.get(effectId);
      if (effect) {
        await effect.delete();
        console.log(`${MODULE_ID} | 已删除effect物品: ${effect.name}`);
      }
    } catch (error) {
      console.error(`${MODULE_ID} | 删除effect物品失败:`, error);
      throw error;
    }
  }

  /**
   * 删除指定物品的所有effect
   * @param sourceItemName 源物品名称
   */
  public async deleteEffectsForItem(sourceItemName: string): Promise<void> {
    const folderName = `${sourceItemName} - Effects`;

    try {
      const effects = await this.getEffectsForItem(sourceItemName);

      if (effects.length > 0) {
        const effectIds = effects.map((e: any) => e.id);
        await Item.deleteDocuments(effectIds);
        console.log(`${MODULE_ID} | 删除了 ${effects.length} 个effect物品`);
      }

      // 删除文件夹
      const folder = game.folders?.find(
        (f: Folder) => f.name === folderName && f.type === 'Item'
      );

      if (folder) {
        await folder.delete();
        console.log(`${MODULE_ID} | 删除effect文件夹: ${folderName}`);
      }
    } catch (error) {
      console.error(`${MODULE_ID} | 删除effect失败:`, error);
      throw error;
    }
  }

  /**
   * 检测物品描述中是否需要effect
   * @param description 物品描述
   * @returns 是否需要effect
   */
  public needsEffect(description: string): boolean {
    // 检测关键词
    const effectKeywords = [
      '施加',
      '给予',
      'buff',
      '增益',
      '效果',
      '状态',
      '光环',
      'aura',
      '选择',
      '开关',
      '激活',
      '持续',
      '你可以',
      '作为',
      '当你',
      '目标',
      '盟友',
      '敌人',
      '范围内'
    ];
    const frequencyKeywords = [
      '每回合',
      '每轮',
      '每次',
      '每分钟',
      '每10分钟',
      '每小时',
      '每天',
      '每周',
      '每月',
      '每场遭遇',
      '次数',
      '频率',
      '冷却'
    ];
    const conditionKeywords = [
      '当你',
      '当目标',
      '当敌人',
      '当盟友',
      '如果',
      '直到',
      '只要',
      '在你',
      '成功',
      '失败',
      '大成功',
      '大失败',
      'when you',
      'if you',
      'on a success',
      'on a failure',
      'while you'
    ];

    const lowerDesc = description.toLowerCase();

    return effectKeywords.some(keyword => lowerDesc.includes(keyword))
      || frequencyKeywords.some(keyword => lowerDesc.includes(keyword))
      || conditionKeywords.some(keyword => lowerDesc.includes(keyword));
  }

  /**
   * 从描述中分析可能需要的effect类型
   * @param itemData 物品数据
   * @returns effect类型分析结果
   */
  public analyzeEffectNeeds(itemData: any): EffectNeedsAnalysis {
    const description = itemData.system?.description?.value || '';
    const name = itemData.name || '';
    const lowerDesc = description.toLowerCase();

    const frequencyKeywords = [
      '每回合',
      '每轮',
      '每次',
      '每分钟',
      '每10分钟',
      '每小时',
      '每天',
      '每周',
      '每月',
      '每场遭遇',
      '次数',
      '频率',
      '冷却'
    ];
    const conditionKeywords = [
      '当你',
      '当目标',
      '当敌人',
      '当盟友',
      '如果',
      '直到',
      '只要',
      '在你',
      '成功',
      '失败',
      '大成功',
      '大失败',
      'when you',
      'if you',
      'on a success',
      'on a failure',
      'while you'
    ];

    const analysis: EffectNeedsAnalysis = {
      needsEffect: false,
      suggestedEffects: [],
      reasoning: ''
    };

    // 检测是否需要effect
    if (!this.needsEffect(description)) {
      analysis.reasoning = '物品效果为直接作用，不需要单独的effect物品';
      return analysis;
    }

    analysis.needsEffect = true;

    // 检测effect类型
    // 1. 开关型效果
    if (lowerDesc.includes('激活') || lowerDesc.includes('开关') || lowerDesc.includes('你可以')) {
      analysis.suggestedEffects.push({
        type: 'toggle',
        name: `Effect: ${name}`,
        description: '可切换的效果状态'
      });
    }

    // 2. 光环型效果
    if (lowerDesc.includes('光环') || lowerDesc.includes('aura') || lowerDesc.includes('范围内')) {
      analysis.suggestedEffects.push({
        type: 'aura',
        name: `Effect: ${name} Aura`,
        description: '影响周围单位的光环效果'
      });
    }

    // 3. 姿态效果
    if (lowerDesc.includes('姿态') || lowerDesc.includes('stance')) {
      analysis.suggestedEffects.push({
        type: 'stance',
        name: `Effect: ${name} Stance`,
        description: '姿态效果'
      });
    }

    // 4. 目标效果（施加给其他单位）
    if (lowerDesc.includes('目标') || lowerDesc.includes('敌人') || lowerDesc.includes('盟友')) {
      analysis.suggestedEffects.push({
        type: 'target',
        name: `Effect: ${name}`,
        description: '施加给目标的效果'
      });
    }

    // 5. 持续效果
    if (lowerDesc.includes('持续') || lowerDesc.includes('duration')) {
      analysis.suggestedEffects.push({
        type: 'duration',
        name: `Effect: ${name}`,
        description: '有持续时间的效果'
      });
    }

    const hasFrequency = frequencyKeywords.some(keyword => lowerDesc.includes(keyword));
    const hasCondition = conditionKeywords.some(keyword => lowerDesc.includes(keyword));
    if ((hasFrequency || hasCondition) && !analysis.suggestedEffects.some(effect => effect.type === 'duration')) {
      analysis.suggestedEffects.push({
        type: 'duration',
        name: `Effect: ${name}`,
        description: '条件触发或频率限制的临时效果'
      });
    }

    // 如果没有匹配到特定类型，添加通用效果
    if (analysis.suggestedEffects.length === 0) {
      analysis.suggestedEffects.push({
        type: 'general',
        name: `Effect: ${name}`,
        description: '通用效果'
      });
    }

    analysis.reasoning = `检测到需要 ${analysis.suggestedEffects.length} 个effect物品来实现完整功能`;

    return analysis;
  }
}

/**
 * Effect物品数据接口
 */
export interface EffectItemData {
  name: string;
  description?: string;
  img?: string;
  level?: number;
  duration?: {
    expiry: string;
    sustained: boolean;
    unit: string;
    value: number;
  };
  rules?: any[];
  traits?: string[];
  rarity?: string;
  showTokenIcon?: boolean;
  publication?: {
    license: string;
    remaster: boolean;
    title: string;
  };
}

/**
 * Effect需求分析结果
 */
export interface EffectNeedsAnalysis {
  needsEffect: boolean;
  suggestedEffects: Array<{
    type: 'toggle' | 'aura' | 'stance' | 'target' | 'duration' | 'general';
    name: string;
    description: string;
  }>;
  reasoning: string;
}

