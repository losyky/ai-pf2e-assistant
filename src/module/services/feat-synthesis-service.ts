import { AIService } from './ai-service';
import { FragmentGeneratorService } from './fragment-generator-service';
import { FeatGeneratorService, PF2eFeatFormat } from './feat-generator-service';
import { Message } from '../types/api';

/**
 * 合成材料接口
 */
export interface SynthesisMaterial {
  id: string;
  name: string;
  type: 'fragment' | 'item' | 'other';
  hiddenPrompt?: string;
  description: string;
  rarity?: string;
}

/**
 * 合成配置接口
 */
export interface SynthesisConfig {
  level: number;
  category: 'general' | 'skill' | 'ancestry' | 'class' | 'bonus';
  className?: string;
  actorData?: any;
}

/**
 * 合成结果接口
 */
export interface SynthesisResult {
  feat: PF2eFeatFormat;
  usedMaterials: SynthesisMaterial[];
  balanceAnalysis: string;
}

/**
 * 专长合成服务
 * 使用词条碎片和其他材料合成新的专长
 */
export class FeatSynthesisService {
  private aiService: AIService;
  private featGeneratorService: FeatGeneratorService;

  constructor(aiService: AIService, balanceData: any) {
    this.aiService = aiService;
    this.featGeneratorService = new FeatGeneratorService(aiService, balanceData);
  }

  /**
   * 分析物品并提取合成材料信息
   * @param items 物品数组
   * @returns 合成材料数组
   */
  extractSynthesisMaterials(items: any[]): SynthesisMaterial[] {
    const materials: SynthesisMaterial[] = [];

    for (const item of items) {
      // 检查是否为词条碎片
      if (FragmentGeneratorService.isFragment(item)) {
        const hiddenPrompt = FragmentGeneratorService.extractHiddenPrompt(item);
        materials.push({
          id: item.id || item._id,
          name: item.name,
          type: 'fragment',
          hiddenPrompt: hiddenPrompt || '',
          description: this.extractItemDescription(item),
          rarity: item.system?.traits?.rarity || 'common'
        });
      } else {
        // 其他物品也可能包含有用的设计灵感
        materials.push({
          id: item.id || item._id,
          name: item.name,
          type: 'item',
          description: this.extractItemDescription(item),
          rarity: item.system?.traits?.rarity || 'common'
        });
      }
    }

    return materials;
  }

  /**
   * 合成专长
   * @param materials 合成材料
   * @param config 合成配置
   * @returns 合成结果
   */
  async synthesizeFeat(materials: SynthesisMaterial[], config: SynthesisConfig): Promise<SynthesisResult> {
    console.log('开始专长合成，材料数量:', materials.length, '配置:', config);

    if (materials.length === 0) {
      throw new Error('至少需要一个合成材料');
    }

    // 构建合成提示词
    const synthesisPrompt = await this.buildSynthesisPrompt(materials, config);
    
    // 使用专长生成服务生成专长
    const feat = await this.featGeneratorService.generateFeat(
      synthesisPrompt,
      config.level,
      config.category,
      config.className
    );

    // 分析平衡性
    const balanceAnalysis = await this.analyzeBalance(feat, materials, config);

    const result: SynthesisResult = {
      feat,
      usedMaterials: materials,
      balanceAnalysis
    };

    console.log('专长合成完成:', feat.name);
    return result;
  }

  /**
   * 构建合成提示词
   * @param materials 合成材料
   * @param config 合成配置
   * @returns 合成提示词
   */
  private async buildSynthesisPrompt(materials: SynthesisMaterial[], config: SynthesisConfig): Promise<string> {
    // 分离词条碎片和其他材料
    const fragments = materials.filter(m => m.type === 'fragment' && m.hiddenPrompt);
    const otherMaterials = materials.filter(m => m.type !== 'fragment' || !m.hiddenPrompt);

    let prompt = '';

    // 如果有词条碎片，优先使用其隐藏提示词
    if (fragments.length > 0) {
      prompt += '基于以下词条碎片的设计概念，创造一个融合了所有元素的专长：\n\n';
      
      fragments.forEach((fragment, index) => {
        prompt += `碎片${index + 1} - ${fragment.name}:\n`;
        prompt += `${fragment.hiddenPrompt}\n\n`;
      });

      if (fragments.length > 1) {
        prompt += '请将这些不同的设计概念巧妙地融合在一起，创造出一个协调统一且平衡的专长。\n\n';
      }
    }

    // 添加其他材料的影响
    if (otherMaterials.length > 0) {
      prompt += '同时考虑以下额外材料的影响和灵感：\n\n';
      
      otherMaterials.forEach((material, index) => {
        prompt += `材料${index + 1} - ${material.name}:\n`;
        prompt += `${material.description}\n\n`;
      });
    }

    // 添加角色相关信息
    if (config.actorData) {
      prompt += '角色背景信息：\n';
      if (config.actorData.level) {
        prompt += `当前等级: ${config.actorData.level}\n`;
      }
      if (config.actorData.class) {
        prompt += `职业: ${config.actorData.class}\n`;
      }
      if (config.actorData.ancestry) {
        prompt += `族裔: ${config.actorData.ancestry}\n`;
      }
      prompt += '\n';
    }

    // 添加合成要求
    prompt += `合成要求：\n`;
    prompt += `- 专长等级: ${config.level}\n`;
    prompt += `- 专长类别: ${this.getCategoryDisplayName(config.category)}\n`;
    if (config.className) {
      prompt += `- 关联职业: ${config.className}\n`;
    }
    prompt += '\n请确保生成的专长：\n';
    prompt += '1. 在指定等级下保持平衡\n';
    prompt += '2. 体现所有合成材料的特色\n';
    prompt += '3. 具有独特性和创新性\n';
    prompt += '4. 符合PF2e规则体系\n';

    return prompt;
  }


