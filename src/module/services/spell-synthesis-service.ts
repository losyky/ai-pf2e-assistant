import { AIService } from './ai-service';
import { ShrineItemService } from './shrine-item-service';
import { FragmentGeneratorService } from './fragment-generator-service';
import { ShrinePointService } from './shrine-point-service';
import { BalanceDataService } from './balance-data-service';
import { PF2eMechanicsKnowledgeService } from './pf2e-mechanics-knowledge';
import {
  SPELL_DESIGN_GUIDANCE,
  DESCRIPTION_PRINCIPLE,
  PF2E_FORMAT_STANDARD,
  TECHNICAL_REQUIREMENTS
} from './prompt-templates';

/**
 * 法术合成材料接口（与神龛合成材料相同结构）
 */
export interface SpellSynthesisMaterial {
  id: string;
  name: string;
  type: 'fragment' | 'divinity' | 'offering' | 'shrine';
  hiddenPrompt?: string;
  description: string;
  rarity?: string;
  deity?: string;
  aspect?: string;
  effectiveLevel?: string; // 神性的等效等级，支持绝对值（如"5"）或相对值（如"+2"、"+3"）
  originalSpellData?: any;  // 法术贡品专用
  synthesisRequirements?: any;
  img?: string;
  originalItem?: any;
}

/**
 * 法术合成配置接口
 */
export interface SpellSynthesisConfig {
  rank: number;  // 法术环级 (0-10)
  traditions: string[];  // 施法传统 ['arcane', 'divine', 'primal', 'occult']
  actorData?: any;
  shrineItem: SpellSynthesisMaterial;
  isCantrip?: boolean;  // 是否为戏法（可选，用于明确指定）
  requiredTraits?: string[]; // 合成后必定携带的特征
}

/**
 * 法术合成结果接口
 */
export interface SpellSynthesisResult {
  spell: PF2eSpellFormat;
  usedMaterials: SpellSynthesisMaterial[];
  balanceAnalysis: string;
  iconPrompt?: string;
}

/**
 * PF2e法术格式接口
 */
export interface PF2eSpellFormat {
  name: string;
  type: 'spell';
  img: string;
  system: {
    description: {
      value: string;
      gm?: string;
    };
    level: {
      value: number;  // 0-10
    };
    traits: {
      traditions: string[];  // ['arcane', 'divine', 'primal', 'occult']
      value: string[];
      rarity: 'common' | 'uncommon' | 'rare' | 'unique';
    };
    area?: {
      type: string;  // 'burst', 'cone', 'emanation', 'line', etc.
      value: number;
    };
    range?: {
      value: string;  // '30 feet', 'touch', etc.
    };
    time: {
      value: string;  // '2', '3', '1 minute', etc.
    };
    duration?: {
      sustained: boolean;
      value: string;
    };
    damage?: {
      [key: string]: {
        applyMod?: boolean;
        category?: string | null;
        formula?: string;
        kinds?: string[];
        materials?: any[];
        type?: string;
      };
    };
    defense?: {
      save?: {
        basic: boolean;
        statistic: string;  // 'reflex', 'fortitude', 'will'
      };
    } | null;
    heightening?: {
      type?: string;  // 'interval', 'fixed'
      interval?: number;
      levels?: { [level: number]: any };
      damage?: { [key: string]: string };
      area?: number;
    };
    cost?: {
      value: string;
    };
    requirements?: string;
    target?: {
      value: string;
    };
    counteraction?: boolean;
    rules?: any[];
  };
}

/**
 * 法术生成的Function Calling Schema
 */
const SPELL_GENERATION_SCHEMA = {
  name: "generateSpell",
  description: "生成一个完整的PF2e法术，包含所有必需字段",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "法术名称"
      },
      type: {
        type: "string",
        enum: ["spell"],
        description: "物品类型，必须是spell"
      },
      img: {
        type: "string",
        description: "法术图标路径，可以留空使用默认图标"
      },
      system: {
        type: "object",
        properties: {
          description: {
            type: "object",
            properties: {
              value: {
                type: "string",
                description: "法术的完整HTML格式描述，必须包含所有效果、目标、持续时间等信息。这是最重要的字段，不能为空！",
                minLength: 100
              }
            },
            required: ["value"]
          },
          level: {
            type: "object",
            properties: {
              value: {
                type: "number",
                minimum: 1,
                maximum: 10,
                description: "法术环级（1-10）。注意：在PF2e中，戏法的环级也是1，通过traits中的'cantrip'特征标记区分。"
              }
            },
            required: ["value"]
          },
          traits: {
            type: "object",
            properties: {
              traditions: {
                type: "array",
                items: {
                  type: "string",
                  enum: ["arcane", "divine", "primal", "occult"]
                },
                description: "施法传统，必须包含至少一个"
              },
              value: {
                type: "array",
                items: { type: "string" },
                description: "法术特征标签。【戏法重要】如果是戏法，必须包含'cantrip'特征！普通法术不应包含此特征。"
              },
              rarity: {
                type: "string",
                enum: ["common", "uncommon", "rare", "unique"],
                description: "稀有度"
              }
            },
            required: ["traditions"]
          },
          area: {
            type: "object",
            properties: {
              type: {
                type: "string",
                description: "区域类型：burst(爆发)、cone(锥形)、emanation(emanation)、line(线形)等"
              },
              value: {
                type: "number",
                description: "区域数值（尺）"
              }
            },
            description: "法术影响区域（如果有范围AOE）"
          },
          range: {
            type: "object",
            properties: {
              value: {
                type: "string",
                description: "施法距离，如'30 feet'、'touch'、'120 feet'等"
              }
            },
            description: "施法距离"
          },
          time: {
            type: "object",
            properties: {
              value: {
                type: "string",
                description: "施法时间：'2'(2动作)、'3'(3动作)、'1 minute'、'reaction'等"
              }
            },
            required: ["value"]
          },
          duration: {
            type: "object",
            properties: {
              sustained: {
                type: "boolean",
                description: "是否需要维持"
              },
              value: {
                type: "string",
                description: "持续时间，如'1 minute'、'10 minutes'、''(瞬发)等"
              }
            },
            description: "法术持续时间"
          },
          damage: {
            type: "object",
            description: "伤害数据，键为数字索引（'0', '1'等），值为伤害对象。【重要】仅当法术造成伤害时才填写此字段，如果法术是buff、控制、治疗、传送等非伤害效果，不要添加此字段！",
            additionalProperties: {
              type: "object",
              properties: {
                formula: { type: "string", description: "伤害公式，如'2d6'、'4d10+4'" },
                type: { type: "string", description: "伤害类型：fire、cold、acid、electricity等" },
                kinds: { type: "array", items: { type: "string" }, description: "伤害种类数组" },
                applyMod: { type: "boolean", description: "是否应用调整值" }
              }
            }
          },
          defense: {
            type: ["object", "null"],
            properties: {
              save: {
                type: "object",
                properties: {
                  basic: { type: "boolean", description: "是否为基础豁免" },
                  statistic: {
                    type: "string",
                    enum: ["reflex", "fortitude", "will"],
                    description: "豁免类型"
                  }
                }
              }
            },
            description: "防御/豁免检定"
          },
          heightening: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["interval", "fixed"],
                description: "升环类型：interval(间隔)或fixed(固定)。"
              },
              interval: {
                type: "number",
                description: "升环间隔（戏法通常为1或2，即每级或每2级增强）"
              },
              damage: {
                type: "object",
                description: "升环伤害增加，如{'0': '1d4'}表示伤害骰子每次升环增加1d4",
                additionalProperties: { type: "string" }
              }
            },
            description: "升环效果。【戏法必须包含】戏法必须设置此字段以实现自动升环（type:'interval', interval:1或2, damage:如有伤害）。【普通法术可选】普通法术仅当有升环效果时才填写此字段。"
          },
          target: {
            type: "object",
            properties: {
              value: {
                type: "string",
                description: "目标描述，如'1 creature'、'up to 5 creatures'等"
              }
            },
            description: "法术目标"
          },
          cost: {
            type: "object",
            properties: {
              value: {
                type: "string",
                description: "施法材料消耗"
              }
            },
            description: "施法成本"
          },
          requirements: {
            type: "string",
            description: "施法要求"
          },
          counteraction: {
            type: "boolean",
            description: "是否为反制法术"
          }
        },
        required: ["description", "level", "traits", "time"]
      }
    },
    required: ["name", "type", "system"]
  }
};

/**
 * 法术合成服务
 * 基于神龛系统，使用神明力量合成法术
 */
export class SpellSynthesisService {
  private aiService: AIService;
  private balanceService: BalanceDataService;

  constructor(aiService: AIService) {
    this.aiService = aiService;
    this.balanceService = new BalanceDataService();
  }

