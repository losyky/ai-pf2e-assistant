import { AIService } from './ai-service';
import { ShrineItemService } from './shrine-item-service';
import { FragmentGeneratorService } from './fragment-generator-service';
import { ShrinePointService } from './shrine-point-service';
import { getFeatKnowledgeService } from './feat-knowledge-service';
import { PF2eFeatFormat } from './feat-generator-service';
import { PF2eMechanicsKnowledgeService } from './pf2e-mechanics-knowledge';
import { Logger } from '../utils/logger';
import {
  PREREQUISITES_PRINCIPLE,
  FEAT_DESIGN_GUIDANCE,
  DESCRIPTION_PRINCIPLE,
  PF2E_FORMAT_STANDARD,
  TECHNICAL_REQUIREMENTS,
  MECHANISM_DESCRIPTION_GUIDE
} from './prompt-templates';

/**
 * Message interface for AI service
 */
interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 神龛合成材料接口
 */
export interface ShrineSynthesisMaterial {
  id: string;
  name: string;
  type: 'fragment' | 'divinity' | 'offering' | 'shrine';
  hiddenPrompt?: string;
  description: string;
  rarity?: string;
  deity?: string;
  aspect?: string;
  effectiveLevel?: string; // 神性的等效等级，支持绝对值（如"5"）或相对值（如"+2"、"+3"）
  originalFeatData?: any;
  synthesisRequirements?: any;
  img?: string; // 保留原始物品图标
  originalItem?: any; // 保留原始物品引用，用于后续操作
  // 贡品物品的子类型信息（用于推断合成结果的类型）
  offeringCategory?: string; // 对于专长贡品，保存其category（如'class', 'skill'等）
  offeringFeatType?: string; // 对于职业专长贡品，保存其featType
  offeringItemType?: string; // 对于装备贡品，保存其实际物品类型（如'weapon', 'armor'等）
}

/**
 * 神龛合成配置接口
 */
export interface ShrineSynthesisConfig {
  level: number;
  category: 'general' | 'skill' | 'ancestry' | 'class' | 'bonus';
  className?: string;
  actorData?: any;
  shrineItem: ShrineSynthesisMaterial; // 必需的神龛物品
  mechanismComplexity?: 'none' | 'simple' | 'moderate' | 'complex';
  requiredTraits?: string[]; // 合成后必定携带的特征 // 机制复杂度，默认为moderate
}

/**
 * 神龛合成结果接口
 */
export interface ShrineSynthesisResult {
  feat: PF2eFeatFormat;
  usedMaterials: ShrineSynthesisMaterial[];
  iconPrompt?: string; // 图标生成提示词
}

/**
 * 专长生成的Function Calling Schema
 * 确保AI返回完整的专长数据结构
 * 
 * 兼容性说明：
 * - 此Schema使用OpenAI格式定义（parameters字段）
 * - 当使用Claude时，会自动转换为Claude格式（input_schema字段）
 * - 在callAIAPI中根据模型类型自动处理转换
 */
const FEAT_GENERATION_SCHEMA = {
  name: "generateFeat",
  description: "生成一个完整的PF2e专长，包含所有必需字段",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "专长名称"
      },
      type: {
        type: "string",
        enum: ["feat"],
        description: "物品类型，必须是feat"
      },
      img: {
        type: "string",
        description: "专长图标路径，可以留空使用默认图标 icons/sundries/books/book-red-exclamation.webp"
      },
      system: {
        type: "object",
        properties: {
          description: {
            type: "object",
            properties: {
              value: {
                type: "string",
                description: "专长的完整HTML格式描述，必须包含所有效果、触发条件、持续时间等信息。这是最重要的字段，不能为空！",
                minLength: 50
              },
              gm: {
                type: "string",
                description: "GM可见的描述（可选）"
              }
            },
            required: ["value"]
          },
          rules: {
            type: "array",
            description: "规则元素数组（可选，如果不确定格式可以留空）",
            items: {
              type: "object"
            }
          },
          traits: {
            type: "object",
            properties: {
              value: {
                type: "array",
                items: { type: "string" },
                description: "特征数组"
              },
              rarity: {
                type: "string",
                enum: ["common", "uncommon", "rare", "unique"],
                description: "稀有度"
              }
            }
          },
          level: {
            type: "object",
            properties: {
              value: { type: "number", description: "专长等级" }
            },
            required: ["value"]
          },
          actionType: {
            type: "object",
            properties: {
              value: {
                type: "string",
                enum: ["passive", "free", "reaction", "action"],
                description: "动作类型"
              }
            }
          },
          actions: {
            type: "object",
            properties: {
              value: {
                type: ["number", "null"],
                description: "动作数量（1-3或null），当actionType为action时必须设置1-3，其他类型为null"
              }
            }
          },
          frequency: {
            type: "object",
            properties: {
              max: {
                type: "number",
                description: "最大使用次数"
              },
              per: {
                type: "string",
                enum: ["turn", "round", "PT1M", "PT10M", "PT1H", "day", "P1W", "P1M"],
                description: "频次周期。优先使用PT10M（每10分钟），其他选项：turn（每回合）、round（每轮）、PT1M（每分钟）、PT1H（每小时）、day（每天）、P1W（每周）、P1M（每月）"
              }
            },
            required: ["max", "per"],
            description: "使用频次限制（可选），如每天1次、每10分钟1次等"
          },
          prerequisites: {
            type: "object",
            properties: {
              value: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    value: { type: "string", description: "先决条件文字描述，如'专家级运动'、'力量 14'" }
                  },
                  required: ["value"]
                },
                description: "先决条件数组，每项格式为 {value: '先决条件文字'}。无先决条件时使用空数组[]"
              }
            }
          }
        },
        required: ["description", "level", "category"]
      }
    },
    required: ["name", "type", "system"]
  }
};

/**
 * 合成验证结果接口
 */
export interface SynthesisValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  materialBreakdown: {
    fragments: ShrineSynthesisMaterial[];
    divinities: ShrineSynthesisMaterial[];
    offerings: ShrineSynthesisMaterial[];
    shrines: ShrineSynthesisMaterial[];
  };
}

/**
 * 神龛合成服务
 * 基于黑帝斯游戏概念，使用神明力量合成专长
 */
export class ShrineSynthesisService {
  private aiService: AIService;
  private featKnowledgeService = getFeatKnowledgeService();

  constructor(aiService: AIService) {
    this.aiService = aiService;
    // 异步加载知识库（不阻塞构造函数）
    this.featKnowledgeService.loadKnowledgeBase().catch(err => {
      console.warn('加载专长知识库失败，将使用基础功能:', err);
    });
  }

  /**
   * 分析物品并提取神龛合成材料信息
   * @param items 物品数组
   * @returns 神龛合成材料数组
   */
  extractShrineMaterials(items: any[], knownTypes?: string[]): ShrineSynthesisMaterial[] {
    const materials: ShrineSynthesisMaterial[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // 使用已知类型或重新识别
      const itemType = knownTypes?.[i] || ShrineItemService.getItemType(item);
      
      // 添加调试信息
      Logger.debug(`处理材料 "${item.name}":`, {
        itemType,
        flagsItemType: item.flags?.['ai-pf2e-assistant']?.itemType,
        traits: item.system?.traits?.value,
        fragmentType: item.flags?.['ai-pf2e-assistant']?.fragmentType,
        hasHiddenPrompt: !!item.flags?.['ai-pf2e-assistant']?.hiddenPrompt,
        description: (item.system?.description?.value || '').substring(0, 100),
        itemTypeLowercase: item.name?.toLowerCase(),
        includesAreco: item.name?.toLowerCase()?.includes('阿雷科斯特斯')
      });
      
      switch (itemType) {
        case 'fragment':
          materials.push(this.extractFragmentMaterial(item));
          break;
        case 'divinity':
          materials.push(this.extractDivinityMaterial(item));
          break;
        case 'offering':
          materials.push(this.extractOfferingMaterial(item));
          break;
        case 'shrine':
          materials.push(this.extractShrineMaterial(item));
          break;
        default:
          // 其他物品也可能包含有用的设计灵感
          materials.push(this.extractOtherMaterial(item));
          break;
      }
    }

    return materials;
  }

  /**
   * 神龛合成专长
   * @param materials 合成材料（包含一个神龛）
   * @param config 合成配置
   * @returns 合成结果
   */
  async synthesizeFeat(materials: ShrineSynthesisMaterial[], config: ShrineSynthesisConfig): Promise<ShrineSynthesisResult> {
    console.log('开始神龛合成，材料数量:', materials.length, '配置:', config);

    // 确保知识库已加载
    try {
      await this.featKnowledgeService.loadKnowledgeBase();
    } catch (error) {
      console.warn('知识库加载失败，将继续使用基础功能:', error);
    }

    // 检查神龛点数权限
    const pointCheck = ShrinePointService.canUseSynthesis(config.actorData);
    if (!pointCheck.canUse) {
      throw new Error(`神龛合成受限: ${pointCheck.reason}`);
    }

    // 验证合成材料
    const validation = this.validateSynthesisMaterials(materials, config.shrineItem);
    if (!validation.isValid) {
      throw new Error(`神龛合成验证失败: ${validation.errors.join(', ')}`);
    }

    // 构建神龛合成提示词
    const synthesisPrompt = await this.buildShrineSynthesisPrompt(materials, config);
    
    // 直接生成专长，不使用等级平衡建议
    const shouldGenerateIcon = this.shouldGenerateIcon();
    const feat = await this.generateFeatDirect(
      synthesisPrompt,
      config.level,
      config.category,
      config.className,
      shouldGenerateIcon,
      materials,  // 传递材料以提取模板专长
      config.requiredTraits  // 传递必定携带的特征
    );

    // 合成成功，消耗神龛点数（GM用户不消耗）
    if (!ShrinePointService.isGM()) {
      const consumed = await ShrinePointService.consumeActorPoints(config.actorData);
      if (!consumed) {
        console.warn('神龛点数消耗失败，但合成已完成');
      }
    }

    const result: ShrineSynthesisResult = {
      feat,
      usedMaterials: materials,
      iconPrompt: (feat as any).iconPrompt
    };

    Logger.logSynthesis('神龛合成完成:', feat.name);
    return result;
  }

  /**
   * 验证神龛合成材料
   * @param materials 所有材料
   * @param shrineItem 神龛物品
   * @returns 验证结果
   */
  validateSynthesisMaterials(materials: ShrineSynthesisMaterial[], shrineItem: ShrineSynthesisMaterial): SynthesisValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // 分类材料
    const materialBreakdown = {
      fragments: materials.filter(m => m.type === 'fragment'),
      divinities: materials.filter(m => m.type === 'divinity'),
      offerings: materials.filter(m => m.type === 'offering'),
      shrines: materials.filter(m => m.type === 'shrine')
    };

    // 检查是否有神龛
    if (materialBreakdown.shrines.length === 0) {
      errors.push('神龛合成需要至少一个神龛物品');
    } else if (materialBreakdown.shrines.length > 1) {
      warnings.push('使用多个神龛可能导致神力冲突');
    }

    // 获取神龛的合成需求
    const requirements = shrineItem.synthesisRequirements;
    if (requirements) {
      // 验证碎片数量
      const fragmentCount = materialBreakdown.fragments.length;
      if (fragmentCount < requirements.fragments.min) {
        errors.push(`神龛需要至少${requirements.fragments.min}个碎片，当前只有${fragmentCount}个`);
      }
      if (requirements.fragments.max && fragmentCount > requirements.fragments.max) {
        warnings.push(`使用了${fragmentCount}个碎片，超过神龛建议的最大数量${requirements.fragments.max}`);
      }

      // 验证神性数量
      const divinityCount = materialBreakdown.divinities.length;
      if (divinityCount < requirements.divinities.min) {
        errors.push(`神龛需要至少${requirements.divinities.min}个神性，当前只有${divinityCount}个`);
      }
      if (requirements.divinities.max && divinityCount > requirements.divinities.max) {
        warnings.push(`使用了${divinityCount}个神性，超过神龛建议的最大数量${requirements.divinities.max}`);
      }

      // 验证贡品数量
      const offeringCount = materialBreakdown.offerings.length;
      if (offeringCount < requirements.offerings.min) {
        errors.push(`神龛需要至少${requirements.offerings.min}个贡品，当前只有${offeringCount}个`);
      }
      if (requirements.offerings.max && offeringCount > requirements.offerings.max) {
        warnings.push(`使用了${offeringCount}个贡品，超过神龛建议的最大数量${requirements.offerings.max}`);
      }
    }

    // 检查神明一致性
    const shrineDeity = shrineItem.deity;
    if (shrineDeity) {
      const conflictingDivinities = materialBreakdown.divinities.filter(d => d.deity && d.deity !== shrineDeity);
      if (conflictingDivinities.length > 0) {
        warnings.push(`检测到不同神明的神性，可能导致神力冲突`);
        suggestions.push(`建议使用与神龛${shrineDeity}相同神明的神性`);
      }
    }

    // 稀有度平衡检查
    const rareCount = materials.filter(m => m.rarity === 'rare' || m.rarity === 'unique').length;
    if (rareCount > 3) {
      warnings.push('使用过多稀有材料可能创造出过强的专长');
    }

    // 提供建议
    if (materialBreakdown.fragments.length === 0) {
      suggestions.push('添加一些词条碎片以提供更具体的设计方向');
    }
    if (materialBreakdown.offerings.length === 0) {
      suggestions.push('添加贡品物品以提供专长结构模板');
    }

    const isValid = errors.length === 0;