  /**
   * 分析专长平衡性
   * @param feat 生成的专长
   * @param materials 使用的材料
   * @param config 合成配置
   * @returns 平衡性分析
   */
  private async analyzeBalance(feat: any, materials: SynthesisMaterial[], config: SynthesisConfig): Promise<string> {
    const messages: Message[] = [
      {
        role: 'system',
        content: `你是一个PF2e系统的平衡性专家，负责分析专长的强度和平衡性。
请分析给定专长在其等级下的平衡性，并给出简洁的评估。

分析要点：
1. 与同等级标准专长的强度比较
2. 专长效果的实用性和频率
3. 是否存在明显的强化或弱化问题
4. 针对特定情况的适用性

请给出简洁的分析结论（1-2段文字）。`
      },
      {
        role: 'user',
        content: `专长信息：
名称: ${feat.name}
等级: ${config.level}
类别: ${config.category}
描述: ${feat.system?.description?.value || ''}

使用的合成材料：
${materials.map(m => `- ${m.name} (${m.rarity})`).join('\n')}

请分析这个专长的平衡性。`
      }
    ];

    try {
      // 读取神龛系统的叙事生成模型配置（平衡分析也使用叙事模型）
      const game = (globalThis as any).game;
      const narrativeModel = game?.settings?.get('ai-pf2e-assistant', 'shrineNarrativeModel') || 'gpt-4o-mini';
      const response = await this.aiService.callService(messages, narrativeModel);
      return response;
    } catch (error) {
      console.error('平衡性分析失败:', error);
      return `这个专长在${config.level}级别下具有合理的强度，使用的${materials.length}个材料为其提供了丰富的设计基础。`;
    }
  }

  /**
   * 提取物品描述
   * @param item 物品对象
   * @returns 描述文本
   */
  private extractItemDescription(item: any): string {
    const description = item.system?.description?.value || '';
    
    // 移除HTML标签，只保留文本内容
    const textContent = description.replace(/<[^>]*>/g, '').trim();
    
    // 移除隐藏部分（secret section）
    const cleanDescription = textContent.replace(/AI提示词内容[\s\S]*$/, '').trim();
    
    return cleanDescription || item.name || '神秘的物品';
  }

  /**
   * 获取类别显示名称
   * @param category 类别代码
   * @returns 显示名称
   */
  private getCategoryDisplayName(category: string): string {
    const categoryMap: Record<string, string> = {
      'general': '通用',
      'skill': '技能',
      'ancestry': '族裔',
      'class': '职业',
      'bonus': '额外'
    };
    return categoryMap[category] || category;
  }

  /**
   * 验证合成材料的兼容性
   * @param materials 合成材料
   * @returns 兼容性报告
   */
  validateMaterialCompatibility(materials: SynthesisMaterial[]): {
    isCompatible: boolean;
    warnings: string[];
    suggestions: string[];
  } {
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // 检查材料数量
    if (materials.length === 0) {
      warnings.push('没有选择任何合成材料');
    } else if (materials.length === 1) {
      suggestions.push('使用多个材料可以创造更复杂的专长效果');
    } else if (materials.length > 5) {
      warnings.push('使用过多材料可能导致专长效果过于复杂');
      suggestions.push('建议将材料数量控制在3-5个以获得最佳效果');
    }

    // 检查稀有度分布
    const rarities = materials.map(m => m.rarity || 'common');
    const rareCount = rarities.filter(r => r === 'rare' || r === 'unique').length;
    if (rareCount > 2) {
      warnings.push('使用过多稀有材料可能创造出过强的专长');
    }

    // 检查碎片比例
    const fragmentCount = materials.filter(m => m.type === 'fragment').length;
    if (fragmentCount === 0) {
      warnings.push('没有使用词条碎片，专长效果可能不够明确');
      suggestions.push('至少使用一个词条碎片作为主要设计基础');
    }

    const isCompatible = warnings.length === 0;

    return {
      isCompatible,
      warnings,
      suggestions
    };
  }
}