  /**
   * 分析物品并提取法术合成材料信息
   * 复用ShrineSynthesisService的逻辑
   */
  extractSpellMaterials(items: any[], knownTypes?: string[]): SpellSynthesisMaterial[] {
    const materials: SpellSynthesisMaterial[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemType = knownTypes?.[i] || ShrineItemService.getItemType(item);
      
      console.log(`处理法术合成材料 "${item.name}":`, {
        itemType,
        hasSpellData: !!item.flags?.['ai-pf2e-assistant']?.originalSpellData
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
          materials.push(this.extractOtherMaterial(item));
          break;
      }
    }

    return materials;
  }

  /**
   * 提取碎片材料
   */
  private extractFragmentMaterial(item: any): SpellSynthesisMaterial {
    const hiddenPrompt = FragmentGeneratorService.extractHiddenPrompt(item);
    return {
      id: item.id || item._id,
      name: item.name,
      type: 'fragment',
      hiddenPrompt: hiddenPrompt || '',
      description: this.extractItemDescription(item),
      rarity: item.system?.traits?.rarity || 'common',
      img: item.img,
      originalItem: item
    };
  }

  /**
   * 提取神性材料
   */
  private extractDivinityMaterial(item: any): SpellSynthesisMaterial {
    let hiddenPrompt = item.system?.description?.gm || '';
    
    if (!hiddenPrompt.trim()) {
      hiddenPrompt = item.flags?.['ai-pf2e-assistant']?.hiddenPrompt || '';
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
    
    return {
      id: item.id || item._id,
      name: item.name,
      type: 'divinity',
      hiddenPrompt: hiddenPrompt,
      description: this.extractItemDescription(item),
      rarity: item.system?.traits?.rarity || 'common',
      deity: item.flags?.['ai-pf2e-assistant']?.deity,
      aspect: item.flags?.['ai-pf2e-assistant']?.aspect,
      effectiveLevel: effectiveLevel,
      img: item.img,
      originalItem: item
    };
  }

  /**
   * 提取贡品材料（法术贡品）
   */
  private extractOfferingMaterial(item: any): SpellSynthesisMaterial {
    let hiddenPrompt = item.system?.description?.gm || '';
    
    if (!hiddenPrompt.trim()) {
      hiddenPrompt = item.flags?.['ai-pf2e-assistant']?.hiddenPrompt || '';
    }
    
    // 提取法术数据
    // 优先使用flags中的originalSpellData，如果没有则从item.system中提取
    let originalSpellData = item.flags?.['ai-pf2e-assistant']?.originalSpellData;
    
    if (!originalSpellData && item.type === 'spell') {
      // 如果没有originalSpellData但是是法术类型物品，从system中提取
      originalSpellData = {
        name: item.name,
        level: item.system?.level?.value,
        description: item.system?.description?.value,
        traits: item.system?.traits?.value || [],
        traditions: item.system?.traits?.traditions || [],
        rarity: item.system?.traits?.rarity,
        castTime: item.system?.time?.value,
        range: item.system?.range?.value,
        area: item.system?.area,
        target: item.system?.target?.value,
        duration: item.system?.duration,
        defense: item.system?.defense,
        damage: item.system?.damage,
        heightening: item.system?.heightening
      };
    }
    
    return {
      id: item.id || item._id,
      name: item.name,
      type: 'offering',
      hiddenPrompt: hiddenPrompt,
      description: this.extractItemDescription(item),
      rarity: item.system?.traits?.rarity || 'common',
      originalSpellData: originalSpellData,
      img: item.img,
      originalItem: item
    };
  }

  /**
   * 提取神龛材料
   */
  private extractShrineMaterial(item: any): SpellSynthesisMaterial {
    let hiddenPrompt = item.system?.description?.gm || '';
    
    if (!hiddenPrompt.trim()) {
      hiddenPrompt = item.flags?.['ai-pf2e-assistant']?.hiddenPrompt || '';
    }
    
    const synthesisRequirements = ShrineItemService.extractSynthesisRequirements(item);
    
    // 解析神龛的等效等级配置（用于全局提升数值强度）
    let effectiveLevel: string | undefined = undefined;
    const cleanText = this.extractTextFromHtml(hiddenPrompt);
    const effectiveLevelMatch = cleanText.match(/EFFECTIVE_LEVEL:\s*([+\-]?\d+)/i);
    if (effectiveLevelMatch) {
      effectiveLevel = effectiveLevelMatch[1];
      console.log(`神龛 "${item.name}" 设置了等效等级: ${effectiveLevel}`);
    }
    
    return {
      id: item.id || item._id,
      name: item.name,
      type: 'shrine',
      hiddenPrompt: hiddenPrompt,
      description: this.extractItemDescription(item),
      rarity: item.system?.traits?.rarity || 'common',
      deity: item.flags?.['ai-pf2e-assistant']?.deity,
      synthesisRequirements: synthesisRequirements,
      effectiveLevel: effectiveLevel, // 添加神龛的等效等级
      img: item.img,
      originalItem: item
    };
  }

  /**
   * 提取其他材料
   */
  private extractOtherMaterial(item: any): SpellSynthesisMaterial {
    return {
      id: item.id || item._id,
      name: item.name,
      type: 'offering', // 默认当作贡品处理
      hiddenPrompt: '',
      description: this.extractItemDescription(item),
      rarity: item.system?.traits?.rarity || 'common',
      img: item.img,
      originalItem: item
    };
  }

  /**
   * 提取物品描述
   */
  private extractItemDescription(item: any): string {
    const desc = item.system?.description?.value || item.description || '';
    return desc.replace(/<[^>]*>/g, '').substring(0, 200);
  }

  /**
   * 神龛法术合成
   * @param materials 合成材料（包含一个神龛）
   * @param config 合成配置
   * @returns 合成结果
   */
  async synthesizeSpell(materials: SpellSynthesisMaterial[], config: SpellSynthesisConfig): Promise<SpellSynthesisResult> {
    console.log('开始法术神龛合成，材料数量:', materials.length, '配置:', config);

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

    // 构建法术合成提示词
    const synthesisPrompt = await this.buildSpellSynthesisPrompt(materials, config);
    
    // 生成法术（现在使用3步流程）
    const shouldGenerateIcon = this.shouldGenerateIcon();
    const spell = await this.generateSpellDirect(
      synthesisPrompt,
      config,
      shouldGenerateIcon,
      materials  // 添加materials参数
    );

    // 扣除神龛点数（如果需要，GM用户不消耗）
    if (!ShrinePointService.isGM()) {
      const consumed = await ShrinePointService.consumeActorPoints(config.actorData);
      if (!consumed) {
        console.warn('神龛点数消耗失败，但合成已完成');
      }
    }

    // 生成平衡性分析
    const balanceAnalysis = this.generateBalanceAnalysis(spell, config);

    return {
      spell: spell,
      usedMaterials: materials,
      balanceAnalysis,
      iconPrompt: spell.system.description.gm || undefined
    };
  }

  /**
   * 验证合成材料
   * 注意：神龛是必需的，其他材料（碎片、神性、贡品）根据神龛配置决定
   * 贡品通常是可选的（min: 0），用于提供参考模板
   */
  validateSynthesisMaterials(materials: SpellSynthesisMaterial[], shrineItem: SpellSynthesisMaterial): any {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // 确保有神龛（唯一必需的材料）
    if (!shrineItem || shrineItem.type !== 'shrine') {
      errors.push('必须选择一个神龛');
    }

    // 分类材料
    const fragments = materials.filter(m => m.type === 'fragment');
    const divinities = materials.filter(m => m.type === 'divinity');
    const offerings = materials.filter(m => m.type === 'offering');

    // 检查材料数量（根据神龛配置）
    const requirements = shrineItem.synthesisRequirements || {
      fragments: { min: 1, max: 3 },
      offerings: { min: 0, max: 1 },  // 贡品可选
      divinities: { min: 1, max: 2 }
    };

    if (fragments.length < requirements.fragments.min) {
      errors.push(`碎片数量不足（需要至少${requirements.fragments.min}个）`);
    }
    if (requirements.fragments.max && fragments.length > requirements.fragments.max) {
      errors.push(`碎片数量过多（最多${requirements.fragments.max}个）`);
    }

    if (divinities.length < requirements.divinities.min) {
      errors.push(`神性数量不足（需要至少${requirements.divinities.min}个）`);
    }
    if (requirements.divinities.max && divinities.length > requirements.divinities.max) {
      errors.push(`神性数量过多（最多${requirements.divinities.max}个）`);
    }

    if (offerings.length < requirements.offerings.min) {
      errors.push(`贡品数量不足（需要至少${requirements.offerings.min}个）`);
    }
    if (requirements.offerings.max && offerings.length > requirements.offerings.max) {
      errors.push(`贡品数量过多（最多${requirements.offerings.max}个）`);
    }

    // 检查贡品是否为法术贡品
    const spellOfferings = offerings.filter(o => o.originalSpellData);
    if (offerings.length > 0 && spellOfferings.length === 0) {
      warnings.push('检测到专长贡品，建议使用法术贡品进行法术合成');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      materialBreakdown: {
        fragments,
        divinities,
        offerings,
        shrines: [shrineItem]
      }
    };
  }

  /**
   * 构建法术合成提示词
   */
  private async buildSpellSynthesisPrompt(materials: SpellSynthesisMaterial[], config: SpellSynthesisConfig): Promise<string> {
    const shrine = config.shrineItem;
    const otherMaterials = materials.filter(m => m.id !== shrine.id);
    
    const fragments = otherMaterials.filter(m => m.type === 'fragment' && m.hiddenPrompt);
    const divinities = otherMaterials.filter(m => m.type === 'divinity');
    const offerings = otherMaterials.filter(m => m.type === 'offering');

    console.log('材料分类结果:');
    console.log('- 要素(fragments):', fragments.map(f => `${f.name}(hasPrompt: ${!!f.hiddenPrompt})`));
    console.log('- 方向(divinities):', divinities.map(d => `${d.name}`));
    console.log('- 模板(offerings):', offerings.map(o => `${o.name}`));

    const hasOfferings = offerings.length > 0;
    console.log(`提示词构建模式: ${hasOfferings ? '模板模式' : '设计模式'}`);
    
    let prompt = `根据以下材料和设定，按照PF2e规则${hasOfferings ? '调整和优化' : '设计'}一个法术。\n\n`;

    // 解析特色内容
    const shrineFeatures = this.parseShrineFeatures(shrine.hiddenPrompt || '');
    console.log('解析特色:', shrineFeatures);
    
    if (shrineFeatures.guidance) {
      prompt += `【合成指导】\n${shrineFeatures.guidance}\n\n`;
      console.log('添加合成指导到提示词开头');
    }
    
    if (shrineFeatures.features) {
      prompt += `【核心特色】\n${shrineFeatures.features}\n\n`;
      console.log('添加核心特色到提示词');
    }
    
    if (shrineFeatures.principles) {
      prompt += `【设计原则】\n${shrineFeatures.principles}\n\n`;
      console.log('添加设计原则到提示词');
    }

    if (hasOfferings) {
      // 核心模板法术
      console.log('[法术合成] 模板数量:', offerings.length);
      offerings.forEach((o, i) => {
        console.log(`[法术合成] 模板${i + 1}:`, {
          name: o.name,
          type: o.type,
          hasOriginalData: !!o.originalSpellData,
          descriptionLength: o.description?.length,
          hiddenPromptLength: o.hiddenPrompt?.length
        });
      });
      
      prompt += '【核心模板法术】\n';
      prompt += '以下法术作为核心模板，具体如何使用由【合成指导】或【设计原则】决定（可以是结构模板、灵感来源或效果参考）：\n\n';
      
      offerings.forEach((offering, index) => {
        prompt += `模板${index + 1} - ${offering.name}:\n\n`;
        
        if (offering.originalSpellData) {
          // 如果有完整的法术数据，提供详细信息
          const spellData = offering.originalSpellData;
          
          if (spellData.level !== undefined) {
            prompt += `**环级**: ${spellData.level}环\n`;
          }
          
          if (spellData.traditions && spellData.traditions.length > 0) {
            prompt += `**施法传统**: ${spellData.traditions.join(', ')}\n`;
          }
          
          if (spellData.castTime) {
            prompt += `**施法时间**: ${spellData.castTime}\n`;
          }
          
          if (spellData.range) {
            prompt += `**范围**: ${spellData.range}\n`;
          }
          
          if (spellData.area) {
            const areaDesc = spellData.area.type ? `${spellData.area.value}尺${spellData.area.type}` : JSON.stringify(spellData.area);
            prompt += `**区域**: ${areaDesc}\n`;
          }
          
          if (spellData.target) {
            prompt += `**目标**: ${spellData.target}\n`;
          }
          
          if (spellData.duration) {
            const durationDesc = typeof spellData.duration === 'object' 
              ? (spellData.duration.value || '立即') 
              : spellData.duration;
            prompt += `**持续时间**: ${durationDesc}\n`;
          }
          
          if (spellData.defense) {
            const defenseDesc = spellData.defense.save 
              ? `${spellData.defense.save.basic ? '基础' : ''}${spellData.defense.save.statistic}豁免` 
              : '有豁免检定';
            prompt += `**防御**: ${defenseDesc}\n`;
          }
          
          // 伤害信息
          if (spellData.damage && Object.keys(spellData.damage).length > 0) {
            prompt += `**伤害**: \n`;
            Object.entries(spellData.damage).forEach(([key, damageEntry]: [string, any]) => {
              if (damageEntry) {
                const damageDesc = `  - ${damageEntry.formula || '?'} ${damageEntry.type || '?'}伤害`;
                const kindDesc = damageEntry.kinds && damageEntry.kinds.length > 0 ? ` (${damageEntry.kinds.join(', ')})` : '';
                const modDesc = damageEntry.applyMod ? ' +调整值' : '';
                prompt += `${damageDesc}${kindDesc}${modDesc}\n`;
              }
            });
          }
          
          // 显示法术效果描述
          if (spellData.description) {
            const cleanDesc = spellData.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            prompt += `\n**法术效果**:\n${cleanDesc}\n`;
          }
          
          if (spellData.traits && spellData.traits.length > 0) {
            prompt += `\n**特征**: ${spellData.traits.join(', ')}\n`;
          }
          
          // 升阶信息
          if (spellData.heightening) {
            prompt += `\n**升阶信息**: `;
            if (spellData.heightening.type === 'interval') {
              prompt += `间隔升阶`;
              if (spellData.heightening.interval) {
                prompt += `（每${spellData.heightening.interval}环）`;
              }
              if (spellData.heightening.damage && Object.keys(spellData.heightening.damage).length > 0) {
                prompt += `\n  伤害增量: `;
                Object.entries(spellData.heightening.damage).forEach(([key, value]) => {
                  prompt += `${key}号位+${value} `;
                });
              }
            } else if (spellData.heightening.type === 'fixed') {
              prompt += `固定升阶`;
            }
            prompt += '\n';
          }
        } else {
          // 如果没有原始法术数据，使用描述和隐藏提示词
          const cleanDescription = this.extractTextFromHtml(offering.description || '');
          prompt += `**法术效果**:\n${cleanDescription}\n`;
          
          if (offering.hiddenPrompt) {
            const cleanHiddenPrompt = this.extractTextFromHtml(offering.hiddenPrompt);
            prompt += `\n**补充信息**:\n${cleanHiddenPrompt}\n`;
          }
        }
        
        prompt += '\n';
      });
      
      prompt += '**注意**：核心模板法术的使用方式请参考【合成指导】或【设计原则】部分的说明。\n\n';
    }

    // 调整指导方向
    const hasDivinities = divinities.length > 0;
    console.log(`方向存在检查: ${hasDivinities ? '有方向' : '无方向'}`);
    
    if (hasDivinities) {
      prompt += '【调整指导方向】\n';
      divinities.forEach((divinity, index) => {
        prompt += `方向${index + 1} - ${divinity.name}`;
        if (divinity.deity) prompt += ` (${divinity.deity})`;
        prompt += ':\n';
        const cleanHiddenPrompt = this.processRandomPrompt(divinity.hiddenPrompt || '');
        prompt += `${cleanHiddenPrompt}\n\n`;
      });

      if (divinities.length > 1) {
        prompt += '**注意**：如有多个指导方向，请合理整合它们的特点，创造出有趣的互动效果。\n\n';
      }
      
      prompt += '**重要说明**：调整指导方向所述机制皆为已有机制概念，你只需要按照机制中需要填充的效果进行组合即可，无需在法术中复述其中提到的任何机制概念名称。\n\n';
    }

    // 补充设计要素
    if (fragments.length > 0) {
      prompt += '【补充设计要素】\n';
      prompt += '以下要素提供可选的效果内容，可以是效果的方向指引，也可以是具体的效果内容：\n\n';
      fragments.forEach((fragment, index) => {
        prompt += `要素${index + 1} - ${fragment.name}:\n`;
        const cleanHiddenPrompt = this.processRandomPrompt(fragment.hiddenPrompt || '');
        prompt += `${cleanHiddenPrompt}\n\n`;
      });
      prompt += '**使用方式**：选择合适的设计要素融入法术中，可以作为主要效果、次要效果或触发条件的一部分。\n\n';
    }

    // 检查并处理等效等级（神龛 + 神性）
    const shrineEffectiveLevel = config.shrineItem?.effectiveLevel;
    const divinityEffectiveLevels = divinities.map(d => d.effectiveLevel).filter(Boolean);
    let effectiveLevelNote = '';
    
    console.log('[等效等级检查]', {
      神龛等效等级: shrineEffectiveLevel || '无',
      神性等效等级: divinityEffectiveLevels.length > 0 ? divinityEffectiveLevels : '无',
      角色基础等级: config.actorLevel,
      法术环级: config.rank
    });
    
    if (shrineEffectiveLevel || divinityEffectiveLevels.length > 0) {
      // 计算最终的等效等级（基于角色等级）
      const baseLevel = config.actorLevel;
      const shrineLevel = shrineEffectiveLevel;
      const divinityLevel = divinityEffectiveLevels.length > 0 ? divinityEffectiveLevels[0] : undefined;
      
      if (shrineLevel || divinityLevel) {
        const effectiveActorLevel = this.calculateStackedEffectiveLevel(
          baseLevel,
          shrineLevel,
          divinityLevel
        );
        
        // 根据等效角色等级计算对应的法术环级
        const effectiveRank = this.calculateRankFromLevel(effectiveActorLevel);
        
        // 构建说明文本
        let levelDescription = '';
        if (shrineLevel && divinityLevel) {
          levelDescription = `神龛${shrineLevel} + 神性${divinityLevel}`;
        } else if (shrineLevel) {
          levelDescription = `神龛${shrineLevel}`;
        } else {
          levelDescription = `神性${divinityLevel}`;
        }
        
        console.log(`✅ [等效等级] 最终计算结果: 角色${effectiveActorLevel}级对应${effectiveRank}环 (基础${baseLevel}级/${config.rank}环, 神龛${shrineLevel || '无'}, 神性${divinityLevel || '无'})`);
        console.log(`   → 数值强度将按${effectiveRank}环法术设计`);
        effectiveLevelNote = `- **等效等级: 角色${effectiveActorLevel}级对应${effectiveRank}环（${levelDescription}）** - 数值强度应按${effectiveRank}环法术设计（基础${baseLevel}级/${config.rank}环）\n`;
      }
    } else {
      console.log('ℹ️ [等效等级] 未设置等效等级，使用基础环级:', config.rank);
    }
    
    // 法术规格要求
    prompt += `【法术规格要求】\n`;
    prompt += `- 法术环级: ${config.rank}\n`;
    if (effectiveLevelNote) {
      prompt += effectiveLevelNote;
    }
    prompt += `- 施法传统: ${config.traditions.join(', ')}\n`;
    prompt += '\n';

    // 添加平衡关键词
    const balanceKeywords = this.getBalanceKeywordsForRank(config.rank);
    if (balanceKeywords && balanceKeywords.length > 0) {
      prompt += `【平衡性参考关键词】\n`;
      prompt += `以下关键词有助于确保法术在${config.rank}环法术中的平衡性：\n`;
      prompt += balanceKeywords.join(', ') + '\n';
      prompt += `请在设计时参考这些关键词，确保法术强度适中。\n\n`;
    }

    console.log('=== 法术合成提示词 ===');
    console.log(prompt);
    console.log('=== 提示词结束 ===');

    return prompt;
  }

  /**
   * 获取环级对应的平衡关键词
   * 环级 × 2 = 专长等级
   */
  private getBalanceKeywordsForRank(rank: number): string[] {
    const featLevel = rank * 2;
    return this.balanceService.getBalanceKeywords(featLevel, 'general');
  }

  /**
   * 解析神龛特色
   */
  private parseShrineFeatures(hiddenPrompt: string): {
    features?: string;
    guidance?: string;
    principles?: string;
  } {
    const result: any = {};
    
    if (!hiddenPrompt) return result;
    
    const cleanText = this.extractTextFromHtml(hiddenPrompt);
    
    const featuresMatch = cleanText.match(/【神龛特色】\s*([\s\S]*?)(?=【|$)/);
    if (featuresMatch) {
      result.features = featuresMatch[1].trim();
    }
    
    const guidanceMatch = cleanText.match(/【合成指导】\s*([\s\S]*?)(?=【|$)/);
    if (guidanceMatch) {
      result.guidance = guidanceMatch[1].trim();
    }
    
    const principlesMatch = cleanText.match(/【设计原则】\s*([\s\S]*?)(?=【|$)/);
    if (principlesMatch) {
      result.principles = principlesMatch[1].trim();
    }
    
    return result;
  }

  /**
   * 计算等效等级
   * @param effectiveLevelConfig 等效等级配置（如 "5" 或 "+2"）
   * @param baseLevel 基础角色等级
   * @returns 计算后的等效角色等级
   */
  private calculateEffectiveLevel(effectiveLevelConfig: string, baseLevel: number): number {
    if (effectiveLevelConfig.startsWith('+')) {
      // 相对值：基础角色等级 + 修正值
      const modifier = parseInt(effectiveLevelConfig.substring(1));
      return Math.min(20, baseLevel + modifier); // 角色最高20级
    } else if (effectiveLevelConfig.startsWith('-')) {
      // 相对值：基础角色等级 - 修正值
      const modifier = parseInt(effectiveLevelConfig.substring(1));
      return Math.max(1, baseLevel - modifier); // 角色最低1级
    } else {
      // 绝对值：直接使用指定的角色等级
      return parseInt(effectiveLevelConfig);
    }
  }

  /**
   * 计算叠加的等效等级（神龛 + 神性）
   * @param baseLevel 基础角色等级
   * @param shrineLevel 神龛的等效等级配置
   * @param divinityLevel 神性的等效等级配置
   * @returns 最终的等效角色等级
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
    
    return Math.min(20, finalLevel); // 角色最高20级
  }

  /**
   * 解析 USE_RULES_KNOWLEDGE 配置，包含拼写容错
   * T开头/yes/1 → true，F开头/no/0 → false
   * @param shrineItem 神龛材料
   * @param stageName 阶段名称（用于日志）
   * @returns 是否启用规则知识库
   */
  private parseUseRulesKnowledge(shrineItem: SpellSynthesisMaterial, stageName: string): boolean {
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
   * 从HTML中提取文本
   */
  private extractTextFromHtml(content: string): string {
    if (!content) return '';
    
    let cleanText = content
      .replace(/<div[^>]*>/g, '\n')
      .replace(/<\/div>/g, '')
      .replace(/<p[^>]*>/g, '')
      .replace(/<\/p>/g, '\n')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<hr\s*\/?>/g, '\n---\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    
    return cleanText;
  }

  /**
   * 处理随机选项提示词
   */
  private processRandomPrompt(htmlContent: string): string {
    if (!htmlContent) return '';
    
    let result = htmlContent;
    const olRegex = /<ol[^>]*>([\s\S]*?)<\/ol>/gi;
    
    result = result.replace(olRegex, (match, olContent) => {
      const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      const options: string[] = [];
      let liMatch;
      
      while ((liMatch = liRegex.exec(olContent)) !== null) {
        const liContent = liMatch[1];
        const cleanOption = this.extractTextFromHtml(liContent);
        if (cleanOption.trim()) {
          options.push(cleanOption.trim());
        }
      }
      
      if (options.length > 0) {
        const randomIndex = Math.floor(Math.random() * options.length);
        return options[randomIndex];
      }
      
      return '';
    });
    
    return this.extractTextFromHtml(result);
  }

  /**
   * 获取神龛阶段配置（是否启用）
   */
  private getSpellPhaseEnabled(phase: 'design' | 'format'): boolean {
    const game = (window as any).game;
    if (!game?.settings) {
      console.warn(`无法访问游戏设置，${phase}阶段使用默认值 true`);
      return true;
    }
    
    try {
      const settingKey = phase === 'design' ? 'shrineSpellDesignEnabled' : 'shrineSpellFormatEnabled';
      return game.settings.get('ai-pf2e-assistant', settingKey) as boolean;
    } catch (error) {
      console.warn(`读取神龛法术${phase}阶段配置失败，使用默认值 true`);
      return true;
    }
  }

  /**
   * 法术设计智能体（阶段1）
   * 负责设计符合神龛合成要求的法术机制框架
   */
  private async designSpell(
    prompt: string,
    config: SpellSynthesisConfig,
    materials: SpellSynthesisMaterial[]
  ): Promise<any> {
    console.log('=== 开始法术设计阶段 ===');
    
    // 检查神龛配置是否启用规则机制知识库
    let mechanicsKnowledgeSection = '';
    let useRulesKnowledge = false;
    
    if (config.shrineItem) {
      useRulesKnowledge = this.parseUseRulesKnowledge(config.shrineItem, '法术设计阶段');
    }
    
    if (useRulesKnowledge) {
      console.log('[法术设计阶段] 启用PF2e规则机制知识库（完整版）');
      try {
        const mechanicsKnowledgeService = PF2eMechanicsKnowledgeService.getInstance();
        const mechanicsKnowledge = mechanicsKnowledgeService.getFullKnowledge();
        mechanicsKnowledgeSection = `\n\n---\n\n## PF2e 规则机制参考（用于设计阶段）\n\n${mechanicsKnowledge}\n\n**设计阶段重点**：\n- 关注机制框架的选择（施法时间、范围、目标、持续时间）\n- 参考机制组合原则和平衡设计\n- 使用机制描述模板作为设计灵感\n- 确保数值范围符合环级对应的强度\n\n注意：这里是设计机制框架，具体数值由生成阶段确定。`;
      } catch (error) {
        console.warn('获取PF2e规则机制知识库失败:', error);
      }
    }
    
    // 分析材料中的核心模板法术
    const offerings = materials.filter(m => m.type === 'offering') || [];
    const divinities = materials.filter(m => m.type === 'divinity') || [];
    const hasOfferings = offerings.length > 0;
    const hasDivinities = divinities.length > 0;
    
    // 构建核心模板法术使用指导
    let offeringGuidance = '';
    if (hasOfferings) {
      offeringGuidance = `\n\n---\n\n## 核心模板法术使用指导\n\n当前合成中包含${offerings.length}个核心模板法术。\n\n`;
      
      offerings.forEach((offering, index) => {
        offeringGuidance += `**模板${index + 1}：${offering.name}**\n`;
        const cleanDesc = this.extractTextFromHtml(offering.description || '').substring(0, 200);
        offeringGuidance += `法术概述：${cleanDesc}...\n\n`;
      });
      
      offeringGuidance += `**重要说明**：\n`;
      offeringGuidance += `核心模板法术的具体使用方式由【合成指导】或【设计原则】决定。请查看这些部分，了解如何使用这些模板法术。\n\n`;
      offeringGuidance += `模板法术可能被用作：\n`;
      offeringGuidance += `- 结构模板（参考其组织方式）\n`;
      offeringGuidance += `- 灵感来源（变化其核心概念）\n`;
      offeringGuidance += `- 效果参考（借鉴部分机制）\n`;
      offeringGuidance += `- 或其他指定的用途\n\n`;
      offeringGuidance += `**按照【合成指导】或【设计原则】来处理模板法术，不要自行假设其用途。**\n\n`;
    }
    
    // 构建调整指导方向说明
    let divinityGuidance = '';
    if (hasDivinities) {
      divinityGuidance = `\n\n---\n\n## 调整指导方向理解（重要！）\n\n当前合成提供了${divinities.length}个调整指导方向，它们定义了法术的核心机制。\n\n`;
      
      divinities.forEach((divinity, index) => {
        divinityGuidance += `**方向${index + 1}：${divinity.name}**\n`;
        const cleanPrompt = this.extractTextFromHtml(divinity.hiddenPrompt || divinity.description || '').substring(0, 300);
        divinityGuidance += `机制描述：${cleanPrompt}${cleanPrompt.length >= 300 ? '...' : ''}\n`;
        
        // 计算叠加的等效等级（神龛基础 + 神性调整）
        const shrineEffectiveLevel = config.shrineItem.effectiveLevel;
        const divinityEffectiveLevel = divinity.effectiveLevel;
        
        if (shrineEffectiveLevel || divinityEffectiveLevel) {
          // 获取角色等级（用于计算等效等级）
          const actorLevel = config.actorData?.level || (config.rank * 2); // 如果没有角色数据，环级*2作为估算
          const finalLevel = this.calculateStackedEffectiveLevel(
            actorLevel,
            shrineEffectiveLevel,
            divinityEffectiveLevel
          );
          
          console.log(`[等效等级] 最终计算结果: 角色${finalLevel}级 (基础${actorLevel}级, 神龛${shrineEffectiveLevel || '无'}, 神性${divinityEffectiveLevel || '无'})`);
          
          // 将计算出的角色等级转换为环级（向上取整）
          const calculatedRank = Math.min(10, Math.ceil(finalLevel / 2));
          
          // 构建说明文本
          let levelDescription = '';
          if (shrineEffectiveLevel && divinityEffectiveLevel) {
            levelDescription = `神龛${shrineEffectiveLevel} + 神性${divinityEffectiveLevel}`;
          } else if (shrineEffectiveLevel) {
            levelDescription = `神龛${shrineEffectiveLevel}`;
          } else {
            levelDescription = `神性${divinityEffectiveLevel}`;
          }
          
          divinityGuidance += `**等效等级：角色${finalLevel}级（${levelDescription}）对应${calculatedRank}环** - 该调整指导方向添加了机制限制，因此数值强度应按${calculatedRank}环法术设计（角色基础等级${actorLevel}级/${config.rank}环）\n`;
        }
        divinityGuidance += `\n`;
      });
      
      divinityGuidance += `**你的职责**：\n`;
      divinityGuidance += `1. 深入理解调整指导方向提供的机制框架\n`;
      divinityGuidance += `2. 基于这个机制设计法术的具体实现\n`;
      divinityGuidance += `3. 融入补充设计要素提供的效果内容\n`;
      
      const hasAnyEffectiveLevel = config.shrineItem.effectiveLevel || divinities.some(d => d.effectiveLevel);
      if (hasAnyEffectiveLevel) {
        divinityGuidance += `4. 如果设置了等效等级（神龛或神性），按该环级的数值强度设计（以补偿机制限制）\n`;
        if (config.shrineItem.effectiveLevel && divinities.some(d => d.effectiveLevel)) {
          divinityGuidance += `   - 注意：神龛和神性的等效等级会叠加计算\n`;
        }
      }
      
      divinityGuidance += `\n**关键**：调整指导方向所述机制皆为已有机制概念，你只需要按照机制中需要填充的效果进行组合即可，无需在法术中复述其中提到的任何机制概念名称。\n\n`;
    }
    
    const systemPrompt = `你是一个专业的Pathfinder 2e法术设计师。你的角色是**纯粹的创意设计师**，只负责输出创意内容。

**🌏 语言要求（重要）**：
- **法术名称必须使用中文**
- 所有描述内容必须使用中文

---

## 你的职责（设计阶段）

你只需要输出三个核心内容：

1. **法术名称**
   - 简洁有力的中文名称
   - 体现法术的核心概念
   
2. **设计理念**（1-2句话）
   - 法术的核心概念是什么？
   - 如何融合材料的主题？
   
3. **机制框架**（文字描述形式）
   - 按照"构件定义→交互逻辑→效果说明"的结构
   - 例如："XX是一种附加效果，当施法者成功造成YY伤害时，目标会被施加ZZ状态。该状态持续到目标成功通过豁免检定或持续时间结束。"
   - 清晰描述机制如何工作，不需要具体数值

**你不应该输出**：
- ❌ 具体的数值（2d6还是3d6、+2还是+3）
- ❌ 技术字段（castTime、range、area、targets、duration、defense、traits等）
- ❌ HTML格式的description
- ❌ 完整的描述文本

---

${divinityGuidance}${offeringGuidance}

${mechanicsKnowledgeSection}

---

## 输出格式

请以纯文字形式输出，不要使用JSON或函数格式：

---
【法术名称】
法术的名称（中文）

【设计理念】
1-2句话说明核心概念和如何融合材料

【机制框架】
按照"构件定义→交互逻辑→效果说明"的结构，用文字描述机制如何工作。不要包含具体数值。
---`;

    const userPrompt = `请为以下神龛合成需求设计一个${config.rank}环法术：

${prompt}

施法传统：${config.traditions.join(', ')}

请严格按照神龛的【合成指导】和材料指引进行设计。`;

    console.log('=== 法术设计提示词 ===');
    console.log('User Prompt:', userPrompt);
    console.log('=== 设计提示词结束 ===');

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt }
    ];

    try {
      const model = this.getShrineModel('design');
      console.log(`[法术设计] 使用模型: ${model}`);
      const response = await this.aiService.callService(messages, model);
      const designPlan = this.parseSpellDesignResponse(response);
      
      // 输出已在 parseSpellDesignResponse 中完成
      
      return designPlan;
    } catch (error) {
      console.error('法术设计失败:', error);
      throw new Error(`法术设计失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 解析法术设计响应
   */
  private parseSpellDesignResponse(response: any): any {
    console.log('\n' + '='.repeat(80));
    console.log('【设计阶段】解析法术设计响应（纯文本）');
    console.log('='.repeat(80));
    
    const content = response.choices?.[0]?.message?.content || '';
    console.log('→ 收到纯文本设计内容，长度:', content.length);
    
    // 从纯文本格式中提取信息
    const nameMatch = content.match(/【法术名称】\s*\n\s*(.+?)(?=\n|$)/);
    const rationaleMatch = content.match(/【设计理念】\s*\n\s*(.+?)(?=\n\n【|$)/s);
    const frameworkMatch = content.match(/【机制框架】\s*\n\s*(.+?)(?=\n---|\n\n【|$)/s);
    
    const designPlan = {
      name: nameMatch?.[1]?.trim() || '法术',
      designRationale: rationaleMatch?.[1]?.trim() || '未指定设计理念',
      mechanicsFramework: frameworkMatch?.[1]?.trim() || '未指定机制框架'
    };
    
    console.log('✓ 成功从文本提取设计内容');
    
    // 输出设计方案到控制台
    console.log('\n' + '━'.repeat(80));
    console.log('【法术设计方案完整输出】');
    console.log('━'.repeat(80));
    console.log('法术名称:', designPlan.name);
    console.log('\n【设计理念】:');
    console.log(designPlan.designRationale);
    console.log('\n【机制框架】:');
    console.log(designPlan.mechanicsFramework);
    console.log('━'.repeat(80) + '\n');
    
    return designPlan;
  }

  /**
   * 修复常见的JSON错误
   */
  private fixCommonJsonErrors(jsonStr: string): string {
    return jsonStr
      .replace(/,\s*}/g, '}')  // 移除对象末尾的逗号
      .replace(/,\s*\]/g, ']') // 移除数组末尾的逗号
      .replace(/'/g, '"')      // 单引号转双引号
      .trim();
  }

  /**
   * 获取神龛系统使用的AI模型配置（与专长共用配置）
   */
  private getShrineModel(agentType: 'design' | 'format' | 'direct' | 'iconPrompt'): string {
    const game = (window as any).game;
    if (!game?.settings) {
      const defaults: Record<string, string> = {
        design: 'gpt-4o',
        format: 'gpt-4o',
        direct: 'gpt-4o',
        iconPrompt: 'gpt-4o-mini'
      };
      return defaults[agentType];
    }
    
    // 使用与专长相同的配置键（专长和法术共用）
    const settingKey = `shrine${agentType.charAt(0).toUpperCase() + agentType.slice(1)}Model`;
    try {
      return game.settings.get('ai-pf2e-assistant', settingKey) as string;
    } catch (error) {
      console.warn(`无法读取神龛模型配置 ${settingKey}，使用默认值`);
      const defaults: Record<string, string> = {
        design: 'gpt-4o',
        format: 'gpt-4o',
        direct: 'gpt-4o',
        iconPrompt: 'gpt-4o-mini'
      };
      return defaults[agentType];
    }
  }

  /**
   * 法术格式转换智能体（阶段3）
   * 将法术设计转换为标准的PF2e格式，并进行数值审核
   */
  private async convertSpellToFormat(
    spell: any,
    config: SpellSynthesisConfig
  ): Promise<PF2eSpellFormat> {
    console.log('=== 开始法术格式转换阶段 ===');
    
    // 检查是否为戏法
    const isCantrip = config.isCantrip !== undefined ? config.isCantrip : (config.rank === 1 && spell?.system?.traits?.value?.includes('cantrip'));
    
    const cantripWarning = isCantrip ? `

**⚠️ 戏法数值审核重点**：
- 基础伤害（1级使用）应该约2d4（平均5点）
- 升阶应该通过heightening字段实现（interval: 2，每次+1d4）
- 不要给予过高的基础伤害
` : '';
    
    const systemPrompt = `你是一个PF2e法术数据格式验证和数值审核专家。

**🚨 最高优先级：不要改写描述内容！**

你的两个任务：
1. **格式验证**：修复JSON结构和HTML标签错误
2. **数值审核**：检查伤害期望值是否符合${config.rank}环法术标准，如果明显不合理才调整数值

**严格保留（不能修改）**：
- description.value 的文字表述和效果内容
- 法术名称、主题和风格
- system.level.value = ${config.rank}
- system.traits.traditions = ${JSON.stringify(config.traditions)}

**允许修复**：
- JSON字段类型错误
- HTML标签问题（未闭合等）
- 嵌入式引用格式（方括号内改为英文）
- 缺失的必需字段
- **数值调整**（仅当伤害期望值明显超标或不足时）

**【数值平衡性审核 - 重要】**：

在格式化时，必须审核法术的数值是否合理：

1. **伤害期望值计算**：
   - 计算所有伤害类型的总期望值（不是简单看骰子数量）
   - 例如："1d6火焰 + 1d6寒冷" = 平均7点伤害（不是1d6！）
   - 例如："2d4火焰" = 平均5点伤害
   - 例如："3d6火焰" = 平均10.5点伤害

2. **${config.rank}环法术的标准伤害期望值**：
   ${isCantrip ? `- 戏法基础（1级使用）：约2d4 = 5点平均伤害
   - 戏法升阶：每2级+1d4（通过heightening实现）
   - 10级角色使用戏法：约6d4 = 15点平均伤害` : 
   config.rank === 1 ? `- 1环单体：2d6到2d10（平均7-11点）
   - 1环范围：1d6到2d6（平均3.5-7点）` :
   config.rank === 2 ? `- 2环单体：3d6到4d6（平均10.5-14点）
   - 2环范围：2d6到3d6（平均7-10.5点）` :
   config.rank === 3 ? `- 3环单体：5d6到6d6（平均17.5-21点）
   - 3环范围：3d6到4d6（平均10.5-14点）` :
   `- ${config.rank}环法术：参考等级缩放公式`}

3. **多种伤害类型的处理**：
   - 如果法术造成多种伤害类型，**必须累加所有伤害的期望值**
   - 例如："1d6火焰 + 1d6寒冷" 的总期望值是7点，不是3.5点
   - 多种伤害类型通常意味着更容易绕过抗性，应该略微降低总伤害

4. **单动作效果的等效性**：
   - 2动作法术的效果应该约等于"单动作×2"的价值
   - 3动作法术的效果应该约等于"单动作×3"的价值
   - 如果法术是2动作但伤害期望值过低，需要调整

5. **审核检查清单**：
   - [ ] 计算所有伤害类型的总期望值
   - [ ] 对比${config.rank}环法术的标准期望值
   - [ ] 考虑动作成本（2动作应该更强）
   - [ ] 考虑范围（单体应该比范围伤害高）
   - [ ] 考虑附加效果（如果有控制/debuff，伤害应该略低）
   - [ ] 如果数值明显超标或不足，进行调整

${cantripWarning}

**以下是Foundry VTT的完整格式参考（嵌入式引用语法、UUID、缩放公式等）**：

${TECHNICAL_REQUIREMENTS}

请使用提供的generateSpell函数返回完整的PF2e法术数据。`;

    const userPrompt = `检查以下法术数据的格式和数值问题，**不要改写描述内容**：

${JSON.stringify(spell, null, 2)}

只修复格式错误和明显的数值不平衡。保留 description.value 的原始文字内容。`;

    console.log('=== 法术格式转换提示词 ===');
    console.log('User Prompt:', userPrompt.substring(0, 500) + '...');
    console.log('=== 格式转换提示词结束 ===');

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt }
    ];

    try {
      const model = this.getShrineModel('format');
      console.log(`[法术格式转换] 使用模型: ${model}`);
      
      const response = await this.aiService.callService(
        messages,
        {
          model,
          temperature: 0.8,
          tools: [{
            type: 'function',
            function: SPELL_GENERATION_SCHEMA
          }],
          tool_choice: { type: 'function', function: { name: 'generateSpell' } }
        }
      );

      let formattedSpell = this.parseSpellResponse(response);
      formattedSpell = this.sanitizeGeneratedSpell(formattedSpell, config);
      
      console.log('[法术格式转换] 格式转换完成:', formattedSpell.name);
      return formattedSpell;
    } catch (error) {
      console.error('法术格式转换失败:', error);
      throw new Error(`法术格式转换失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 直接生成法术（现在改为3步流程：设计→生成→格式化）
   */
  private async generateSpellDirect(
    prompt: string,
    config: SpellSynthesisConfig,
    shouldGenerateIcon: boolean,
    materials: SpellSynthesisMaterial[]
  ): Promise<PF2eSpellFormat> {
    console.log('=== 开始神龛法术统一生成流程 ===');
    
    // 检查是否有神性材料
    const hasDivinities = materials && materials.some(m => m.type === 'divinity');
    
    // 如果有神性，自动跳过设计阶段（神性已提供核心机制设计）
    let enableDesign = this.getSpellPhaseEnabled('design');
    if (hasDivinities) {
      enableDesign = false;
      console.log('检测到神性材料，自动跳过设计阶段（神性已提供核心机制）');
    }
    
    const enableFormat = this.getSpellPhaseEnabled('format');
    
    const designReason = hasDivinities ? '神性存在' : '配置关闭';
    console.log(`流程配置: 设计阶段=${enableDesign ? '开启' : `关闭（${designReason}）`}, 格式化阶段=${enableFormat ? '开启' : '关闭'}`);
    
    let designPlan: any = null;
    let generatedSpell: any;
    let finalSpell: PF2eSpellFormat;
    
    // ========== 阶段1: 设计 (可选) ==========
    if (enableDesign) {
      console.log('--- 阶段1: 设计阶段 ---');
      designPlan = await this.designSpell(prompt, config, materials);
      console.log(`设计方案完成: ${designPlan.name}`);
    } else {
      console.log(`--- 跳过设计阶段${hasDivinities ? '（神性已提供机制设计）' : ''} ---`);
    }
    
    // ========== 阶段2: 生成 (核心) ==========
    console.log('--- 阶段2: 生成阶段 ---');
    generatedSpell = await this.generateSpellWithPrompt(prompt, config, materials, designPlan);
    console.log(`法术生成完成: ${generatedSpell.name}`);
    
    // ========== 阶段3: 格式化 (可选) ==========
    if (enableFormat) {
      console.log('--- 阶段3: 格式化阶段 ---');
      finalSpell = await this.convertSpellToFormat(generatedSpell, config);
      console.log(`格式转换完成: ${finalSpell.name}`);
    } else {
      console.log('--- 跳过格式化阶段 ---');
      finalSpell = generatedSpell;
    }

    // 应用必定携带的特征
    if (config.requiredTraits && config.requiredTraits.length > 0) {
      if (!finalSpell.system.traits) {
        finalSpell.system.traits = { value: [], rarity: 'common', traditions: config.traditions || [] };
      }
      if (!finalSpell.system.traits.value) {
        finalSpell.system.traits.value = [];
      }
      
      // 添加必定携带的特征（避免重复）
      for (const trait of config.requiredTraits) {
        if (!finalSpell.system.traits.value.includes(trait)) {
          finalSpell.system.traits.value.push(trait);
          console.log(`[generateSpellDirect] ✓ 添加必定携带的特征: "${trait}"`);
        }
      }
    }

    // 如果需要生成图标，添加图标提示词
    if (shouldGenerateIcon) {
      const iconPrompt = await this.generateIconPrompt(finalSpell);
      if (iconPrompt) {
        finalSpell.system.description.gm = iconPrompt;
      }
    }

    console.log('=== 神龛法术生成流程完成 ===');
    return finalSpell;
  }

  /**
   * 核心生成方法（阶段2）：基于神龛提示词和可选的设计方案生成法术
   */
  private async generateSpellWithPrompt(
    prompt: string,
    config: SpellSynthesisConfig,
    materials: SpellSynthesisMaterial[],
    designPlan?: any
  ): Promise<PF2eSpellFormat> {
    // 检测系统语言
    const game = (window as any).game;
    const systemLang = game?.i18n?.lang || 'en';
    const isChinese = systemLang.startsWith('zh') || systemLang === 'cn';
    
    // 检查神龛配置是否启用规则机制知识库（从GM描述中读取）
    let rulesKnowledgeSection = '';
    
    // 从GM描述中解析USE_RULES_KNOWLEDGE配置
    let useRulesKnowledge = false;
    if (config.shrineItem) {
      useRulesKnowledge = this.parseUseRulesKnowledge(config.shrineItem, '法术生成阶段');
    }
    
    if (useRulesKnowledge) {
      console.log('[法术生成阶段] 启用PF2e规则机制知识库（完整版）');
      try {
        const mechanicsKnowledgeService = PF2eMechanicsKnowledgeService.getInstance();
        const mechanicsKnowledge = mechanicsKnowledgeService.getFullKnowledge();
        rulesKnowledgeSection = `\n\n---\n\n## PF2e 规则机制参考（用于生成阶段）\n\n${mechanicsKnowledge}\n\n**生成阶段重点**：\n- 将机制框架转化为具体的数值和描述\n- 确保数值范围符合环级对应的强度（参考"机制强度参考"章节）\n- 使用正确的术语和表述方式\n- 在描述中清晰说明所有规则细节`;
      } catch (error) {
        console.warn('获取PF2e规则机制知识库失败:', error);
      }
    } else {
      console.log('[法术生成阶段] 未启用PF2e规则机制知识库（默认关闭）');
    }
    
    // 检查是否为戏法
    // 优先使用配置中的 isCantrip 标记，如果没有则根据 rank 判断（rank 1 可能是戏法）
    const isCantrip = config.isCantrip !== undefined ? config.isCantrip : (config.rank === 1);
    
    // 根据系统语言和是否有设计方案构建提示词
    let systemPrompt = isChinese 
      ? `你是PF2e法术设计专家，精通Pathfinder 2e法术规则和数据结构。`
      : `You are a PF2e spell design expert, proficient in Pathfinder 2e spell rules and data structures.`;
    
    // 如果是戏法，添加特别说明
    if (isCantrip) {
      systemPrompt += isChinese
        ? `\n\n⚠️ **你正在生成戏法（Cantrip）**：

**【戏法的核心规则 - 必须严格遵守】**：

1. **环级固定为1** - 戏法的环级永远是1，这只是分类标识
2. **基础强度基于1级法术** - 戏法的基础效果（1级角色使用时）应该：
   - 伤害：约2d4（平均5点）
   - 明显弱于普通1环法术（2d6到2d10，平均7-11点）
   - 适合无限施放的强度

3. **自动升阶机制** - 戏法通过heightening字段随**施法者等级**自动增强：
   - **必须包含heightening字段**
   - type: "interval"
   - interval: 通常为2（每2级增强一次）或1（每级增强）
   - damage: 每次升阶增加的伤害（通常1d4）
   
4. **等级计算示例**：
   - 1级角色使用：2d4伤害（基础）
   - 3级角色使用：2d4 + 1d4 = 3d4（升阶1次）
   - 5级角色使用：2d4 + 2d4 = 4d4（升阶2次）
   - 10级角色使用：2d4 + 4d4 = 6d4（升阶4次，约15点平均伤害）

5. **❌ 常见错误**：
   - ❌ 把戏法当作"与角色等级相同环级的法术"（错误！）
   - ❌ 10级角色使用时给予10环法术的强度（错误！）
   - ✅ 正确：戏法永远是1环基础 + 自动升阶增强

6. **必须在traits.value中包含"cantrip"特征标记**

**参考规则知识库中的"戏法设计原则"章节获取更多细节。**`
        : `\n\n⚠️ **You are generating a Cantrip**:

**【Core Cantrip Rules - Must Strictly Follow】**:

1. **Rank is always 1** - Cantrip rank is permanently 1, this is just a classification
2. **Base power based on rank 1 spell** - Cantrip base effect (when used by level 1 character) should be:
   - Damage: ~2d4 (average 5)
   - Noticeably weaker than regular rank 1 spells (2d6 to 2d10, average 7-11)
   - Suitable for unlimited casting

3. **Auto-heightening mechanism** - Cantrips auto-heighten with **caster level** via heightening field:
   - **Must include heightening field**
   - type: "interval"
   - interval: usually 2 (heighten every 2 levels) or 1 (every level)
   - damage: damage increase per heightening (usually 1d4)
   
4. **Level calculation example**:
   - Level 1 caster: 2d4 damage (base)
   - Level 3 caster: 2d4 + 1d4 = 3d4 (heightened once)
   - Level 5 caster: 2d4 + 2d4 = 4d4 (heightened twice)
   - Level 10 caster: 2d4 + 4d4 = 6d4 (heightened 4 times, ~15 average damage)

5. **❌ Common Mistakes**:
   - ❌ Treating cantrip as "spell of same rank as character level" (Wrong!)
   - ❌ Giving rank 10 spell power when used by level 10 character (Wrong!)
   - ✅ Correct: Cantrip is always rank 1 base + auto-heightening

6. **Must include "cantrip" trait in traits.value**

**Refer to "Cantrip Design Principles" section in rules knowledge for more details.**`;
    }
    
    if (designPlan) {
      systemPrompt += isChinese
        ? `你的角色是**实现者**，负责将机制框架转化为完整的法术内容。

**🌏 语言要求（最高优先级）**：
- **法术名称（name字段）必须使用中文，绝对不要使用英文**
- 所有描述内容（description.value）必须使用中文

---

## 你的职责（生成阶段）

**你有一个设计方案作为创意指导**，你的任务是：

1. **理解设计理念和机制框架**
   - 设计方案提供了创意方向和核心机制的描述
   - 机制框架是纯文字的交互逻辑描述，不包含具体的技术参数

2. **确定所有技术细节**
   - **施法时间（cast）**：根据机制复杂度确定（1动作、2动作、3动作、反应等）
   - **施法范围（range）**：根据法术性质确定（接触、30尺、60尺、120尺等）
   - **目标/区域（target/area）**：确定影响对象（1个生物、爆发、锥形等）
   - **持续时间（duration）**：根据效果性质确定（瞬间、专注、1分钟、持续等）
   - **防御方式（defense）**：如果需要豁免检定，确定类型（强韧、反射、意志）
   - **特征（traits）**：根据效果确定（fire、healing、mental、attack等）

3. **确定合理的数值**
   - **伤害骰子**：符合${config.rank}环法术标准（参考等级缩放公式）
   - **加值/减值**：根据效果强度和频次确定
   - **DC**：通常使用施法者的法术DC
   - **升环规则（heightening）**：根据法术性质设计升环效果

4. **编写完整的description.value**
   - 这是最重要的字段，必须包含所有规则细节
   - 使用HTML格式，包括必要的段落、粗体标记等
   - 根据机制框架的文字描述，编写详细的游戏规则文本
   - 明确说明所有数值、条件、限制

5. **构建完整的数据结构**
   - 正确填写所有技术字段（cast、range、target、duration、defense等）
   - **仅当法术造成伤害时**，才填写damage字段（如果法术是buff、控制、治疗、传送等效果，不要添加damage字段）
   - **仅当法术有升环效果时**，才填写heightening字段（如果法术效果不随环级变化，不要添加此字段）

**设计方案（创意参考）**：

法术名称：${designPlan.name}
环级：${config.rank}
施法传统：${config.traditions.join(', ')}

【设计理念】：
${designPlan.designRationale}

【机制框架】（纯文字描述）：
${designPlan.mechanicsFramework}

---

**关键要求**：
1. 法术名称必须是"${designPlan.name}"（中文）
2. 环级必须是${config.rank}
3. 施法传统必须是${config.traditions.join(', ')}
4. 根据机制框架的文字描述，**自行确定**所有技术参数（施法时间、范围、目标、持续时间、防御方式）
5. 机制框架只描述"做什么"，你需要确定"如何做"（技术参数）和"数值多少"
6. 编写详细的description.value，包含所有规则细节和具体数值
7. 特征（traits）由你根据法术效果确定（如fire、healing、mental、attack等）

${rulesKnowledgeSection}`
        : `You are an **implementer**, responsible for transforming the design framework into complete spell content.

**🌏 Language Requirement (Highest Priority)**：
- **Spell name (name field) must use Chinese, absolutely no English**
- All description content (description.value) must use Chinese

---

## Your Responsibilities (Generation Phase)

**You have a design plan as creative guidance**, your tasks are:

1. **Understand the design concept and mechanic framework**
   - The design plan provides creative direction and core mechanic description
   - The mechanic framework is pure text describing interaction logic, without specific technical parameters

2. **Determine all technical details**
   - **Cast time (cast)**: Based on mechanic complexity (1 action, 2 actions, 3 actions, reaction, etc.)
   - **Range (range)**: Based on spell nature (touch, 30 feet, 60 feet, 120 feet, etc.)
   - **Target/Area (target/area)**: Define affected subjects (1 creature, burst, cone, etc.)
   - **Duration (duration)**: Based on effect nature (instant, concentration, 1 minute, sustained, etc.)
   - **Defense (defense)**: If save is needed, determine type (fortitude, reflex, will)
   - **Traits (traits)**: Based on effects (fire, healing, mental, attack, etc.)

3. **Determine reasonable values**
   - **Damage dice**: Match ${config.rank}-rank spell standards (refer to level scaling formulas)
   - **Bonuses/Penalties**: Based on effect strength and frequency
   - **DC**: Usually use caster's spell DC
   - **Heightening**: Design heightening effects based on spell nature

4. **Write complete description.value**
   - This is the most important field, must contain all rule details
   - Use HTML format with necessary paragraphs and bold markers
   - Transform the text mechanic framework into detailed game rule text
   - Clearly state all values, conditions, limitations

5. **Build complete data structure**
   - Correctly fill all technical fields (cast, range, target, duration, defense, etc.)
   - **Only fill damage field when the spell deals damage** (if the spell is a buff, control, healing, teleportation, etc., do NOT add damage field)
   - **Only fill heightening field when the spell has heightening effects** (if the spell effect doesn't change with rank, do NOT add this field)

**Design Plan (Creative Reference)**：

Spell Name: ${designPlan.name}
Rank: ${config.rank}
Traditions: ${config.traditions.join(', ')}

【Design Rationale】:
${designPlan.designRationale}

【Mechanic Framework】(Pure text description):
${designPlan.mechanicsFramework}

---

**Key Requirements**:
1. Spell name must be "${designPlan.name}"
2. Rank must be ${config.rank}
3. Traditions must be ${config.traditions.join(', ')}
4. Based on the text mechanic framework, **determine yourself** all technical parameters (cast time, range, target, duration, defense)
5. Mechanic framework only describes "what to do", you determine "how to do" (technical params) and "how much" (values)
6. Write detailed description.value with all rule details and specific values
7. Traits determined by you based on spell effects (fire, healing, mental, attack, etc.)

${rulesKnowledgeSection}`;
    } else {
      systemPrompt += isChinese
        ? `请根据用户提供的合成需求创建一个完整的${isCantrip ? '戏法（Cantrip）' : '法术'}。

${SPELL_DESIGN_GUIDANCE}

**关键要求**：
- 所有文本内容必须使用中文（法术名称、描述、效果等）
- description.value必须详细完整，使用HTML格式
- 环级为${config.rank}，施法传统必须匹配指定要求
- 数值强度符合该环级法术的标准
${isCantrip ? '- **必须在traits.value中包含"cantrip"特征**\n- **必须包含heightening字段**：设置interval（通常为1或2），定义自动升环规则\n- **伤害约2d4基础**，明显弱于普通1环法术\n- **效果必须适合无限施放**' : ''}

${rulesKnowledgeSection}`
        : `Please create a complete ${isCantrip ? 'cantrip' : 'spell'} based on the user's synthesis requirements.

${SPELL_DESIGN_GUIDANCE}

**Key Requirements**:
- All text content must be in English (spell name, description, effects, etc.)
- description.value must be detailed and complete, using HTML format
- Rank is ${config.rank}, traditions must match specified requirements
- Power level matches the standard for this spell rank
${isCantrip ? '- **Must include "cantrip" trait in traits.value**\n- **Must include heightening field**: Set interval (usually 1 or 2), define auto-heightening rules\n- **Damage ~2d4 baseline**, noticeably weaker than regular rank 1 spells\n- **Effects must be suitable for unlimited casting**' : ''}

${rulesKnowledgeSection}`;
    }
    
    systemPrompt += isChinese
      ? `\n\n${DESCRIPTION_PRINCIPLE}\n\n${PF2E_FORMAT_STANDARD}\n\n${TECHNICAL_REQUIREMENTS}\n\n请使用提供的generateSpell函数返回完整的法术数据。`
      : `\n\n${DESCRIPTION_PRINCIPLE}\n\n${PF2E_FORMAT_STANDARD}\n\n${TECHNICAL_REQUIREMENTS}\n\nPlease use the provided generateSpell function to return complete spell data.`;
    
    // 构建user prompt，优先展示设计方案（如果有）
    let userPrompt = '';
    if (designPlan) {
      userPrompt += isChinese 
        ? `【设计方案】（重要！请严格遵循）\n\n`
        : `【Design Plan】(Important! Follow strictly)\n\n`;
      
      userPrompt += isChinese
        ? `法术名称：${designPlan.name}\n环级：${config.rank}\n施法传统：${config.traditions.join(', ')}\n`
        : `Spell Name: ${designPlan.name}\nRank: ${config.rank}\nTraditions: ${config.traditions.join(', ')}\n`;
      
      userPrompt += isChinese
        ? `\n【设计理念】：\n${designPlan.designRationale}\n`
        : `\n【Design Rationale】:\n${designPlan.designRationale}\n`;
      
      userPrompt += isChinese
        ? `\n【机制框架】（文字描述）：\n${designPlan.mechanicsFramework}\n`
        : `\n【Mechanic Framework】(Text description):\n${designPlan.mechanicsFramework}\n`;
      
      userPrompt += `\n---\n\n`;
      
      userPrompt += isChinese
        ? `请基于上述设计方案生成完整的法术数据。\n\n`
        : `Please generate complete spell data based on the above design plan.\n\n`;
      
      userPrompt += isChinese
        ? `**关键要求**：\n`
        : `**Key Requirements**:\n`;
      
      userPrompt += isChinese
        ? `1. 法术名称必须是"${designPlan.name}"（中文）\n`
        : `1. Spell name must be "${designPlan.name}" (Chinese)\n`;
      
      userPrompt += isChinese
        ? `2. 环级必须是${config.rank}\n`
        : `2. Rank must be ${config.rank}\n`;
      
      userPrompt += isChinese
        ? `3. 施法传统必须是${config.traditions.join(', ')}\n`
        : `3. Traditions must be ${config.traditions.join(', ')}\n`;
      
      userPrompt += isChinese
        ? `4. 根据机制框架的文字描述，**自行确定**所有技术参数（施法时间、范围、目标、持续时间、防御方式）\n`
        : `4. Based on the text mechanic framework, **determine yourself** all technical parameters (cast time, range, target, duration, defense)\n`;
      
      userPrompt += isChinese
        ? `5. 机制框架只描述"做什么"，你需要确定"如何做"（技术参数）和"数值多少"\n`
        : `5. Mechanic framework only describes "what to do", you determine "how to do" (technical params) and "how much" (values)\n`;
      
      userPrompt += isChinese
        ? `6. 编写详细的description.value，包含所有规则细节和具体数值\n`
        : `6. Write detailed description.value with all rule details and specific values\n`;
      
      userPrompt += isChinese
        ? `7. 特征（traits）由你根据法术效果确定（如fire、healing、mental、attack等）\n`
        : `7. Traits determined by you based on spell effects (fire, healing, mental, attack, etc.)\n`;
      
      userPrompt += isChinese
        ? `8. 设计升环规则（heightening），确保符合法术性质\n\n`
        : `8. Design heightening rules that match spell nature\n\n`;
      
      console.log('[生成阶段] 已优先展示设计方案');
    }
    
    userPrompt += isChinese
      ? `【合成材料】\n\n${prompt}`
      : `【Synthesis Materials】\n\n${prompt}`;
    
    if (!designPlan && materials.filter(m => m.type === 'offering').length > 0) {
      userPrompt += isChinese
        ? `\n\n**注意**：有模板法术可供参考，但请进行创造性调整，融合其他材料的特点。`
        : `\n\n**Note**: Template spells are available for reference, but please make creative adjustments and integrate features from other materials.`;
    }
    
    console.log(`法术生成语言: ${isChinese ? '中文' : '英文'} (系统语言: ${systemLang})`);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt }
    ];

    try {
      const model = this.getShrineModel('direct');
      console.log(`[法术生成] 使用模型: ${model}`);
      
      const response = await this.aiService.callService(
        messages,
        {
          model,
          temperature: 0.8,
          tools: [{
            type: 'function',
            function: SPELL_GENERATION_SCHEMA
          }],
          tool_choice: { type: 'function', function: { name: 'generateSpell' } }
        }
      );

      let spell = this.parseSpellResponse(response);
      spell = this.sanitizeGeneratedSpell(spell, config);
      
      return spell;
    } catch (error: any) {
      console.error('法术生成失败:', error);
      throw new Error(`法术生成失败: ${error?.message || '未知错误'}`);
    }
  }

  /**
   * 为法术生成图标提示词
   */
  private async generateIconPrompt(spell: PF2eSpellFormat): Promise<string | null> {
    try {
      const messages = [
        {
          role: 'system' as const,
          content: `你是一个专业的图标设计师。请为PF2e法术生成简洁的英文图标提示词，专注于视觉特征描述。

要求：
1. 使用简洁的英文描述
2. 专注于视觉元素：颜色、形状、材质、符号
3. 适合幻想风格的图标生成
4. 避免复杂的功能描述
5. 长度控制在50个单词以内

示例格式："glowing magical circle with arcane runes, blue energy emanating, fantasy spell icon"`
        },
        {
          role: 'user' as const,
          content: `请为以下法术生成图标提示词：
          
名称: ${spell.name}
描述: ${spell.system?.description?.value || ''}
特征: ${spell.system?.traits?.value?.join(', ') || ''}
环级: ${spell.system?.level?.value || 0}

请生成一个简洁的英文图标提示词。`
        }
      ];

      const model = this.getShrineModel('iconPrompt');
      console.log(`[法术图标提示词] 使用模型: ${model}`);
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
   * 解析法术响应
   */
  private parseSpellResponse(response: any): PF2eSpellFormat {
    try {
      console.log('原始AI响应:', response);
      
      // 如果响应是字符串，先解析
      if (typeof response === 'string') {
        response = JSON.parse(response);
      }
      
      // 检查是否有tool_calls格式的响应（新格式）
      if (response?.choices?.[0]?.message?.tool_calls?.[0]) {
        const toolCall = response.choices[0].message.tool_calls[0];
        const functionCall = toolCall.function;
        console.log('工具调用类型:', toolCall.type);
        console.log('函数调用名称:', functionCall.name);
        console.log('函数调用参数（原始）:', functionCall.arguments);
        console.log('参数类型:', typeof functionCall.arguments);
        
        // 解析函数调用的参数
        if (typeof functionCall.arguments === 'string') {
          try {
            // 尝试清理可能的多余字符
            let args = functionCall.arguments.trim();
            
            // 输出前100个字符用于调试
            console.log('参数前100字符:', args.substring(0, 100));
            
            // 如果有多行，尝试找到JSON部分
            if (args.includes('\n')) {
              console.log('检测到多行内容，尝试提取JSON部分');
              // 尝试找到第一个 { 和最后一个 }
              const firstBrace = args.indexOf('{');
              const lastBrace = args.lastIndexOf('}');
              if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                args = args.substring(firstBrace, lastBrace + 1);
              }
            }
            
            // 修复常见的JSON错误
            // 1. 修复错误的转义字符（如 \' 应该是 '）
            args = args.replace(/\\'/g, "'");
            // 2. 修复HTML实体（如果有）
            args = args.replace(/&quot;/g, '"');
            args = args.replace(/&amp;/g, '&');
            args = args.replace(/&lt;/g, '<');
            args = args.replace(/&gt;/g, '>');
            
            console.log('清理后准备解析');
            const parsed = JSON.parse(args);
            console.log('成功解析法术数据:', parsed.name);
            return parsed;
          } catch (parseError: any) {
            console.error('JSON解析失败');
            console.error('解析错误:', parseError.message);
            console.error('完整原始内容:', functionCall.arguments);
            
            // 尝试找到错误位置附近的内容
            if (parseError.message.includes('position')) {
              const match = parseError.message.match(/position (\d+)/);
              if (match) {
                const pos = parseInt(match[1]);
                const start = Math.max(0, pos - 50);
                const end = Math.min(functionCall.arguments.length, pos + 50);
                console.error('错误位置附近:', functionCall.arguments.substring(start, end));
                console.error('错误字符:', functionCall.arguments.charAt(pos));
              }
            }
            throw parseError;
          }
        }
        return functionCall.arguments;
      }
      
      // 检查是否有function_call格式的响应（旧格式，兼容）
      if (response?.choices?.[0]?.message?.function_call) {
        const functionCall = response.choices[0].message.function_call;
        console.log('检测到旧格式function_call');
        console.log('函数调用名称:', functionCall.name);
        console.log('函数调用参数（原始）:', functionCall.arguments);
        
        if (typeof functionCall.arguments === 'string') {
          try {
            let args = functionCall.arguments.trim();
            if (args.includes('\n')) {
              const firstBrace = args.indexOf('{');
              const lastBrace = args.lastIndexOf('}');
              if (firstBrace !== -1 && lastBrace !== -1) {
                args = args.substring(firstBrace, lastBrace + 1);
              }
            }
            args = args.replace(/\\'/g, "'");
            const parsed = JSON.parse(args);
            console.log('成功解析法术数据（旧格式）:', parsed.name);
            return parsed;
          } catch (parseError: any) {
            console.error('旧格式JSON解析失败:', parseError.message);
            throw parseError;
          }
        }
        return functionCall.arguments;
      }
      
      // 检查是否直接是法术数据
      if (response?.name || response?.type === 'spell') {
        return response;
      }
      
      // 如果有choices数组但不是function_call格式
      if (response?.choices?.[0]?.message?.content) {
        const content = response.choices[0].message.content;
        if (typeof content === 'string') {
          return JSON.parse(content);
        }
        return content;
      }
      
      console.error('无法识别的响应格式:', response);
      throw new Error('AI返回的法术数据格式不正确');
    } catch (error: any) {
      console.error('解析法术响应失败:', error);
      throw new Error(`AI返回的法术数据格式不正确: ${error.message}`);
    }
  }

  /**
   * 清理和验证生成的法术数据
   */
  private sanitizeGeneratedSpell(spell: PF2eSpellFormat, config: SpellSynthesisConfig): PF2eSpellFormat {
    const sanitized = { ...spell };

    // 确保基础字段
    if (!sanitized.type) sanitized.type = 'spell';
    if (!sanitized.img) sanitized.img = 'icons/magic/symbols/runes-star-pentagon-orange.webp';

    // 确保system字段
    if (!sanitized.system) sanitized.system = {} as any;
    
    // 确保描述
    if (!sanitized.system.description) {
      sanitized.system.description = { value: '法术描述' };
    }

    // 确保环级
    if (!sanitized.system.level) {
      sanitized.system.level = { value: config.rank };
    } else {
      sanitized.system.level.value = config.rank;
    }

    // 确保traits
    if (!sanitized.system.traits) {
      sanitized.system.traits = {
        traditions: config.traditions,
        value: [],
        rarity: 'common'
      };
    } else {
      if (!sanitized.system.traits.traditions || sanitized.system.traits.traditions.length === 0) {
        sanitized.system.traits.traditions = config.traditions;
      }
      if (!sanitized.system.traits.rarity) {
        sanitized.system.traits.rarity = 'common';
      }
    }

    // 确保施法时间
    if (!sanitized.system.time) {
      sanitized.system.time = { value: '2' };
    }

    // 🔴 验证：检查施法时间与触发条件的一致性（仅记录，不修改）
    this.validateCastingTimeConsistency(sanitized);

    // 清理可能的问题字段
    delete (sanitized as any)._id;
    delete (sanitized as any)._stats;

    return sanitized;
  }

  /**
   * 验证施法时间与触发条件的一致性（仅记录，不修改）
   * 核心规则：如果描述中包含触发条件，施法时间应该是reaction
   */
  private validateCastingTimeConsistency(spell: PF2eSpellFormat): void {
    const descriptionValue = spell.system?.description?.value || '';
    const castingTime = spell.system?.time?.value || '';
    const spellName = spell.name || '未命名法术';
    
    // 检查描述中是否包含触发关键词（中文和英文）
    const hasTrigger = /<strong>\s*触发\s*<\/strong>/i.test(descriptionValue) || 
                      /<strong>\s*Trigger\s*<\/strong>/i.test(descriptionValue) ||
                      /触发[:：]/i.test(descriptionValue) ||
                      /Trigger:/i.test(descriptionValue) ||
                      /当.*时.*你可以/i.test(descriptionValue) ||
                      /when.*you can/i.test(descriptionValue);
    
    if (hasTrigger) {
      console.log(`[施法时间验证] 法术"${spellName}"包含触发条件`);
      
      // 如果有触发条件，但施法时间不是reaction，记录错误
      if (castingTime !== 'reaction') {
        console.error(`[施法时间验证] ❌❌❌ 严重错误：法术"${spellName}"包含触发条件，但施法时间是"${castingTime}"`);
        console.error(`[施法时间验证] 这表明AI没有遵循设计流程！`);
        console.error(`[施法时间验证] 法术描述: ${descriptionValue.substring(0, 200)}...`);
        console.error(`[施法时间验证] 施法时间应该是: reaction，实际是: ${castingTime}`);
      } else {
        console.log(`[施法时间验证] ✅ 验证通过：法术"${spellName}"的施法时间"${castingTime}"与触发条件一致`);
      }
    } else {
      // 如果没有触发条件，但是施法时间是reaction，也记录警告
      if (castingTime === 'reaction') {
        console.warn(`[施法时间验证] ⚠️ 警告：法术"${spellName}"的施法时间是"reaction"，但描述中未找到明确的触发条件`);
        console.warn(`[施法时间验证] 建议：reaction法术应该在描述中明确写出触发条件`);
      } else {
        console.log(`[施法时间验证] ✅ 验证通过：法术"${spellName}"无触发条件，施法时间为"${castingTime}"`);
      }
    }
  }


  /**
   * 生成平衡性分析
   */
  private generateBalanceAnalysis(spell: PF2eSpellFormat, config: SpellSynthesisConfig): string {
    let analysis = `法术环级: ${config.rank}\n`;
    analysis += `施法传统: ${config.traditions.join(', ')}\n`;
    analysis += `施法时间: ${spell.system.time.value}\n`;
    
    if (spell.system.range?.value) {
      analysis += `范围: ${spell.system.range.value}\n`;
    }
    
    if (spell.system.duration?.value) {
      analysis += `持续时间: ${spell.system.duration.value}\n`;
    }
    
    analysis += '\n该法术已根据平衡关键词进行设计，确保强度适中。';
    
    return analysis;
  }

  /**
   * 是否应该生成图标
   */
  private shouldGenerateIcon(): boolean {
    try {
      const game = (window as any).game;
      return game?.settings?.get('ai-pf2e-assistant', 'enableIconGeneration') || false;
    } catch {
      return false;
    }
  }
}