    return {
      isValid,
      errors,
      warnings,
      suggestions,
      materialBreakdown
    };
  }

  /**
   * 获取机制描述框架指南（仅在无神性时使用）
   * @param complexity 机制复杂度
   * @returns 机制描述指南文本
   */
  private getMechanismDescriptionGuide(complexity: 'none' | 'simple' | 'moderate' | 'complex'): string {
    if (complexity === 'none') {
      return ''; // 'none'模式不提供机制描述指南
    }
    return '\n' + MECHANISM_DESCRIPTION_GUIDE.getGuide(complexity);
  }

  /**
   * 解析神龛的特色内容
   * @param hiddenPrompt 神龛的隐藏提示词
   * @returns 解析出的特色、指导和原则
   */
  /**
   * 从HTML或纯文本中提取纯文本内容
   */
  private extractTextFromHtml(content: string): string {
    if (!content) return '';
    
    // 保留重要的格式标签，只移除布局相关的HTML标签
    let cleanText = content
      .replace(/<div[^>]*>/g, '\n') // div转换为换行
      .replace(/<\/div>/g, '') 
      .replace(/<p[^>]*>/g, '')     // 移除p标签但保留内容
      .replace(/<\/p>/g, '\n')     // p结束标签转换为换行
      .replace(/<br\s*\/?>/g, '\n') // br转换为换行
      .replace(/<hr\s*\/?>/g, '\n---\n') // hr转换为分隔线
      .replace(/&nbsp;/g, ' ') // 替换HTML空格
      .replace(/&lt;/g, '<') // 替换HTML实体
      .replace(/&gt;/g, '>') 
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    
    return cleanText;
  }

  /**
   * 从<ol>中的<li>列表中随机选择一个选项
   * 支持嵌套的HTML标签，提取纯文本内容
   * @param htmlContent 包含<ol>和<li>的HTML内容
   * @returns 处理后的文本，每个<ol>被替换为随机选中的一个<li>内容
   */
  private parseRandomOptions(htmlContent: string): string {
    if (!htmlContent) return '';
    
    Logger.logSynthesis('===== 开始解析随机选项 =====');
    Logger.debug('原始内容:', htmlContent);
    
    let result = htmlContent;
    let olCount = 0;
    
    // 使用正则表达式匹配所有<ol>...</ol>块（支持换行和嵌套标签）
    // 使用非贪婪模式和dotAll标志
    const olRegex = /<ol[^>]*>([\s\S]*?)<\/ol>/gi;
    
    result = result.replace(olRegex, (match, olContent) => {
      olCount++;
      Logger.debug(`\n--- 处理第 ${olCount} 个 <ol> 组 ---`);
      Logger.debug('ol内容:', olContent);
      
      // 提取所有<li>内容
      const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      const options: string[] = [];
      let liMatch;
      
      while ((liMatch = liRegex.exec(olContent)) !== null) {
        const liContent = liMatch[1];
        // 清理HTML标签，提取纯文本
        const cleanContent = this.extractTextFromHtml(liContent);
        if (cleanContent.trim()) {
          options.push(cleanContent.trim());
        }
      }
      
      Logger.debug(`提取到 ${options.length} 个选项:`, options);
      
      if (options.length === 0) {
        Logger.warn('警告: <ol>中没有有效的<li>选项，返回空字符串');
        return '';
      }
      
      // 随机选择一个选项
      const randomIndex = Math.floor(Math.random() * options.length);
      const selectedOption = options[randomIndex];
      
      Logger.logSynthesis(`随机选择: 索引 ${randomIndex + 1}/${options.length} - "${selectedOption}"`);
      
      // 返回选中的选项，保留换行
      return '\n' + selectedOption + '\n';
    });
    
    Logger.logSynthesis(`总共处理了 ${olCount} 个随机选项组`);
    Logger.debug('处理后的结果:', result);
    Logger.logSynthesis('===== 随机选项解析完成 =====');
    
    return result;
  }

  /**
   * 处理包含随机选项的提示词
   * 先解析随机选项，再清理HTML标签
   * @param prompt 可能包含HTML格式随机选项的提示词
   * @returns 处理后的纯文本提示词
   */
  private processRandomPrompt(prompt: string): string {
    if (!prompt) return '';
    
    // 首先处理随机选项（在清理HTML之前）
    const withRandomResolved = this.parseRandomOptions(prompt);
    
    // 然后清理剩余的HTML标签
    const cleanText = this.extractTextFromHtml(withRandomResolved);
    
    return cleanText;
  }

  private parseShrineFeatures(hiddenPrompt: string): {
    features?: string;
    guidance?: string;
    principles?: string;
  } {
    const result: any = {};
    
    if (!hiddenPrompt) return result;
    
    // 清理HTML标签
    const cleanText = this.extractTextFromHtml(hiddenPrompt);
    console.log('神龛特色解析 - 清理后的文本:', cleanText);
    
    // 提取【神龛特色】
    const featuresMatch = cleanText.match(/【神龛特色】\s*([\s\S]*?)(?=【|$)/);
    if (featuresMatch) {
      result.features = featuresMatch[1].trim();
      console.log('提取到神龛特色:', result.features);
    }
    
    // 提取【合成指导】
    const guidanceMatch = cleanText.match(/【合成指导】\s*([\s\S]*?)(?=【|$)/);
    if (guidanceMatch) {
      result.guidance = guidanceMatch[1].trim();
      console.log('提取到合成指导:', result.guidance);
    }
    
    // 提取【设计原则】
    const principlesMatch = cleanText.match(/【设计原则】\s*([\s\S]*?)(?=【|$)/);
    if (principlesMatch) {
      result.principles = principlesMatch[1].trim();
      console.log('提取到设计原则:', result.principles);
    }
    
    return result;
  }

  /**
   * 构建神龛合成提示词（支持有贡品/无贡品两种模式）
   * @param materials 合成材料
   * @param config 合成配置
   * @returns 合成提示词
   */
  private async buildShrineSynthesisPrompt(materials: ShrineSynthesisMaterial[], config: ShrineSynthesisConfig): Promise<string> {
    const shrine = config.shrineItem;
    const otherMaterials = materials.filter(m => m.id !== shrine.id);
    
    // 分类材料
    const fragments = otherMaterials.filter(m => m.type === 'fragment' && m.hiddenPrompt);
    const divinities = otherMaterials.filter(m => m.type === 'divinity');
    const offerings = otherMaterials.filter(m => m.type === 'offering');
    const others = otherMaterials.filter(m => !['fragment', 'divinity', 'offering'].includes(m.type));

    console.log('材料分类结果:');
    console.log('- 碎片:', fragments.map(f => `${f.name}(${f.type}, hasPrompt: ${!!f.hiddenPrompt})`));
    console.log('- 神性:', divinities.map(d => `${d.name}(${d.type})`));
    console.log('- 贡品:', offerings.map(o => `${o.name}(${o.type})`));
    console.log('- 其他:', others.map(o => `${o.name}(${o.type})`));

    const hasOfferings = offerings.length > 0;
    console.log(`提示词构建模式: ${hasOfferings ? '贡品模式' : '设计模式'}`);

    let prompt = `根据以下材料和设定，按照PF2e规则${hasOfferings ? '调整和优化' : '设计'}一个专长。\n\n`;

    // 解析并优先添加神龛的特色内容（提前到开头位置）
    const shrineFeatures = this.parseShrineFeatures(shrine.hiddenPrompt || '');
    console.log('解析神龛特色:', shrineFeatures);
    
    if (shrineFeatures.guidance) {
      prompt += `【神龛合成指导】\n${shrineFeatures.guidance}\n\n`;
      console.log('添加合成指导到提示词开头');
    }
    
    if (shrineFeatures.features) {
      prompt += `【神龛特色】\n${shrineFeatures.features}\n\n`;
      console.log('添加神龛特色到提示词');
    }
    
    if (shrineFeatures.principles) {
      prompt += `【设计原则】\n${shrineFeatures.principles}\n\n`;
      console.log('添加设计原则到提示词');
    }

    if (hasOfferings) {
      // 核心模板专长
      prompt += '【核心模板专长】\n';
      offerings.forEach((offering, index) => {
        prompt += `模板${index + 1} - ${offering.name}:\n`;
        const cleanDescription = this.extractTextFromHtml(offering.description || '');
        prompt += `专长效果:\n${cleanDescription}\n`;
        if (offering.hiddenPrompt) {
          const cleanHiddenPrompt = this.extractTextFromHtml(offering.hiddenPrompt);
          prompt += `\n补充信息:\n${cleanHiddenPrompt}\n\n`;
        }
      });
      
      prompt += '**注意**：核心模板专长的使用方式请参考【合成指导】或【设计原则】部分的说明。\n\n';
    }

    // 检查是否有神性（决定机制设计的职责）
    const hasDivinities = divinities.length > 0;
    console.log(`神性存在检查: ${hasDivinities ? '有神性' : '无神性'}`);

    // 调整指导方向/机制指导
    if (hasDivinities) {
      prompt += '【调整指导方向】\n';
      divinities.forEach((divinity, index) => {
        prompt += `方向${index + 1} - ${divinity.name}`;
        if (divinity.deity) prompt += ` (${divinity.deity})`;
        prompt += ':\n';
        // 使用 processRandomPrompt 处理神性的隐藏提示词，支持随机选项
        const cleanHiddenPrompt = this.processRandomPrompt(divinity.hiddenPrompt || '');
        prompt += `${cleanHiddenPrompt}\n\n`;
      });

      if (divinities.length > 1) {
        prompt += '**注意**：如有多个指导方向，请合理整合它们的特点，创造出有趣的互动效果。\n\n';
      }
      
      prompt += '**重要说明**：调整指导方向所述机制皆为已有机制概念，你只需要按照机制中需要填充的效果进行组合即可，无需在专长中复述其中提到的任何机制概念名称。\n\n';
    }

    // 补充设计要素
    if (fragments.length > 0) {
      prompt += '【补充设计要素】\n';
      prompt += '以下要素提供可选的效果内容，可以是效果的方向指引，也可以是具体的效果内容：\n\n';
      fragments.forEach((fragment, index) => {
        prompt += `要素${index + 1} - ${fragment.name}:\n`;
        // 使用 processRandomPrompt 处理碎片的隐藏提示词，支持随机选项
        const cleanHiddenPrompt = this.processRandomPrompt(fragment.hiddenPrompt || '');
        prompt += `${cleanHiddenPrompt}\n\n`;
      });
      prompt += '**使用方式**：选择合适的设计要素融入专长中，可以作为主要效果、次要效果或触发条件的一部分。\n\n';
    }

    // 其他材料
    if (others.length > 0) {
      prompt += '【额外材料】\n';
      others.forEach((material, index) => {
        prompt += `材料${index + 1} - ${material.name}:\n`;
        // 优先使用隐藏提示词，如果没有才使用描述
        if (material.hiddenPrompt) {
          // 使用 processRandomPrompt 处理其他材料的隐藏提示词，支持随机选项
          const cleanHiddenPrompt = this.processRandomPrompt(material.hiddenPrompt);
          prompt += `${cleanHiddenPrompt}\n\n`;
        } else {
          const cleanDescription = this.extractTextFromHtml(material.description || '');
          prompt += `${cleanDescription}\n\n`;
        }
      });
    }

    // 角色信息
    if (config.actorData) {
      prompt += '【角色信息】\n';
      if (config.actorData.level) prompt += `等级: ${config.actorData.level}\n`;
      if (config.actorData.class) prompt += `职业: ${config.actorData.class}\n`;
      
      // 检查是否包含完整角色信息
      try {
      const includeActorContext = this.shouldIncludeActorContext(config.shrineItem);
      console.log('INCLUDE_ACTOR_CONTEXT设置:', includeActorContext);
      if (includeActorContext) {
        const actorContext = this.getActorContext(config.actorData);
        console.log('添加角色上下文:', actorContext.substring(0, 100) + '...');
        prompt += actorContext;
        }
      } catch (error) {
        console.warn('获取角色上下文失败，跳过:', error);
      }
      
      prompt += '\n';
    }

    // 检查并处理等效等级（神龛 + 神性）
    const shrineEffectiveLevel = config.shrineItem?.effectiveLevel;
    const divinityEffectiveLevels = divinities.map(d => d.effectiveLevel).filter(Boolean);
    let effectiveLevelNote = '';
    
    console.log('[等效等级检查]', {
      神龛等效等级: shrineEffectiveLevel || '无',
      神性等效等级: divinityEffectiveLevels.length > 0 ? divinityEffectiveLevels : '无',
      基础等级: config.level
    });
    
    if (shrineEffectiveLevel || divinityEffectiveLevels.length > 0) {
      // 计算最终的等效等级
      let finalLevel = config.level;
      const shrineLevel = shrineEffectiveLevel;
      const divinityLevel = divinityEffectiveLevels.length > 0 ? divinityEffectiveLevels[0] : undefined;
      
      if (shrineLevel || divinityLevel) {
        finalLevel = this.calculateStackedEffectiveLevel(
          config.level,
          shrineLevel,
          divinityLevel
        );
        
        // 构建说明文本
        let levelDescription = '';
        if (shrineLevel && divinityLevel) {
          levelDescription = `神龛${shrineLevel} + 神性${divinityLevel}`;
        } else if (shrineLevel) {
          levelDescription = `神龛${shrineLevel}`;
        } else {
          levelDescription = `神性${divinityLevel}`;
        }
        
        console.log(`✅ [等效等级] 最终计算结果: ${finalLevel}级 (基础${config.level}级, 神龛${shrineLevel || '无'}, 神性${divinityLevel || '无'})`);
        console.log(`   → 数值强度将按${finalLevel}级专长设计`);
        effectiveLevelNote = `- **等效等级: ${finalLevel}级（${levelDescription}）** - 数值强度应按${finalLevel}级专长设计（基础等级${config.level}级）\n`;
      }
    } else {
      console.log('ℹ️ [等效等级] 未设置等效等级，使用基础等级:', config.level);
    }
    
    // 专长规格要求
    prompt += `【专长规格要求】\n`;
    prompt += `- 专长等级: ${config.level}\n`;
    if (effectiveLevelNote) {
      prompt += effectiveLevelNote;
    }
    prompt += `- 专长类别: ${this.getCategoryDisplayName(config.category)}\n`;
    if (config.className) {
      prompt += `- 关联职业: ${config.className}\n`;
    }
    prompt += '\n';


    // 注意：PF2e官方标准参考现在添加到System Prompt中，不在User Prompt中
    // 这样做的好处是：
    // 1. System Prompt的优先级更高，AI更重视这些标准
    // 2. User Prompt只包含具体的合成需求，更清晰
    // 3. 知识库作为规则和标准，应该是系统指令而不是用户需求
    
    // 记录职业信息供后续使用
    // 职业信息可以来自三个来源（优先级从高到低）：
    // 1. 神龛配置（config.className，从神龛的GM描述中解析 CLASS_NAME: 职业名 或 CLASS_NAME: SELF）
    // 2. 角色卡数据（actorData.class，当神龛配置为SELF时使用）
    // 3. UI传入的className（从合成界面输入）
    let className: string | undefined = undefined;
    
    // 1. 优先从神龛配置中获取职业
    if (config.className) {
      // 检查是否是SELF标记，如果是则从角色卡获取
      if (config.className.toUpperCase() === 'SELF' && config.actorData?.class) {
        className = config.actorData.class;
        console.log(`✓ 神龛标记为SELF，从角色卡获取职业: ${className}`);
      } else {
      className = config.className;
      console.log(`✓ 从神龛配置获取职业: ${className}`);
    }
    }
    // 2. 其次从actorData获取（如果有角色信息）
    else if (config.actorData?.class) {
      className = config.actorData.class;
      console.log(`✓ 从角色卡获取职业: ${className}`);
    }
    // 3. 如果是class类别但没有具体职业名
    else if (config.category === 'class') {
      console.log('ℹ️ 职业专长但未指定具体职业，将使用通用指导');
    }
    
    // 规范化职业名（转为小写，去除空格）
    if (className) {
      className = className.toLowerCase().trim().replace(/\s+/g, '-');
    }
    
    console.log('ℹ️ PF2e官方标准参考将在System Prompt中添加');

    // 如果是职业专长，尝试获取官方专长示例供参考
    if (className && config.category === 'class') {
      try {
        const featExamples = await this.getClassFeatExamples(className, config.level, config.category);
        if (featExamples) {
          prompt += featExamples;
          console.log(`✓ 已添加${className}职业${config.level}级专长参考示例`);
        }
      } catch (error) {
        console.warn('获取专长示例失败:', error);
      }
    }

    // 输出最终的合成提示词到控制台
    console.log('=== 神龛合成提示词 ===');
    console.log(prompt);
    console.log('=== 提示词结束 ===');

    return prompt;
  }

  /**
   * 生成神龛合成说明
   */
  /**
   * 获取神龛系统使用的AI模型配置
   */
  private getShrineModel(agentType: 'design' | 'format' | 'direct' | 'narrative' | 'iconPrompt'): string {
    const game = (window as any).game;
    if (!game?.settings) {
      // 如果无法访问settings，返回默认值
      const defaults: Record<string, string> = {
        design: 'gpt-4o',
        format: 'gpt-4o',
        direct: 'gpt-4o',
        narrative: 'gpt-4o-mini',
        iconPrompt: 'gpt-4o-mini'
      };
      return defaults[agentType];
    }
    
    const settingKey = `shrine${agentType.charAt(0).toUpperCase() + agentType.slice(1)}Model`;
    try {
      return game.settings.get('ai-pf2e-assistant', settingKey) as string;
    } catch (error) {
      console.warn(`无法读取神龛模型配置 ${settingKey}，使用默认值`);
      const defaults: Record<string, string> = {
        design: 'gpt-4o',
        format: 'gpt-4o',
        direct: 'gpt-4o',
        narrative: 'gpt-4o-mini',
        iconPrompt: 'gpt-4o-mini'
      };
      return defaults[agentType];
    }
  }


  /**
   * 【辅助方法】解析AI的JSON响应
   */
  private parseAIJsonResponse(response: any): any {
    if (typeof response === 'string') {
      // 清理可能的markdown标记
      let cleaned = response.trim();
      cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
      const jsonStart = cleaned.indexOf('{');
      const jsonEnd = cleaned.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
      }
      return JSON.parse(cleaned);
    }
    if (response.choices?.[0]?.message?.content) {
      return this.parseAIJsonResponse(response.choices[0].message.content);
    }
    return response;
  }

  /**
   * 神龛专用专长设计智能体
   * 负责设计符合神龛合成要求的专长
   */
  private async designShrineFeature(prompt: string, level: number, category: string, className?: string, materials?: ShrineSynthesisMaterial[]): Promise<any> {
    // 设计阶段只需要职业设计指南（如有），不需要完整的格式规范
    let knowledgeStandards = '';
    try {
      if (className) {
        const classGuide = this.featKnowledgeService.getClassDesignGuide(className);
        if (classGuide) {
          knowledgeStandards = `\n\n【${className.toUpperCase()}职业专长设计参考】\n\n${classGuide}\n`;
          console.log(`✓ 已添加${className.toUpperCase()}职业设计指南到设计智能体`);
        }
      }
      if (!knowledgeStandards) {
        console.log('ℹ️ 设计阶段：无职业特定指导（通用设计模式）');
      }
    } catch (error) {
      console.warn('获取知识库标准失败:', error);
    }
    
    // 检查神龛配置是否启用规则机制知识库（从GM描述中读取）
    let mechanicsKnowledgeSection = '';
    const shrineItem = materials?.find(m => m.type === 'shrine');
    
    // 从GM描述中解析USE_RULES_KNOWLEDGE配置
    let useRulesKnowledge = false;
    if (shrineItem) {
      useRulesKnowledge = this.parseUseRulesKnowledge(shrineItem, '设计阶段');
    }
    
    if (useRulesKnowledge) {
      console.log('[设计阶段] 启用PF2e规则机制知识库（完整版）');
      try {
        const mechanicsKnowledgeService = PF2eMechanicsKnowledgeService.getInstance();
        const mechanicsKnowledge = mechanicsKnowledgeService.getFullKnowledge();
        mechanicsKnowledgeSection = `\n\n---\n\n## PF2e 规则机制参考（用于设计阶段）\n\n${mechanicsKnowledge}\n\n**设计阶段重点**：\n- 关注机制框架的选择（动作类型、触发条件、频次限制）\n- 参考机制组合原则和平衡设计\n- 使用机制描述模板作为设计灵感\n- 确保数值范围符合等级对应的强度\n\n注意：这里是设计机制框架，具体数值由生成阶段确定。`;
      } catch (error) {
        console.warn('获取PF2e规则机制知识库失败:', error);
      }
    } else {
      console.log('[设计阶段] 未启用PF2e规则机制知识库（默认关闭）');
    }
    
    // 分析材料中的贡品和神性
    const offerings = materials?.filter(m => m.type === 'offering') || [];
    const divinities = materials?.filter(m => m.type === 'divinity') || [];
    const hasOfferings = offerings.length > 0;
    const hasDivinities = divinities.length > 0;
    
    // 获取机制复杂度设置（从神龛配置中获取）
    const shrineItemForConfig = shrineItem?.originalItem || shrineItem;
    const shrineConfig = shrineItemForConfig ? ShrineItemService.extractShrineConfig(shrineItemForConfig) : null;
    const mechanismComplexity = shrineConfig?.mechanismComplexity || 'moderate';
    
    // 构建机制设计指导
    let divinityGuidance = '';
    if (!hasDivinities) {
      // 没有调整指导方向：需要设计师自行设计机制
      if (mechanismComplexity === 'none') {
        // 'none'模式：不进行机制设计
        divinityGuidance = `\n\n---\n\n## 设计说明\n\n当前合成**不需要进行机制设计**，请直接基于材料主题和描述生成专长效果即可。\n\n`;
        divinityGuidance += `**设计要点**：\n`;
        divinityGuidance += `1. 直接理解材料的描述和主题\n`;
        divinityGuidance += `2. 将材料内容转化为专长效果\n`;
        divinityGuidance += `3. 保持简洁明了，不需要复杂的机制框架\n`;
        divinityGuidance += `4. 确保效果与专长等级和类别相匹配\n\n`;
      } else {
        divinityGuidance = `\n\n---\n\n## 机制设计职责（重要！）\n\n当前合成**没有提供调整指导方向**，因此你需要承担机制设计的职责。\n\n`;
        
        // 提供开放性的机制设计指导，不限制具体复杂度
        if (mechanismComplexity === 'simple') {
          divinityGuidance += `**设计倾向：简约直接**\n`;
          divinityGuidance += `专长机制可以倾向于简单直接的设计，但最终由你根据材料主题自由发挥。\n\n`;
        } else if (mechanismComplexity === 'complex') {
          divinityGuidance += `**设计倾向：创新互动**\n`;
          divinityGuidance += `专长机制可以尝试更有创意的设计，如多层互动、资源管理、状态变化等，但不强制要求。根据材料主题选择合适的机制深度。\n\n`;
        } else {
          divinityGuidance += `**设计倾向：平衡适中**\n`;
          divinityGuidance += `专长机制保持适度复杂度，可以有一些有趣的互动，但不过于繁琐。根据材料主题自由选择。\n\n`;
        }
        
        // 添加机制描述框架指南（仅在无神性时提供）
        divinityGuidance += this.getMechanismDescriptionGuide(mechanismComplexity);
        
        divinityGuidance += `\n**设计要点**：\n`;
        divinityGuidance += `1. 基于合成主题和补充设计要素构思机制\n`;
        divinityGuidance += `2. 机制应该有趣、创新、符合主题\n`;
        divinityGuidance += `3. 确保机制与专长等级和类别相匹配\n`;
        divinityGuidance += `4. 不要过度拘泥于复杂度指导，创造力优先\n\n`;
      }
      
      // 无神性时，仍需检查神龛自身的等效等级
      const shrineEffectiveLevel = shrineItem?.effectiveLevel;
      if (shrineEffectiveLevel) {
        const finalLevel = this.calculateEffectiveLevel(shrineEffectiveLevel, level);
        console.log(`[等效等级] 最终计算结果: ${finalLevel}级 (基础${level}级, 神龛${shrineEffectiveLevel}, 无神性)`);
        divinityGuidance += `\n**等效等级：${finalLevel}级（神龛${shrineEffectiveLevel}）** - 神龛设置了等效等级，数值强度应按${finalLevel}级专长设计（基础等级${level}级）\n\n`;
      }
    } else {
      // 有调整指导方向：已提供机制设计
      divinityGuidance = `\n\n---\n\n## 调整指导方向理解（重要！）\n\n当前合成提供了${divinities.length}个调整指导方向，它们定义了专长的核心机制。\n\n`;
      
      divinities.forEach((divinity, index) => {
        divinityGuidance += `**方向${index + 1}：${divinity.name}**\n`;
        const cleanPrompt = this.extractTextFromHtml(divinity.hiddenPrompt || divinity.description || '').substring(0, 300);
        divinityGuidance += `机制描述：${cleanPrompt}${cleanPrompt.length >= 300 ? '...' : ''}\n`;
        
        // 计算叠加的等效等级（神龛基础 + 神性调整）
        const shrineEffectiveLevel = shrineItem?.effectiveLevel;
        const divinityEffectiveLevel = divinity.effectiveLevel;
        
        if (shrineEffectiveLevel || divinityEffectiveLevel) {
          const finalLevel = this.calculateStackedEffectiveLevel(
            level,
            shrineEffectiveLevel,
            divinityEffectiveLevel
          );
          
          console.log(`[等效等级] 最终计算结果: ${finalLevel}级 (基础${level}级, 神龛${shrineEffectiveLevel || '无'}, 神性${divinityEffectiveLevel || '无'})`);
          
          // 构建说明文本
          let levelDescription = '';
          if (shrineEffectiveLevel && divinityEffectiveLevel) {
            levelDescription = `神龛${shrineEffectiveLevel} + 神性${divinityEffectiveLevel}`;
          } else if (shrineEffectiveLevel) {
            levelDescription = `神龛${shrineEffectiveLevel}`;
          } else {
            levelDescription = `神性${divinityEffectiveLevel}`;
          }
          
          divinityGuidance += `**等效等级：${finalLevel}级（${levelDescription}）** - 该调整指导方向添加了机制限制，因此数值强度应按${finalLevel}级专长设计（基础等级${level}级）\n`;
        }
        divinityGuidance += `\n`;
      });
      
      divinityGuidance += `**你的职责**：\n`;
      divinityGuidance += `1. 深入理解调整指导方向提供的机制框架\n`;
      divinityGuidance += `2. 基于这个机制设计专长的具体实现\n`;
      divinityGuidance += `3. 融入补充设计要素提供的效果内容\n`;
      
      const hasAnyEffectiveLevel = shrineItem?.effectiveLevel || divinities.some(d => d.effectiveLevel);
      if (hasAnyEffectiveLevel) {
        divinityGuidance += `4. 如果设置了等效等级（神龛或神性），按该等级的数值强度设计（以补偿机制限制）\n`;
        if (shrineItem?.effectiveLevel && divinities.some(d => d.effectiveLevel)) {
          divinityGuidance += `   - 注意：神龛和神性的等效等级会叠加计算\n`;
        }
      }
      
      divinityGuidance += `\n**关键**：调整指导方向所述机制皆为已有机制概念，你只需要按照机制中需要填充的效果进行组合即可，无需在专长中复述其中提到的任何机制概念名称。\n\n`;
    }
    
    // 构建核心模板专长使用指导
    let offeringGuidance = '';
    if (hasOfferings) {
      offeringGuidance = `\n\n---\n\n## 核心模板专长使用指导\n\n当前合成中包含${offerings.length}个核心模板专长。\n\n`;
      
      offerings.forEach((offering, index) => {
        offeringGuidance += `**模板${index + 1}：${offering.name}**\n`;
        const cleanDesc = this.extractTextFromHtml(offering.description || '').substring(0, 200);
        offeringGuidance += `专长概述：${cleanDesc}...\n\n`;
      });
      
      offeringGuidance += `**重要说明**：\n`;
      offeringGuidance += `核心模板专长的具体使用方式由【合成指导】或【设计原则】决定。请查看这些部分，了解如何使用这些模板专长。\n\n`;
      offeringGuidance += `模板专长可能被用作：\n`;
      offeringGuidance += `- 结构模板（参考其组织方式）\n`;
      offeringGuidance += `- 灵感来源（变化其核心概念）\n`;
      offeringGuidance += `- 效果参考（借鉴部分机制）\n`;
      offeringGuidance += `- 或其他指定的用途\n\n`;
      offeringGuidance += `**按照【合成指导】或【设计原则】来处理模板专长，不要自行假设其用途。**\n\n`;
    }
    
    const systemPrompt = `你是一个专业的Pathfinder 2e专长设计师。你的角色是**纯粹的创意设计师**，只负责输出创意内容。

**🌏 语言要求（重要）**：
- **专长名称必须使用中文**
- 所有描述内容必须使用中文

---

## 你的职责（设计阶段）

你只需要输出两个核心内容：

1. **专长名称**
   - 简洁有力的中文名称
   - 体现专长的核心概念
   
2. **设计理念**（1-2句话）
   - 专长的核心概念是什么？
   - 如何融合材料的主题？
   
3. **机制框架**（文字描述形式）
   - 按照"构件定义→交互逻辑→效果说明"的结构
   - 例如："XX是一种额外效果，当角色使用具有YY特征的动作时，本回合下一个动作会触发XX效果。XX效果通常是与ZZ相关的附加效果。"
   - 清晰描述机制如何工作，不需要具体数值

**你不应该输出**：
- ❌ 具体的数值（+2还是+3、2d6还是3d6）
- ❌ 技术字段（category、actionType、actions、traits等）
- ❌ HTML格式的description
- ❌ Rules数组
- ❌ 完整的描述文本

---

${FEAT_DESIGN_GUIDANCE}

${PREREQUISITES_PRINCIPLE}${divinityGuidance}${offeringGuidance}

${knowledgeStandards}${mechanicsKnowledgeSection}

---

## 输出格式

请以纯文字形式输出，不要使用JSON或函数格式：

---
【专长名称】
专长的名称（中文）

【设计理念】
1-2句话说明核心概念和如何融合材料

【机制框架】
按照"构件定义→交互逻辑→效果说明"的结构，用文字描述机制如何工作。不要包含具体数值。
---`;

    const userPrompt = `请为以下神龛合成需求设计一个${level}级的${category}专长${className ? `（${className}职业）` : ''}：

${prompt}

请严格按照神龛的【合成指导】和材料指引进行设计，主题风格由这些材料决定，不要添加任何预设的风格倾向。`;

    // 输出设计阶段的提示词到控制台
    console.log('=== 神龛专长设计提示词 ===');
    console.log('System Prompt:', systemPrompt.substring(0, 200) + '...');
    console.log('User Prompt:', userPrompt);
    console.log('=== 设计提示词结束 ===');

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt }
    ];

    try {
      const model = this.getShrineModel('design');
      console.log(`[神龛-专长设计] 使用模型: ${model}`);
      const response = await this.aiService.callService(messages, model);
      return this.parseShrineFeatureResponse(response);
    } catch (error) {
      console.error('神龛专长设计失败:', error);
      throw new Error(`神龛专长设计失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 神龛专用格式转换智能体
   * 将神龛专长设计转换为标准的PF2e格式
   */
  private async convertShrineToFeatFormat(feat: any): Promise<any> {
      const systemPrompt = `你是一个Foundry VTT PF2e数据格式验证专家。你的**唯一任务**是检查和修复JSON格式问题。

**🚨 最高优先级规则：不要改写内容！**

你**只能做**以下操作：
1. 修复JSON结构错误（字段类型错误、缺失必需字段）
2. 修复HTML标签问题（未闭合的标签、格式错误）
3. 修复嵌入式引用格式（方括号内改为英文，如 @Damage[2d6[fire]]）
4. 补充缺失的必需字段（如 level、actionType）
5. 修复 actionType 与触发条件的不一致（action 类型不应有触发词条）
6. 标准化 prerequisites.value 格式为 [{value: "文字"}] 对象数组

你**绝对不能做**以下操作：
- ❌ 修改 description.value 的文字表述或效果内容
- ❌ 调整数值大小（如 +1 改成 +2）
- ❌ 添加或删除效果描述段落
- ❌ 修改专长名称、主题或风格
- ❌ 修改 traits 数组中的内容
- ❌ 修改 rules 数组中的内容（除非JSON格式错误）

**字段类型检查清单**：
- name: string（保持不变）
- type: "feat"
- system.level.value: number
- system.actionType.value: "passive" | "action" | "reaction" | "free"
- system.actions.value: number | null（passive时为null，action时为1-3）
- system.traits.value: string[]（保持不变）
- system.traits.rarity: "common" | "uncommon" | "rare" | "unique"
- system.description.value: string（HTML格式，保持内容不变，只修标签）
- system.prerequisites.value: [{value: "先决条件文字"}]（**对象数组**，每项必须是 {value: string} 格式）
- system.frequency: { max: number, per: string }（如果存在）

**先决条件格式修复（重要！）**：
- ✅ 正确格式：[{value: "专家级运动"}, {value: "力量 14"}]
- ❌ 错误格式：["专家级运动", "力量 14"]（纯字符串数组）
- ❌ 错误格式：[{}, {label: "..."}]（空对象或错误key）
- 如果输入是字符串数组，转换为 [{value: "字符串"}] 格式
- 如果没有先决条件，使用空数组 []

${TECHNICAL_REQUIREMENTS}

请返回修复后的JSON数据。如果输入数据格式已经正确，原样返回即可。`;

    const userPrompt = `检查以下专长数据的格式问题，只修复格式错误，**不要改写内容**：

${JSON.stringify(feat, null, 2)}

请原样保留 description.value 的文字内容，只修复其中的HTML标签和嵌入式引用格式。`;

    // 输出格式转换的提示词到控制台
    console.log('=== 神龛格式转换提示词 ===');
    console.log('System Prompt:', systemPrompt.substring(0, 200) + '...');
    console.log('User Prompt:', userPrompt);
    console.log('=== 格式转换提示词结束 ===');

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt }
    ];

    try {
      console.log('[格式转换] 使用AI进行格式转换');
      
      // 检查是否应该使用Function Calling
      const shouldUseFunctionCalling = this.shouldUseFunctionCalling();
      const model = this.getShrineModel('format');
      console.log(`[神龛-格式转换] 使用模型: ${model}`);
      
      let response;
      if (shouldUseFunctionCalling) {
        console.log('[Function Calling] 使用Function Calling模式');
        response = await this.aiService.callService(messages, {
          model,
          tools: [{
            type: 'function',
            function: FEAT_GENERATION_SCHEMA
          }],
          tool_choice: { type: 'function', function: { name: 'generateFeat' } }
        });
      } else {
        console.log('[文本生成] 使用普通文本生成模式（不使用Function Calling）');
        response = await this.aiService.callService(messages, model);
      }
      
      return this.parseShrineFormatResponseWithFunctionCall(response);
    } catch (error) {
      console.error('神龛格式转换失败:', error);
      throw new Error(`神龛格式转换失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取神龛系统的配置开关
   */
  private getShrinePhaseEnabled(phase: 'design' | 'format'): boolean {
    const game = (window as any).game;
    if (!game?.settings) {
      // 默认值
      return true;
    }
    
    const settingKey = phase === 'design' ? 'shrineEnableDesign' : 'shrineEnableFormat';
    try {
      return game.settings.get('ai-pf2e-assistant', settingKey) as boolean;
    } catch (error) {
      console.warn(`无法读取神龛配置 ${settingKey}，使用默认值 true`);
      return true;
    }
  }

  /**
   * 统一的神龛专长生成流程（三步：设计→生成→格式化）
   * 设计和格式化可以通过配置开关控制
   */
  private async generateFeatDirect(
    prompt: string, 
    level: number, 
    category: string, 
    className?: string,
    shouldGenerateIcon: boolean = false,
    materials?: ShrineSynthesisMaterial[],
    requiredTraits?: string[]
  ): Promise<any> {
    console.log('=== 开始神龛专长统一生成流程 ===');
    
    // 检查是否有神性材料和贡品材料
    const hasDivinities = materials && materials.some(m => m.type === 'divinity');
    const hasOfferings = materials && materials.some(m => m.type === 'offering');
    
    // 计算等效等级（用于数值强度参考）
    const shrineItem = materials?.find(m => m.type === 'shrine');
    const divinities = materials?.filter(m => m.type === 'divinity') || [];
    const shrineEffectiveLevel = shrineItem?.effectiveLevel;
    const divinityEffectiveLevel = divinities.length > 0 && divinities[0].effectiveLevel ? divinities[0].effectiveLevel : undefined;
    
    let effectiveLevel = level; // 默认使用基础等级
    if (shrineEffectiveLevel || divinityEffectiveLevel) {
      effectiveLevel = this.calculateStackedEffectiveLevel(level, shrineEffectiveLevel, divinityEffectiveLevel);
      console.log(`[生成流程] 计算等效等级: ${effectiveLevel}级 (基础${level}级, 神龛${shrineEffectiveLevel || '无'}, 神性${divinityEffectiveLevel || '无'})`);
    }
    
    // 如果有神性或贡品，自动跳过设计阶段
    // - 神性：已提供核心机制设计
    // - 贡品：已提供模板专长结构，设计阶段多余
    let enableDesign = this.getShrinePhaseEnabled('design');
    let designSkipReason = '';
    if (hasDivinities) {
      enableDesign = false;
      designSkipReason = '神性已提供核心机制';
      console.log('检测到神性材料，自动跳过设计阶段（神性已提供核心机制）');
    } else if (hasOfferings) {
      enableDesign = false;
      designSkipReason = '贡品已提供模板结构';
      console.log('检测到贡品材料，自动跳过设计阶段（贡品已提供模板专长结构）');
    }
    
    const enableFormat = this.getShrinePhaseEnabled('format');
    
    console.log(`流程配置: 设计阶段=${enableDesign ? '开启' : `关闭（${designSkipReason || '配置关闭'}）`}, 格式化阶段=${enableFormat ? '开启' : '关闭'}`);
    
    let designPlan: any = null;
    let generatedFeat: any;
    let finalFeat: any;
    
    // ========== 阶段1: 设计 (可选) ==========
    if (enableDesign) {
      console.log('--- 阶段1: 设计阶段 ---');
      designPlan = await this.designShrineFeature(prompt, level, category, className, materials);
      console.log(`设计方案完成: ${designPlan.name}`);
    } else {
      console.log(`--- 跳过设计阶段（${designSkipReason || '配置关闭'}） ---`);
    }
    
    // ========== 阶段2: 生成 (核心) ==========
    console.log('--- 阶段2: 生成阶段 ---');
    generatedFeat = await this.generateFeatWithPrompt(prompt, level, effectiveLevel, category, className, materials, designPlan);
    console.log(`专长生成完成: ${generatedFeat.name}`);
      
    // ========== 阶段3: 格式化 (可选) ==========
    if (enableFormat) {
      console.log('--- 阶段3: 格式化阶段 ---');
      finalFeat = await this.convertShrineToFeatFormat(generatedFeat);
      console.log(`格式转换完成: ${finalFeat.name}`);
    } else {
      console.log('--- 跳过格式化阶段 ---');
      finalFeat = generatedFeat;
    }

    // 如果需要生成图标，添加图标提示词
    if (shouldGenerateIcon) {
      const iconPrompt = await this.generateIconPrompt(finalFeat);
      if (iconPrompt) {
        (finalFeat as any).iconPrompt = iconPrompt;
      }
    }

    // 清理和修复专长数据，确保能通过验证
    const sanitizedFeat = this.sanitizeFeatData(finalFeat);
    
    // 强制设置 category 为配置中指定的值，不依赖 AI 返回
    if (sanitizedFeat.system) {
      sanitizedFeat.system.category = category;
      console.log(`[generateFeatDirect] ✓ 强制设置 category 为配置值: "${category}"`);
    }
    
    // 应用必定携带的特征
    if (requiredTraits && requiredTraits.length > 0) {
      if (!sanitizedFeat.system.traits) {
        sanitizedFeat.system.traits = { value: [], rarity: 'common', otherTags: [] };
      }
      if (!sanitizedFeat.system.traits.value) {
        sanitizedFeat.system.traits.value = [];
      }
      
      // 添加必定携带的特征（避免重复）
      for (const trait of requiredTraits) {
        if (!sanitizedFeat.system.traits.value.includes(trait)) {
          sanitizedFeat.system.traits.value.push(trait);
          console.log(`[generateFeatDirect] ✓ 添加必定携带的特征: "${trait}"`);
        }
      }
    }
    
    console.log('=== 神龛专长生成流程完成 ===');

    return sanitizedFeat;
  }

  /**
   * 核心生成方法：基于神龛提示词和可选的设计方案生成专长
   * 
   * @param prompt 神龛合成提示词（材料、指导等）
   * @param level 专长等级（基础等级）
   * @param effectiveLevel 等效等级（用于数值强度参考）
   * @param category 专长类别
   * @param className 职业名称（可选）
   * @param materials 材料列表（包含贡品模板）
   * @param designPlan 设计阶段生成的方案（可选，如果有则追加到提示词中）
   */
  private async generateFeatWithPrompt(
    prompt: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    level: number,
    effectiveLevel: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    category: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    className?: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    materials?: ShrineSynthesisMaterial[],
    designPlan?: any
  ): Promise<any> {
    // 从优化版知识库获取格式转换指导
    let knowledgeStandards = '';
    try {
      const formatConversionGuidance = this.featKnowledgeService.getFormatConversionGuidance();
      
      if (formatConversionGuidance) {
        knowledgeStandards = formatConversionGuidance;
      }
    } catch (error) {
      console.warn('获取知识库标准失败:', error);
    }
    
    // 检查神龛配置是否启用规则机制知识库（从GM描述中读取）
    let rulesKnowledgeSection = '';
    const shrineItem = materials?.find(m => m.type === 'shrine');
    
    // 从GM描述中解析USE_RULES_KNOWLEDGE配置
    let useRulesKnowledge = false;
    if (shrineItem) {
      useRulesKnowledge = this.parseUseRulesKnowledge(shrineItem, '生成阶段');
    }
    
    if (useRulesKnowledge) {
      console.log('[生成阶段] 启用PF2e规则机制知识库（完整版）');
      try {
        const mechanicsKnowledgeService = PF2eMechanicsKnowledgeService.getInstance();
        const mechanicsKnowledge = mechanicsKnowledgeService.getFullKnowledge();
        
        // 根据是否有等效等级，构建不同的强度参考说明
        let strengthGuidance = '';
        if (effectiveLevel !== level) {
          strengthGuidance = `\n\n**⚠️ 重要 - 数值强度调整**：\n- 专长基础等级：${level}级\n- 等效等级（数值强度参考）：${effectiveLevel}级\n- **数值强度应按${effectiveLevel}级专长设计**（伤害、治疗、加值等参考${effectiveLevel}级标准）\n- 但专长的level字段仍设置为${level}`;
        }
        
        rulesKnowledgeSection = `\n\n---\n\n## PF2e 规则机制参考（用于生成阶段）\n\n${mechanicsKnowledge}${strengthGuidance}\n\n**生成阶段重点**：\n- 将机制框架转化为具体的数值和描述\n- 确保数值范围符合${effectiveLevel}级专长的强度（参考"机制强度参考"章节）\n- 使用正确的术语和表述方式\n- 在描述中清晰说明所有规则细节`;
      } catch (error) {
        console.warn('获取PF2e规则机制知识库失败:', error);
      }
    } else {
      console.log('[生成阶段] 未启用PF2e规则机制知识库（默认关闭）');
    }
    
    // 根据是否有设计方案，构建不同详细度的 systemPrompt
    let systemPrompt: string;
    
    if (designPlan) {
      // ===== 有设计方案：精简提示词，聚焦实现 =====
      console.log('[生成阶段] 有设计方案，使用精简提示词');
      systemPrompt = `你是一个专业的Pathfinder 2e专长生成师。你的角色是**实现者**，严格基于设计方案生成专长数据。

**🌏 语言要求**：专长名称和描述必须使用中文。

## 你的任务

将设计方案的机制框架转化为完整的PF2e专长JSON数据：

1. **严格遵循设计方案**的名称、理念和机制框架
2. **填充具体数值**：根据专长等级确定加值、伤害骰等
3. **编写description.value**：完整的HTML格式规则描述，包含所有细节
4. **确定技术字段**：actionType、actions、traits、frequency等

**关键原则**：你是实现者，不是设计者。不要偏离设计方案的机制框架。

${DESCRIPTION_PRINCIPLE}

${TECHNICAL_REQUIREMENTS}

**Rules数组说明**：description.value是核心，rules可以简化或留空。不确定格式时，只在description中详细描述效果即可。
${materials && materials.filter(m => m.type === 'offering').length > 0 ? '如果贡品的rules有错误，不要复制。\n' : ''}
${knowledgeStandards}${rulesKnowledgeSection}

请使用JSON格式返回完整的PF2e专长数据。`;
    } else {
      // ===== 无设计方案：完整提示词，从头创作 =====
      console.log('[生成阶段] 无设计方案，使用完整提示词');
      systemPrompt = `你是一个专业的Pathfinder 2e专长生成师。你需要从头创作完整的专长内容。

**🌏 语言要求（最高优先级）**：
- **专长名称（name字段）必须使用中文，绝对不要使用英文**
- 所有描述内容（description.value）必须使用中文

---

## 你的任务

1. **分析合成材料**：理解神龛、神性、碎片${materials && materials.filter(m => m.type === 'offering').length > 0 ? '、贡品' : ''}的主题
2. **选择合适的机制**：动作类型、触发条件、频次，确保与${level}级${category}专长匹配
3. **编写description.value**：完整HTML格式，包含所有规则细节
4. **设置合理数值**：${effectiveLevel !== level ? `数值强度按${effectiveLevel}级专长设计（基础等级${level}级）` : `参考${level}级官方专长的强度`}

---

${FEAT_DESIGN_GUIDANCE}

${PREREQUISITES_PRINCIPLE}

${DESCRIPTION_PRINCIPLE}

${PF2E_FORMAT_STANDARD}

**Rules数组说明**：
- description.value是核心，rules可以简化或留空
${materials && materials.filter(m => m.type === 'offering').length > 0 ? '- 如果贡品的rules有错误，不要复制\n' : ''}- 不确定格式时，只在description中详细描述效果即可

${knowledgeStandards}${rulesKnowledgeSection}

${TECHNICAL_REQUIREMENTS}

请使用JSON格式返回完整的PF2e专长数据。`;
    }

    // 构建user prompt，优先展示设计方案（如果有）
    let userPrompt = '';
    if (designPlan) {
      userPrompt += `【设计方案】（重要！请严格遵循）\n\n`;
      userPrompt += `专长名称：${designPlan.name}\n`;
      userPrompt += `等级：${level}\n`;
      if (effectiveLevel !== level) {
        userPrompt += `等效等级（数值强度）：${effectiveLevel}级\n`;
      }
      userPrompt += `类别：${category}\n`;
      if (className) {
        userPrompt += `职业：${className}\n`;
        userPrompt += `特征要求：必须包含"${className.toLowerCase()}"（不包含"class"）\n`;
      } else {
        userPrompt += `特征要求：根据专长类型确定（${category === 'general' ? 'general' : category === 'skill' ? 'skill' : 'combat, 等'}）\n`;
      }
      userPrompt += `\n【设计理念】：\n${designPlan.designRationale}\n`;
      userPrompt += `\n【机制框架】：\n${designPlan.mechanicsFramework}\n`;
      userPrompt += `\n---\n\n`;
      userPrompt += `请基于上述设计方案生成完整的专长数据。\n\n`;
      userPrompt += `**关键要求**：\n`;
      userPrompt += `1. 专长名称必须是"${designPlan.name}"（中文）\n`;
      userPrompt += `2. 等级必须是${level}\n`;
      if (effectiveLevel !== level) {
        userPrompt += `3. 数值强度（伤害、治疗、加值等）应按${effectiveLevel}级专长设计\n`;
        userPrompt += `4. 这是${category}专长${className ? `（${className}职业）` : ''}\n`;
        if (className) {
          userPrompt += `5. 这是${className}职业专长，traits必须包含"${className.toLowerCase()}"但不包含"class"\n`;
          userPrompt += `6. 根据机制框架的文字描述，编写详细的description.value，包含具体数值和规则细节\n`;
        } else {
          userPrompt += `5. 根据机制框架的文字描述，编写详细的description.value，包含具体数值和规则细节\n`;
        }
      } else {
        userPrompt += `3. 这是${category}专长${className ? `（${className}职业）` : ''}\n`;
        if (className) {
          userPrompt += `4. 这是${className}职业专长，traits必须包含"${className.toLowerCase()}"但不包含"class"\n`;
          userPrompt += `5. 根据机制框架的文字描述，编写详细的description.value，包含具体数值和规则细节\n`;
        } else {
          userPrompt += `4. 根据机制框架的文字描述，编写详细的description.value，包含具体数值和规则细节\n`;
        }
      }
      const nextNum = effectiveLevel !== level ? (className ? 7 : 6) : (className ? 6 : 5);
      userPrompt += `${nextNum}. 机制框架是交互逻辑的描述，你需要将它转化为游戏规则文本\n`;
      userPrompt += `${nextNum + 1}. 动作类型（actionType）、动作数量（actions）、特征（traits）等技术细节由你根据机制框架确定\n`;
      userPrompt += `${nextNum + 2}. **注意**：不需要在返回的数据中包含 category 字段，category 会由系统自动设置\n\n`;
      console.log('[生成阶段] 已优先展示设计方案');
    }
    
    userPrompt += `【神龛合成材料】\n\n${prompt}`;
    
    if (!designPlan && materials && materials.filter(m => m.type === 'offering').length > 0) {
      userPrompt += `\n\n**注意**：有贡品模板可供参考，但请进行创造性变化，不要简单复制。`;
    }

    // 输出直接生成的提示词到控制台
    console.log('=== 神龛专长生成提示词 ===');
    console.log('System Prompt:', systemPrompt.substring(0, 200) + '...');
    console.log('User Prompt (前500字符):', userPrompt.substring(0, 500) + '...');
    console.log('=== 生成提示词结束 ===');

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt }
    ];

    const maxRetries = 2; // 最多重试2次
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
        if (attempt > 0) {
          console.log(`[专长生成] 第${attempt + 1}次尝试（重试${attempt}次）`);
        } else {
      console.log('[专长生成] 使用AI生成专长');
        }
      
      // 检查是否应该使用Function Calling
      // 注意：某些中转API可能不支持Claude的tool calling，此时直接使用文本生成
      const shouldUseFunctionCalling = this.shouldUseFunctionCalling();
        const model = this.getShrineModel('direct');
        console.log(`[神龛-直接生成] 使用模型: ${model}`);
      
      let response;
      if (shouldUseFunctionCalling) {
        console.log('[Function Calling] 使用Function Calling模式');
        response = await this.aiService.callService(messages, {
            model,
          tools: [{
            type: 'function',
            function: FEAT_GENERATION_SCHEMA
          }],
          tool_choice: { type: 'function', function: { name: 'generateFeat' } }
        });
        
        console.log('[Function Calling] 收到完整响应，结构:', JSON.stringify({
          hasChoices: !!response.choices,
          choicesLength: response.choices?.length,
          firstMessageKeys: response.choices?.[0]?.message ? Object.keys(response.choices[0].message) : [],
          contentType: typeof response.choices?.[0]?.message?.content,
          hasToolCalls: !!response.choices?.[0]?.message?.tool_calls,
          hasFunctionCall: !!response.choices?.[0]?.message?.function_call,
          contentIsArray: Array.isArray(response.choices?.[0]?.message?.content)
        }, null, 2));
      } else {
        console.log('[文本生成] 使用普通文本生成模式（不使用Function Calling）');
          response = await this.aiService.callService(messages, model);
        }
        
        // 尝试解析响应，使用增强的容错逻辑
        const parsed = this.parseShrineFormatResponseWithFunctionCall(response);
        
        // 验证解析结果的核心字段
        if (!parsed || !parsed.name || !parsed.system?.description?.value) {
          throw new Error('解析结果缺少核心字段（name或description）');
        }
        
        console.log('[专长生成] 解析成功，专长名称:', parsed.name);
        return parsed;
        
    } catch (error) {
        lastError = error as Error;
        console.error(`[专长生成] 第${attempt + 1}次尝试失败:`, error);
        
        // 如果不是最后一次尝试，继续重试
        if (attempt < maxRetries) {
          console.log(`[专长生成] 将进行第${attempt + 2}次尝试...`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒后重试
        }
      }
    }
    
    // 所有尝试都失败了
    console.error('[专长生成] 所有尝试都失败，最后的错误:', lastError);
    throw new Error(`神龛专长生成失败（尝试${maxRetries + 1}次后仍失败）: ${lastError?.message || '未知错误'}`);
  }


  /**
   * 为专长生成图标提示词
   */
  private async generateIconPrompt(feat: any): Promise<string | null> {
    try {
      const messages = [
        {
          role: 'system' as const,
          content: `你是一个专业的图标设计师。请为PF2e专长生成简洁的英文图标提示词，专注于视觉特征描述。

要求：
1. 使用简洁的英文描述
2. 专注于视觉元素：颜色、形状、材质、符号
3. 适合幻想风格的图标生成
4. 避免复杂的功能描述
5. 长度控制在50个单词以内

示例格式："glowing sword with divine aura, golden light emanating, fantasy weapon icon"`
        },
        {
          role: 'user' as const,
          content: `请为以下专长生成图标提示词：
          
名称: ${feat.name}
描述: ${feat.system?.description?.value || feat.description || ''}
特征: ${feat.system?.traits?.value?.join(', ') || ''}

请生成一个简洁的英文图标提示词。`
        }
      ];

      const model = this.getShrineModel('iconPrompt');
      console.log(`[神龛-图标提示词] 使用模型: ${model}`);
      const response = await this.aiService.callService(messages, model);
      
      let content = '';
      if (typeof response === 'string') {
        content = response;
      } else if (response && response.choices && response.choices[0] && response.choices[0].message) {
        content = response.choices[0].message.content || '';
      } else if (response && response.content) {
        content = response.content;
      }

      // 提取图标提示词，移除引号和多余文本
      const cleanPrompt = content
        .replace(/["']/g, '')
        .replace(/图标提示词[:：]?\s*/gi, '')
        .replace(/Icon prompt[:：]?\s*/gi, '')
        .trim();

      console.log('生成的图标提示词:', cleanPrompt);
      return cleanPrompt || null;
    } catch (error) {
      console.error('生成图标提示词失败:', error);
      return null;
    }
  }

  /**
   * 解析神龛专长设计响应
   */
  private parseShrineFeatureResponse(response: any): any {
    console.log('\n' + '='.repeat(80));
    console.log('【设计阶段】解析神龛专长设计响应（纯文本）');
    console.log('='.repeat(80));
    
    const content = response.choices?.[0]?.message?.content || '';
    console.log('→ 收到纯文本设计内容，长度:', content.length);
    
    // 从纯文本格式中提取信息
    const nameMatch = content.match(/【专长名称】\s*\n\s*(.+?)(?=\n|$)/);
    const rationaleMatch = content.match(/【设计理念】\s*\n\s*(.+?)(?=\n\n【|$)/s);
    const frameworkMatch = content.match(/【机制框架】\s*\n\s*(.+?)(?=\n---|\n\n【|$)/s);
    
    const designPlan = {
      name: nameMatch?.[1]?.trim() || '专长',
      designRationale: rationaleMatch?.[1]?.trim() || '未指定设计理念',
      mechanicsFramework: frameworkMatch?.[1]?.trim() || '未指定机制框架'
    };
    
    console.log('✓ 成功从文本提取设计内容');
    
    // ============================================================
    // 输出完整的设计方案到F12控制台（简化版）
    // ============================================================
    console.log('\n' + '━'.repeat(80));
    console.log('【设计方案完整输出】');
    console.log('━'.repeat(80));
    console.log('专长名称:', designPlan.name);
    console.log('\n【设计理念】:');
    console.log(designPlan.designRationale);
    console.log('\n【机制框架】:');
    console.log(designPlan.mechanicsFramework);
    console.log('━'.repeat(80) + '\n');
    
    return designPlan;
  }

  /**
   * 解析使用Function Calling的响应
   * 支持 GPT (tool_calls/function_call) 和 Claude (content[].tool_use) 格式
   */
  private parseShrineFormatResponseWithFunctionCall(response: any): any {
    console.log('[Function Calling] 开始解析Function Call响应');
    
    try {
      // 尝试从tool_calls解析（GPT新格式）
      if (response.choices?.[0]?.message?.tool_calls?.[0]) {
        const toolCall = response.choices[0].message.tool_calls[0];
        console.log('[Function Calling] 检测到GPT tool_calls格式');
        const parsedContent = JSON.parse(toolCall.function.arguments);
        console.log('[Function Calling] 成功从tool_calls解析数据');
        
        // 验证描述字段
        this.validateFunctionCallDescription(parsedContent);
        
        return this.buildShrineFeatureFormat(parsedContent);
      }
      
      // 尝试从function_call解析（GPT旧格式）
      if (response.choices?.[0]?.message?.function_call) {
        const functionCall = response.choices[0].message.function_call;
        console.log('[Function Calling] 检测到GPT function_call格式');
        const parsedContent = JSON.parse(functionCall.arguments);
        console.log('[Function Calling] 成功从function_call解析数据');
        
        // 验证描述字段
        this.validateFunctionCallDescription(parsedContent);
        
        return this.buildShrineFeatureFormat(parsedContent);
      }
      
      // 尝试从Claude的content数组中解析tool_use
      if (response.choices?.[0]?.message?.content && Array.isArray(response.choices[0].message.content)) {
        const content = response.choices[0].message.content;
        const toolUseBlock = content.find((block: any) => block.type === 'tool_use');
        
        if (toolUseBlock) {
          console.log('[Function Calling] 检测到Claude tool_use格式');
          const parsedContent = toolUseBlock.input;
          console.log('[Function Calling] 成功从Claude tool_use解析数据');
          
          // 验证描述字段
          this.validateFunctionCallDescription(parsedContent);
          
          return this.buildShrineFeatureFormat(parsedContent);
        }
      }
      
      // Claude可能直接在content中返回tool_use（非数组格式）
      if (response.choices?.[0]?.message?.content?.type === 'tool_use') {
        console.log('[Function Calling] 检测到Claude单个tool_use格式');
        const parsedContent = response.choices[0].message.content.input;
        console.log('[Function Calling] 成功从Claude单个tool_use解析数据');
        
        // 验证描述字段
        this.validateFunctionCallDescription(parsedContent);
        
        return this.buildShrineFeatureFormat(parsedContent);
      }
      
      // 如果不是Function Call格式，回退到普通解析
      console.warn('[Function Calling] 未检测到Function Call格式，回退到普通解析');
      return this.parseShrineFormatResponse(response);
      
    } catch (error) {
      console.error('[Function Calling] Function Call解析失败:', error);
      
      // 尝试回退到普通解析
      try {
        console.log('[Function Calling] 尝试使用普通解析作为回退...');
        const fallbackResult = this.parseShrineFormatResponse(response);
        console.log('[Function Calling] 普通解析回退成功');
        return fallbackResult;
      } catch (fallbackError) {
        console.error('[Function Calling] 普通解析回退也失败:', fallbackError);
        console.error('[Function Calling] 完整响应:', JSON.stringify(response, null, 2).substring(0, 1000));
        throw new Error(`解析失败（包括回退尝试）: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  
  /**
   * 判断是否应该使用Function Calling
   * 某些中转API可能不支持Claude的tool calling，此时返回false使用普通文本生成
   */
  private shouldUseFunctionCalling(): boolean {
    // 检查模型类型来决定是否使用Function Calling
    // GPT模型和最新的gpt-5等模型支持Function Calling
    // Claude通过中转API可能不支持
    
    // 如果有配置项，可以从这里读取
    // const useFunctionCalling = game?.settings?.get(MODULE_ID, 'useFunctionCalling');
    // if (useFunctionCalling !== undefined) return useFunctionCalling;
    
    // 默认策略：
    // - GPT系列（包括gpt-4, gpt-5等）：启用
    // - Claude系列通过中转API：禁用（因为测试发现不支持）
    // - 其他模型：启用（尝试使用）
    
    // 注意：目前即使禁用Function Calling，文本解析也工作得很好
    // 所以这个设置不会影响功能，只是影响AI返回格式的验证严格程度
    return true; // 启用Function Calling，让GPT等支持的模型使用结构化输出
  }
  
  /**
   * 验证Function Call返回的描述字段
   */
  private validateFunctionCallDescription(data: any): void {
    const descValue = data.system?.description?.value;
    
    if (!descValue || typeof descValue !== 'string' || descValue.trim().length < 10) {
      console.error('[Function Calling] 描述字段验证失败:', {
        exists: !!descValue,
        type: typeof descValue,
        length: descValue?.length || 0
      });
      throw new Error('Function Call返回的描述字段为空或过短，这违反了schema要求');
    }
    
    console.log(`[Function Calling] 描述字段验证通过 (长度: ${descValue.length})`);
  }

  /**
   * 解析神龛格式转换响应（回退方法，用于非Function Call情况）
   */
  private parseShrineFormatResponse(response: any): any {
    console.log('[格式转换] 开始解析神龛格式转换响应');
    
    let parsedContent: any;
    
    // 尝试从function_call解析
    if (response.choices?.[0]?.message?.function_call) {
      try {
        const functionCall = response.choices[0].message.function_call;
        parsedContent = JSON.parse(functionCall.arguments);
        console.log('[格式转换] 从function_call解析成功');
    } catch (error) {
        console.error('[格式转换] function_call解析失败:', error);
      }
    }
    
    // 如果function_call解析失败，尝试从content解析
    if (!parsedContent && response.choices?.[0]?.message?.content) {
      const content = response.choices?.[0]?.message?.content;
      console.log('[格式转换] 尝试从content解析，内容长度:', content.length);
      console.log('[格式转换] content前500字符:', content.substring(0, 500));
      
      try {
    // 提取JSON内容
        const jsonMatch = content.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || content.match(/({[\s\S]*})/);
    if (jsonMatch) {
          console.log('[格式转换] JSON匹配成功，提取的JSON前200字符:', jsonMatch[1].substring(0, 200));
          const cleanJson = this.fixCommonJsonErrors(jsonMatch[1]);
          parsedContent = JSON.parse(cleanJson);
          console.log('[格式转换] 从content解析JSON成功');
          console.log('[格式转换] 解析后的对象键:', Object.keys(parsedContent));
          console.log('[格式转换] system对象键:', parsedContent.system ? Object.keys(parsedContent.system) : '无system');
          console.log('[格式转换] system.description:', parsedContent.system?.description);
        }
      } catch (error) {
        console.error('[格式转换] JSON解析失败:', error);
        console.error('[格式转换] 原始content:', response.choices?.[0]?.message?.content?.substring(0, 500));
      }
    }
    
    if (!parsedContent) {
      console.error('[格式转换] 无法解析响应，完整响应:', JSON.stringify(response, null, 2).substring(0, 1000));
      throw new Error('无法解析神龛格式转换响应：未找到有效的JSON数据');
    }
    
    // 宽松验证：只要求有name和description即可，其他字段可以自动补全
    console.log('[格式转换] 验证解析后的数据...');
    const hasName = !!(parsedContent.name);
    const hasDescription = !!(
      parsedContent.system?.description?.value || 
      parsedContent.description?.value || 
      parsedContent.description
    );
    
    if (!hasName || !hasDescription) {
      console.warn('[格式转换] 缺少核心字段，尝试部分提取...', { hasName, hasDescription });
      console.warn('[格式转换] 当前解析结果:', JSON.stringify(parsedContent, null, 2).substring(0, 500));
      
      // 尝试从响应文本中提取至少name和description
      const content = response.choices?.[0]?.message?.content || '';
      
      if (!hasName) {
        const nameMatch = content.match(/["""]?name["""]?\s*:\s*["""]([^"""]+)["""]/i);
        if (nameMatch) {
          parsedContent.name = nameMatch[1];
          console.log('[格式转换] 从文本提取到name:', parsedContent.name);
        }
      }
      
      if (!hasDescription) {
        const descMatch = content.match(/["""]?description["""]?\s*:\s*["""]([^"""]+)["""]/i);
        if (descMatch) {
          if (!parsedContent.system) parsedContent.system = {};
          if (!parsedContent.system.description) parsedContent.system.description = {};
          parsedContent.system.description.value = descMatch[1];
          console.log('[格式转换] 从文本提取到description:', descMatch[1].substring(0, 100));
        }
      }
      
      // 最终验证
      if (!parsedContent.name && !parsedContent.system?.description?.value) {
        throw new Error('无法从响应中提取核心字段（name和description都缺失）');
      }
    } else {
      console.log('[格式转换] 核心字段验证通过');
    }
    
    console.log('[格式转换] 调用buildShrineFeatureFormat...');
    const result = this.buildShrineFeatureFormat(parsedContent);
    console.log('[格式转换] buildShrineFeatureFormat完成，返回的专长名:', result.name);
    console.log('[格式转换] 返回的description对象:', result.system?.description);
    return result;
  }

  /**
   * 将解析的内容转换为标准的神龛专长设计格式
   */

  /**
   * 验证并提取描述字段
   * 尝试多个可能的路径来获取描述内容
   */
  private validateAndExtractDescription(args: any, featName: string = '未知专长'): { value: string; gm: string } {
    console.log(`[描述提取] 开始为专长 "${featName}" 提取描述`);
    
    // 尝试多个可能的描述值路径
    const possibleValuePaths = [
      args.system?.description?.value,
      args.description?.value,
      args.description,
      args.system?.description
    ];
    
    // 尝试多个可能的GM描述路径
    const possibleGmPaths = [
      args.system?.description?.gm,
      args.description?.gm,
      ''
    ];
    
    let descriptionValue = '';
    let descriptionGm = '';
    
    // 查找第一个有效的描述值
    for (let i = 0; i < possibleValuePaths.length; i++) {
      const path = possibleValuePaths[i];
      if (path && typeof path === 'string' && path.trim().length > 0) {
        descriptionValue = path;
        console.log(`[描述提取] 从路径 ${i} 找到描述值 (长度: ${descriptionValue.length})`);
        break;
      }
    }
    
    // 查找第一个有效的GM描述
    for (let i = 0; i < possibleGmPaths.length; i++) {
      const path = possibleGmPaths[i];
      if (path && typeof path === 'string') {
        descriptionGm = path;
        if (descriptionGm.length > 0) {
          console.log(`[描述提取] 从路径 ${i} 找到GM描述 (长度: ${descriptionGm.length})`);
        }
        break;
      }
    }
    
    // 如果描述仍然为空，输出警告
    if (!descriptionValue || descriptionValue.trim().length === 0) {
      console.warn(`[描述提取] 警告: 专长 "${featName}" 的描述为空!`);
      console.warn('[描述提取] AI返回的原始数据:', JSON.stringify(args, null, 2));
      
      // 尝试从其他字段构建基本描述
      if (args.name) {
        descriptionValue = `<p>这是一个专长。</p>`;
        console.warn(`[描述提取] 使用默认描述作为回退`);
      }
    } else {
      console.log(`[描述提取] 成功提取描述 (长度: ${descriptionValue.length})`);
    }
    
    return {
      value: descriptionValue,
      gm: descriptionGm
    };
  }

  /**
   * 标准化先决条件格式为 PF2e Foundry VTT 要求的 [{value: string}] 格式
   * 处理多种可能的AI输出格式：
   * - 正确: [{value: "专家级运动"}]
   * - 字符串数组: ["专家级运动"] → [{value: "专家级运动"}]
   * - 空对象: [{}] → 过滤掉
   * - 错误key: [{label: "..."}] → [{value: "..."}]
   * - 纯字符串: "专家级运动" → [{value: "专家级运动"}]
   */
  private normalizePrerequisites(rawPrereqs: any): Array<{value: string}> {
    if (!rawPrereqs) return [];

    // 如果是纯字符串，包装成数组
    if (typeof rawPrereqs === 'string') {
      const trimmed = rawPrereqs.trim();
      if (trimmed.length === 0) return [];
      console.warn(`[先决条件] 修正格式：纯字符串 "${trimmed}" → [{value: "${trimmed}"}]`);
      return [{ value: trimmed }];
    }

    if (!Array.isArray(rawPrereqs)) {
      console.warn(`[先决条件] 非数组类型 (${typeof rawPrereqs})，忽略`);
      return [];
    }

    const normalized: Array<{value: string}> = [];
    for (const item of rawPrereqs) {
      if (typeof item === 'string') {
        // 字符串数组 → 对象数组
        const trimmed = item.trim();
        if (trimmed.length > 0) {
          normalized.push({ value: trimmed });
        }
      } else if (item && typeof item === 'object') {
        // 对象项
        if (typeof item.value === 'string' && item.value.trim().length > 0) {
          // 正确格式
          normalized.push({ value: item.value.trim() });
        } else if (typeof item.label === 'string' && item.label.trim().length > 0) {
          // 错误key: label → value
          console.warn(`[先决条件] 修正格式：{label: "${item.label}"} → {value: "${item.label}"}`);
          normalized.push({ value: item.label.trim() });
        } else if (typeof item.name === 'string' && item.name.trim().length > 0) {
          // 错误key: name → value
          console.warn(`[先决条件] 修正格式：{name: "${item.name}"} → {value: "${item.name}"}`);
          normalized.push({ value: item.name.trim() });
        } else {
          // 空对象或无法识别的结构，跳过
          console.warn(`[先决条件] 过滤无效项:`, JSON.stringify(item));
        }
      }
    }

    if (rawPrereqs.length > 0 && normalized.length !== rawPrereqs.length) {
      console.log(`[先决条件] 标准化: ${rawPrereqs.length}项 → ${normalized.length}项有效`);
    }

    return normalized;
  }

  /**
   * 构建标准的PF2e神龛专长格式
   */
  private buildShrineFeatureFormat(args: any): any {
    const featName = args.name || '神圣专长';
    const description = this.validateAndExtractDescription(args, featName);
    
    const result: any = {
      name: featName,
      type: "feat",
      img: args.img || "icons/sundries/books/book-red-exclamation.webp",
      system: {
          description: description,
        rules: Array.isArray(args.system?.rules) ? args.system.rules : [],
        slug: null,
          traits: {
          value: Array.isArray(args.system?.traits?.value) ? args.system.traits.value : [],
          rarity: args.system?.traits?.rarity || "common",
          otherTags: Array.isArray(args.system?.traits?.otherTags) ? args.system.traits.otherTags : []
        },
        level: {
          value: args.system?.level?.value || args.level || 1
        },
        category: "general", // 临时默认值，会在 generateFeatDirect 中被正确的 category 覆盖
        onlyLevel1: args.system?.onlyLevel1 || false,
        maxTakable: args.system?.maxTakable || 1,
          actionType: {
          value: args.system?.actionType?.value || args.actionType || "passive"
          },
          actions: {
          value: args.system?.actions?.value || args.actions || null
        },
        prerequisites: {
          value: this.normalizePrerequisites(args.system?.prerequisites?.value)
        },
        location: null
      },
      effects: Array.isArray(args.effects) ? args.effects : [],
      folder: null,
      flags: args.flags || {}
    };

    // 处理频率
    if (args.system?.frequency || args.frequency) {
      const freq = args.system?.frequency || args.frequency;
      result.system.frequency = {
        max: freq.max || 1,
        per: freq.per || 'day'
      };

      // 验证频率值 - 支持简单格式和ISO 8601格式
      // 简单格式: turn, round, minute, hour, day, week, month, year
      // ISO 8601格式: PT1M (1分钟), PT10M (10分钟), PT1H (1小时), P1W (1周), P1M (1月)
      const validFrequencyPers = [
        'turn', 'round', 'minute', 'hour', 'day', 'week', 'month', 'year',
        'PT1M', 'PT10M', 'PT1H', 'P1W', 'P1M'
      ];
      if (result.system.frequency.per && !validFrequencyPers.includes(result.system.frequency.per)) {
        console.warn(`无效的frequency.per值: ${result.system.frequency.per}，将其改为'PT10M'`);
        result.system.frequency.per = 'PT10M';
      }
    }

    // 🔴 验证：检查动作类型与触发条件的一致性（记录但不强制修改）
    // 现在在设计阶段就应该确保正确，这里只是记录日志
    this.validateActionTypeTriggerConsistency(result);

    // 特征清理：只移除明显无效的特征值（空值、非字符串），但保留所有有效的特征名
    // 让Foundry VTT在导入时进行最终验证，而不是预先过滤
    // 注意：attack, press, fortune, flourish, stance, manipulate 等都是有效的PF2e特征
    const originalTraits = result.system.traits.value || [];
    result.system.traits.value = originalTraits.filter((trait: string) => {
      // 只过滤掉明显无效的值
      if (!trait || typeof trait !== 'string') {
        console.warn(`移除无效特征（非字符串或空值）: ${JSON.stringify(trait)}`);
        return false;
      }
      // 移除空白字符串
      const trimmed = trait.trim();
      if (trimmed.length === 0) {
        console.warn(`移除无效特征（空字符串）`);
        return false;
      }
      // 保留所有非空的字符串特征，让Foundry系统进行验证
      return true;
    });
    
    // 如果traits为空数组，尝试从args中提取
    if (result.system.traits.value.length === 0 && args.traits && Array.isArray(args.traits)) {
      result.system.traits.value = args.traits.filter((t: any) => t && typeof t === 'string' && t.trim().length > 0);
      console.log(`从args.traits补充特征: [${result.system.traits.value.join(', ')}]`);
    }
    
    console.log(`特征清理: 原始 [${originalTraits.join(', ')}] -> 清理后 [${result.system.traits.value.join(', ')}]`);

    // 删除可能导致问题的字段，让Foundry自动生成
    if ('_id' in result) {
      delete (result as any)._id;
    }
    
    // 删除可能导致验证错误的_stats字段
    if ('_stats' in result) {
      delete (result as any)._stats;
    }

    return result;
  }

  /**
   * 验证动作类型与触发条件的一致性（仅记录，不修改）
   * 核心规则：如果描述中包含"触发"或"Trigger"，动作类型应该是reaction或free
   */
  private validateActionTypeTriggerConsistency(feat: any): void {
    let descriptionValue = feat.system?.description?.value || '';
    const actionTypeValue = feat.system?.actionType?.value || 'passive';
    const actionsValue = feat.system?.actions?.value;
    const featName = feat.name || '未命名专长';
    
    // 检查描述中是否包含触发关键词
    const hasTrigger = /<strong>\s*触发\s*<\/strong>/i.test(descriptionValue) || 
                      /<strong>\s*Trigger\s*<\/strong>/i.test(descriptionValue) ||
                      /触发[:：]/i.test(descriptionValue) ||
                      /Trigger:/i.test(descriptionValue);
    
    if (hasTrigger) {
      console.log(`[动作类型验证] 专长"${featName}"包含触发条件`);
      
      // 如果有触发条件，但动作类型不是reaction或free，记录错误并自动修正
      if (actionTypeValue !== 'reaction' && actionTypeValue !== 'free') {
        console.error(`[动作类型验证] ❌❌❌ 严重错误：专长"${featName}"包含触发条件，但动作类型是"${actionTypeValue}"`);
        console.error(`[动作类型验证] 这表明AI没有遵循设计流程！`);
        console.error(`[动作类型验证] 专长描述: ${descriptionValue.substring(0, 200)}...`);
        console.error(`[动作类型验证] 动作类型应该是: reaction 或 free，实际是: ${actionTypeValue}`);
        
        // 🔧 自动修正：移除错误的触发词条
        console.warn(`[动作类型验证] 🔧 自动修正：移除不应该存在的触发词条`);
        
        // 移除<p><strong>触发</strong>...</p>段落
        descriptionValue = descriptionValue
          .replace(/<p>\s*<strong>\s*触发\s*<\/strong>[^<]*<\/p>/gi, '')
          .replace(/<p>\s*<strong>\s*Trigger\s*<\/strong>[^<]*<\/p>/gi, '')
          // 移除孤立的<hr />（触发后的分隔线）
          .replace(/^\s*<hr\s*\/>\s*/gim, '')
          // 清理多余的空白段落
          .replace(/<p>\s*<\/p>/g, '')
          .trim();
        
        // 更新到feat对象
        if (typeof feat.system?.description === 'object') {
          feat.system.description.value = descriptionValue;
        }
        
        console.log(`[动作类型验证] ✅ 已自动移除触发词条，修正后的描述: ${descriptionValue.substring(0, 150)}...`);
      } else {
        console.log(`[动作类型验证] ✅ 验证通过：专长"${featName}"的动作类型"${actionTypeValue}"与触发条件一致`);
      }
    } else {
      // 如果没有触发条件，但是动作类型是reaction或free，也记录警告
      if (actionTypeValue === 'reaction' || actionTypeValue === 'free') {
        console.warn(`[动作类型验证] ⚠️ 警告：专长"${featName}"的动作类型是"${actionTypeValue}"，但描述中未找到明确的触发条件`);
        console.warn(`[动作类型验证] 建议：reaction和free动作应该在描述中明确写出触发条件`);
      } else {
        console.log(`[动作类型验证] ✅ 验证通过：专长"${featName}"无触发条件，动作类型为"${actionTypeValue}"`);
      }
    }
  }

  /**
   * 验证专长类别是否有效
   */
  private validateFeatCategory(category: any): "general" | "skill" | "ancestry" | "class" | "bonus" | null {
    const validCategories = ["general", "skill", "ancestry", "class", "bonus"];
    
    if (typeof category === "string" && validCategories.includes(category)) {
      return category as "general" | "skill" | "ancestry" | "class" | "bonus";
    }
    
    // 类别映射：将无效的类别映射到有效的类别
    const categoryMap: Record<string, "general" | "skill" | "ancestry" | "class" | "bonus"> = {
      "archetype": "general", // 原型专长映射为通用专长
      "combat": "general",    // 战斗专长映射为通用专长
      "feat": "general"       // 通用映射
    };
    
    if (typeof category === "string" && categoryMap[category]) {
      console.log(`专长类别"${category}"已映射为"${categoryMap[category]}"`);
      return categoryMap[category];
    }
    
    return null;
  }

  /**
   * 修复常见的JSON错误
   */
  private fixCommonJsonErrors(jsonStr: string): string {
    let fixed = this.cleanJsonString(jsonStr);
    
    // 修复未引用的属性名
    fixed = fixed.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
    
    // 修复尾随逗号
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // 修复多个逗号
    fixed = fixed.replace(/,(\s*,)/g, '$1');
    
    // 修复缺少逗号的属性
    fixed = fixed.replace(/"\s*\n\s*"/g, '",\n"');
    
    // 修复单引号
    fixed = fixed.replace(/'/g, '"');
    
    return fixed;
  }

  /**
   * 清理JSON字符串
   */
  private cleanJsonString(jsonStr: string): string {
    return jsonStr
      .replace(/^\s*```(?:json|javascript)?\s*/, '') // 移除开头的代码块标记
      .replace(/\s*```\s*$/, '') // 移除结尾的代码块标记
      .replace(/^\s*return\s+/, '') // 移除return语句
      .replace(/;?\s*$/, '') // 移除结尾的分号
      .replace(/[\x00-\x1F\x7F]/g, '') // 移除控制字符
      .replace(/\n\s*/g, ' ') // 将换行和多余空格替换为单个空格
      .trim();
  }

  /**
   * 清理和修复专长数据，移除可能导致验证失败的无效值
   */
  private sanitizeFeatData(feat: any): any {
    const sanitized = JSON.parse(JSON.stringify(feat)); // 深拷贝
    
    // 清理特征值
    if (sanitized.system?.traits?.value) {
      const validTraits = [
        // 专长类别
        'general', 'skill', 'combat', 'spellcasting', 'archetype', 'class', 'ancestry',
        // 职业名称
        'fighter', 'wizard', 'cleric', 'rogue', 'ranger', 'barbarian', 'bard', 'druid', 
        'monk', 'paladin', 'sorcerer', 'warlock', 'alchemist', 'champion', 'gunslinger',
        'inventor', 'investigator', 'kineticist', 'magus', 'oracle', 'psychic', 'summoner',
        'swashbuckler', 'thaumaturge', 'witch',
        // 种族名称
        'human', 'elf', 'dwarf', 'halfling', 'gnome', 'goblin', 'orc', 'catfolk', 'kobold', 
        'leshy', 'lizardfolk', 'ratfolk', 'tengu',
        // 稀有度
        'uncommon', 'rare', 'unique',
        // 动作特征（Action Traits） - 这些是有效的PF2e特征，不应被过滤
        'manipulate', 'concentrate', 'attack', 'press', 'flourish', 'stance', 'open', 
        'move', 'secret', 'exploration', 'downtime', 'fortune', 'misfortune', 'auditory',
        'visual', 'emotion', 'mental', 'linguistic', 'incapacitation', 'polymorph', 'morph',
        'death', 'disease', 'poison', 'curse', 'healing', 'necromancy', 'possession',
        // 伤害类型和能量类型
        'acid', 'cold', 'electricity', 'fire', 'sonic', 'positive', 'negative', 'force',
        'mental', 'poison', 'bleed',
        // 魔法学派
        'abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion',
        'necromancy', 'transmutation',
        // 其他常见特征
        'detection', 'scrying', 'light', 'darkness', 'teleportation', 'summoning'
      ];
      
      const originalTraits = sanitized.system.traits.value;
      sanitized.system.traits.value = originalTraits.filter((trait: string) => {
        if (!trait || typeof trait !== 'string') return false;
        const normalizedTrait = trait.toLowerCase().trim();
        return validTraits.includes(normalizedTrait);
      });
      
      console.log(`特征清理: [${originalTraits.join(', ')}] -> [${sanitized.system.traits.value.join(', ')}]`);
    }
    
    // 清理频率值 - 支持简单格式和ISO 8601格式
    if (sanitized.system?.frequency?.per) {
      const validFrequencyPers = [
        'turn', 'round', 'minute', 'hour', 'day', 'week', 'month', 'year',
        'PT1M', 'PT10M', 'PT1H', 'P1W', 'P1M'
      ];
      if (!validFrequencyPers.includes(sanitized.system.frequency.per)) {
        console.warn(`修复无效频率: ${sanitized.system.frequency.per} -> PT10M`);
        sanitized.system.frequency.per = 'PT10M';
      }
    }
    
    // 清理动作类型
    if (sanitized.system?.actionType?.value) {
      const validActionTypes = ['action', 'reaction', 'free', 'passive'];
      if (!validActionTypes.includes(sanitized.system.actionType.value)) {
        console.warn(`修复无效动作类型: ${sanitized.system.actionType.value} -> passive`);
        sanitized.system.actionType.value = 'passive';
      }
    }
    
    // 清理专长类别
    if (sanitized.system?.category) {
      const validCategories = ['general', 'skill', 'ancestry', 'class', 'bonus'];
      if (!validCategories.includes(sanitized.system.category)) {
        console.warn(`修复无效专长类别: ${sanitized.system.category} -> general`);
        sanitized.system.category = 'general';
      }
    }
    
    // 移除可能导致问题的字段
    delete sanitized._id;
    delete sanitized._stats;
    
    return sanitized;
  }

  /**
   * 获取类别显示名称
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
   * 提取不同类型材料的信息
   */
  private extractFragmentMaterial(item: any): ShrineSynthesisMaterial {
    const hiddenPrompt = FragmentGeneratorService.extractHiddenPrompt(item);
    return {
      id: item.id || item._id,
      name: item.name,
      type: 'fragment',
      hiddenPrompt: hiddenPrompt || '',
      description: this.extractItemDescription(item),
      rarity: item.system?.traits?.rarity || 'common',
      img: item.img, // 保留原始物品图标
      originalItem: item // 保留原始物品引用
    };
  }

  private extractDivinityMaterial(item: any): ShrineSynthesisMaterial {
    // 首先从标准的GM描述字段获取隐藏提示词
    let hiddenPrompt = item.system?.description?.gm || '';
    
    // 如果GM描述为空，回退到flags（兼容旧数据）
    if (!hiddenPrompt.trim()) {
      hiddenPrompt = item.flags?.['ai-pf2e-assistant']?.hiddenPrompt || '';
    }
    
    // 最后尝试从描述的secret section中提取
    if (!hiddenPrompt.trim()) {
      const description = item.system?.description?.value || '';
      const secretMatch = description.match(/<section[^>]*class=["']secret["'][^>]*>(.*?)<\/section>/s);
      if (secretMatch) {
        // 从secret section中提取AI提示词内容
        const aiPromptMatch = secretMatch[1].match(/<p>(.*?)<\/p>/s);
        if (aiPromptMatch) {
          hiddenPrompt = this.extractTextFromHtml(aiPromptMatch[1]);
        }
      }
    }
    
    // 解析等效等级配置（用于提升数值强度）
    // 支持绝对值（如"5"）或相对值（如"+2"、"+3"）
    let effectiveLevel: string | undefined = undefined;
    const cleanText = this.extractTextFromHtml(hiddenPrompt);
    const effectiveLevelMatch = cleanText.match(/EFFECTIVE_LEVEL:\s*([+\-]?\d+)/i);
    if (effectiveLevelMatch) {
      effectiveLevel = effectiveLevelMatch[1];
      console.log(`神性 "${item.name}" 设置了等效等级: ${effectiveLevel}`);
    }
    
    console.log(`提取神性材料 "${item.name}":`, {
      hasGmDescription: !!(item.system?.description?.gm),
      hasFlags: !!item.flags?.['ai-pf2e-assistant']?.hiddenPrompt,
      extractedPrompt: hiddenPrompt.substring(0, 100) + '...',
      deity: item.flags?.['ai-pf2e-assistant']?.deity,
      effectiveLevel: effectiveLevel
    });
    
    return {
      id: item.id || item._id,
      name: item.name,
      type: 'divinity',
      hiddenPrompt: hiddenPrompt,
      description: this.extractItemDescription(item),
      rarity: item.system?.traits?.rarity || 'common',
      deity: item.flags?.['ai-pf2e-assistant']?.deity,
      aspect: item.flags?.['ai-pf2e-assistant']?.aspect,
      effectiveLevel: effectiveLevel, // 添加等效等级
      img: item.img, // 保留原始物品图标
      originalItem: item // 保留原始物品引用
    };
  }

  private extractOfferingMaterial(item: any): ShrineSynthesisMaterial {
    // 对于贡品（专长），优先从GM描述获取隐藏提示词
    let hiddenPrompt = item.system?.description?.gm || '';
    
    // 如果GM描述为空，回退到flags（兼容旧数据）
    if (!hiddenPrompt.trim()) {
      hiddenPrompt = item.flags?.['ai-pf2e-assistant']?.hiddenPrompt || '';
    }
    
    // 提取贡品的子类型信息
    let offeringCategory: string | undefined = undefined;
    let offeringFeatType: string | undefined = undefined;
    let offeringItemType: string | undefined = undefined;
    
    // 如果是专长类型的贡品
    if (item.type === 'feat') {
      // 提取专长类别（如'class', 'skill', 'general'等）
      offeringCategory = item.system?.category;
      // 提取职业专长的featType（如'fighter', 'wizard'等）
      offeringFeatType = item.system?.traits?.value?.find((t: string) => 
        ['fighter', 'wizard', 'rogue', 'cleric', 'ranger', 'barbarian', 'bard', 
         'druid', 'monk', 'champion', 'sorcerer', 'alchemist'].includes(t.toLowerCase())
      );
      console.log(`贡品"${item.name}"的子类型: category=${offeringCategory}, featType=${offeringFeatType}`);
    }
    // 如果是装备类型的贡品
    else if (['equipment', 'weapon', 'armor', 'consumable'].includes(item.type)) {
      offeringItemType = item.type;
      console.log(`贡品"${item.name}"的物品类型: ${offeringItemType}`);
    }
    
    return {
      id: item.id || item._id,
      name: item.name,
      type: 'offering',
      hiddenPrompt: hiddenPrompt,
      description: this.extractItemDescription(item),
      rarity: item.system?.traits?.rarity || 'common',
      originalFeatData: item.flags?.['ai-pf2e-assistant']?.originalFeatData,
      img: item.img, // 保留原始物品图标
      originalItem: item, // 保留原始物品引用
      offeringCategory,
      offeringFeatType,
      offeringItemType
    };
  }

  private extractShrineMaterial(item: any): ShrineSynthesisMaterial {
    // 首先从标准的GM描述字段获取神龛配置
    let hiddenPrompt = item.system?.description?.gm || '';
    
    // 如果GM描述为空，回退到flags（兼容旧数据）
    if (!hiddenPrompt.trim()) {
      hiddenPrompt = item.flags?.['ai-pf2e-assistant']?.hiddenPrompt || '';
    }
    
    // 解析神龛的等效等级配置（用于全局提升数值强度）
    // 支持绝对值（如"5"）或相对值（如"+2"、"+3"）
    let effectiveLevel: string | undefined = undefined;
    const cleanText = this.extractTextFromHtml(hiddenPrompt);
    const effectiveLevelMatch = cleanText.match(/EFFECTIVE_LEVEL:\s*([+\-]?\d+)/i);
    if (effectiveLevelMatch) {
      effectiveLevel = effectiveLevelMatch[1];
      console.log(`神龛 "${item.name}" 设置了等效等级: ${effectiveLevel}`);
    }
    
    console.log('提取神龛材料:', item.name, {
      hasEffectiveLevel: !!effectiveLevel,
      effectiveLevel: effectiveLevel
    });
    console.log('使用的配置文本:', hiddenPrompt.substring(0, 100) + '...');
    
    return {
      id: item.id || item._id,
      name: item.name,
      type: 'shrine',
      hiddenPrompt: hiddenPrompt,
      description: this.extractItemDescription(item),
      rarity: item.system?.traits?.rarity || 'common',
      deity: item.flags?.['ai-pf2e-assistant']?.deity,
      synthesisRequirements: item.flags?.['ai-pf2e-assistant']?.synthesisRequirements,
      effectiveLevel: effectiveLevel, // 添加神龛的等效等级
      img: item.img, // 保留原始物品图标
      originalItem: item // 保留原始物品引用
    };
  }

  private extractOtherMaterial(item: any): ShrineSynthesisMaterial {
    return {
      id: item.id || item._id,
      name: item.name,
      type: 'offering', // 默认当作贡品处理
      description: this.extractItemDescription(item),
      rarity: item.system?.traits?.rarity || 'common',
      img: item.img, // 保留原始物品图标
      originalItem: item // 保留原始物品引用
    };
  }

  /**
   * 提取物品描述
   */
  private extractItemDescription(item: any): string {
    const description = item.system?.description?.value || '';
    const textContent = description.replace(/<[^>]*>/g, '').trim();
    const cleanDescription = textContent.replace(/AI提示词内容[\s\S]*$/, '').trim();
    return cleanDescription || item.name || '神秘的物品';
  }

  /**
   * 从游戏compendium获取职业在该等级的专长示例供AI参考
   * @param className 职业名称
   * @param level 专长等级
   * @param category 专长类别
   * @returns 专长示例的JSON字符串
   */
  private async getClassFeatExamples(className: string, level: number, category: string): Promise<string> {
    try {
      const game = (window as any).game;
      if (!game?.packs) {
        console.warn('游戏数据未加载');
        return '';
      }

      // 获取专长compendium
      const featPacks = game.packs.filter((pack: any) => 
        pack.documentName === 'Item' && pack.metadata.type === 'Item'
      );

      const examples: any[] = [];
      const targetCount = 3; // 获取3个示例专长

      // 遍历专长包查找匹配的专长
      for (const pack of featPacks) {
        if (examples.length >= targetCount) break;

        try {
          const index = await pack.getIndex({ fields: ['system.level.value', 'system.category', 'system.traits.value', 'type'] });
          
          for (const entry of index) {
            if (examples.length >= targetCount) break;
            
            // 筛选条件：类型为feat，等级匹配，类别匹配，包含职业trait
            if (entry.type === 'feat' && 
                entry.system?.level?.value === level &&
                entry.system?.category === category &&
                entry.system?.traits?.value?.includes(className.toLowerCase())) {
              
              // 加载完整专长数据
              const feat = await pack.getDocument(entry._id);
              if (feat) {
                examples.push({
                  name: feat.name,
                  level: feat.system?.level?.value,
                  category: feat.system?.category,
                  actionType: feat.system?.actionType?.value,
                  actions: feat.system?.actions?.value,
                  traits: feat.system?.traits?.value || [],
                  frequency: feat.system?.frequency,
                  prerequisites: feat.system?.prerequisites?.value || [],
                  description: (feat.system?.description?.value || '').substring(0, 300) + '...' // 截取前300字符
                });
              }
            }
          }
        } catch (packError) {
          console.warn(`读取专长包 ${pack.metadata.label} 失败:`, packError);
          continue;
        }
      }

      if (examples.length > 0) {
        return `\n\n【${className}职业${level}级专长参考示例】\n以下是${examples.length}个官方${className}职业${level}级专长示例，供参考风格和平衡性：\n${JSON.stringify(examples, null, 2)}`;
      }
      
      return '';
    } catch (error) {
      console.warn('获取职业专长示例失败:', error);
      return '';
    }
  }

  /**
   * 获取角色卡信息（作为JSON上下文传递给AI）
   */
  private getActorContext(actor: any): string {
    if (!actor) return '';

    try {
      const actorData = {
        name: actor.name,
        level: actor.system?.details?.level?.value || actor.level,
        class: actor.system?.details?.class?.name || actor.class,
        ancestry: actor.system?.details?.ancestry?.name,
        heritage: actor.system?.details?.heritage?.name,
        background: actor.system?.details?.background?.name,
        abilities: {
          str: actor.system?.abilities?.str?.value,
          dex: actor.system?.abilities?.dex?.value,
          con: actor.system?.abilities?.con?.value,
          int: actor.system?.abilities?.int?.value,
          wis: actor.system?.abilities?.wis?.value,
          cha: actor.system?.abilities?.cha?.value
        },
        skills: actor.system?.skills ? Object.keys(actor.system.skills).map(skill => ({
          name: skill,
          rank: actor.system.skills[skill].rank,
          value: actor.system.skills[skill].value
        })) : [],
        feats: actor.items?.filter((item: any) => item.type === 'feat')?.map((feat: any) => ({
          name: feat.name,
          level: feat.system?.level?.value,
          category: feat.system?.category
        })) || [],
        equipment: actor.items?.filter((item: any) => item.type === 'equipment')?.map((item: any) => ({
          name: item.name,
          type: item.system?.category
        })) || []
      };

      return `\n\n【角色信息参考】\n${JSON.stringify(actorData, null, 2)}`;
    } catch (error) {
      console.error('获取角色信息失败:', error);
      return '';
    }
  }

  /**
   * 计算等效等级
   * @param effectiveLevelConfig 等效等级配置（如 "5" 或 "+2"）
   * @param baseLevel 基础等级
   * @returns 计算后的等效等级
   */
  private calculateEffectiveLevel(effectiveLevelConfig: string, baseLevel: number): number {
    if (effectiveLevelConfig.startsWith('+')) {
      // 相对值：基础等级 + 修正值
      const modifier = parseInt(effectiveLevelConfig.substring(1));
      return baseLevel + modifier;
    } else if (effectiveLevelConfig.startsWith('-')) {
      // 相对值：基础等级 - 修正值
      const modifier = parseInt(effectiveLevelConfig.substring(1));
      return Math.max(1, baseLevel - modifier);
    } else {
      // 绝对值：直接使用指定的等级
      return parseInt(effectiveLevelConfig);
    }
  }

  /**
   * 计算叠加的等效等级（神龛 + 神性）
   * @param baseLevel 基础等级
   * @param shrineLevel 神龛的等效等级配置
   * @param divinityLevel 神性的等效等级配置
   * @returns 最终的等效等级
   */
  private calculateStackedEffectiveLevel(
    baseLevel: number,
    shrineLevel?: string,
    divinityLevel?: string
  ): number {
    let finalLevel = baseLevel;
    
    // 先应用神龛的等效等级
    if (shrineLevel) {
      finalLevel = this.calculateEffectiveLevel(shrineLevel, finalLevel);
    }
    
    // 再应用神性的等效等级（如果是相对值，基于神龛调整后的等级）
    if (divinityLevel) {
      if (divinityLevel.startsWith('+') || divinityLevel.startsWith('-')) {
        // 相对值：叠加在已调整的等级上
        finalLevel = this.calculateEffectiveLevel(divinityLevel, finalLevel);
      } else {
        // 绝对值：如果神性使用绝对值，优先使用较高的那个
        const divinityAbsolute = parseInt(divinityLevel);
        finalLevel = Math.max(finalLevel, divinityAbsolute);
      }
    }
    
    return finalLevel;
  }

  /**
   * 解析 USE_RULES_KNOWLEDGE 配置，包含拼写容错
   * T开头/yes/1 → true，F开头/no/0 → false
   * @param shrineItem 神龛材料
   * @param stageName 阶段名称（用于日志）
   * @returns 是否启用规则知识库
   */
  private parseUseRulesKnowledge(shrineItem: ShrineSynthesisMaterial, stageName: string): boolean {
    const rawConfigText = shrineItem.hiddenPrompt || shrineItem.originalItem?.system?.description?.gm || '';
    const configText = this.extractTextFromHtml(rawConfigText);
    
    const match = configText.match(/USE_RULES_KNOWLEDGE:\s*(\S+)/i);
    if (!match) {
      console.log(`[${stageName}] 未配置 USE_RULES_KNOWLEDGE`);
      return false;
    }
    
    const rawValue = match[1].toLowerCase();
    const firstChar = rawValue.charAt(0);
    
    // T开头 或 yes 或 1 → true
    if (firstChar === 't' || rawValue === 'yes' || rawValue === '1') {
      if (rawValue !== 'true') {
        console.warn(`[${stageName}] USE_RULES_KNOWLEDGE: "${match[1]}" → 识别为 true（建议修正拼写为 "true"）`);
      } else {
        console.log(`[${stageName}] USE_RULES_KNOWLEDGE: true`);
      }
      return true;
    }
    
    // F开头 或 no 或 0 → false
    if (firstChar === 'f' || rawValue === 'no' || rawValue === '0') {
      if (rawValue !== 'false') {
        console.warn(`[${stageName}] USE_RULES_KNOWLEDGE: "${match[1]}" → 识别为 false（建议修正拼写为 "false"）`);
      } else {
        console.log(`[${stageName}] USE_RULES_KNOWLEDGE: false`);
      }
      return false;
    }
    
    console.warn(`[${stageName}] ⚠️ USE_RULES_KNOWLEDGE 值无法识别: "${match[1]}"，T开头=启用, F开头=关闭`);
    return false;
  }

  /**
   * 检查神龛是否启用角色信息传递
   */
  private shouldIncludeActorContext(shrineItem: any): boolean {
    try {
      // 首先从标准的GM描述字段获取配置
      let configText = shrineItem?.system?.description?.gm || '';
      
      // 如果GM描述中没有找到，回退到flags（兼容旧数据）
      if (!configText.includes('INCLUDE_ACTOR_CONTEXT')) {
        configText = shrineItem?.flags?.['ai-pf2e-assistant']?.hiddenPrompt || '';
      }
      
      const cleanPrompt = this.extractTextFromHtml(configText);
      return /INCLUDE_ACTOR_CONTEXT:\s*true/i.test(cleanPrompt);
    } catch (error) {
      return false;
    }
  }

  /**
   * 检查系统是否启用图标生成
   */
  private shouldGenerateIcon(): boolean {
    try {
      const game = (window as any).game;
      return game.settings.get('ai-pf2e-assistant', 'enableIconGeneration') || false;
    } catch (error) {
      console.warn('获取图标生成设置失败:', error);
      return false;
    }
  }

  /**
   * 分析专长平衡性
   */
}
