import { AIService } from './ai-service';
import { ShrineItemService } from './shrine-item-service';
import { ShrinePointService } from './shrine-point-service';
import {
  DESCRIPTION_PRINCIPLE,
  PF2E_FORMAT_STANDARD,
  TECHNICAL_REQUIREMENTS
} from './prompt-templates';

/**
 * 物品合成材料接口（与神龛合成材料相同结构）
 */
export interface EquipmentSynthesisMaterial {
  id: string;
  name: string;
  type: 'fragment' | 'divinity' | 'offering' | 'shrine';
  hiddenPrompt?: string;
  description: string;
  rarity?: string;
  deity?: string;
  aspect?: string;
  originalEquipmentData?: any;  // 物品贡品专用
  synthesisRequirements?: any;
  img?: string;
  originalItem?: any;
  // 贡品物品的子类型信息（用于推断合成结果的类型）
  offeringItemType?: string; // 对于装备贡品，保存其实际物品类型（如'weapon', 'armor', 'consumable'等）
}

/**
 * 物品合成配置接口
 */
export interface EquipmentSynthesisConfig {
  level: number;  // 物品等级 (0-20)
  equipmentType: 'weapon' | 'equipment' | 'consumable' | 'armor' | 'treasure';  // 物品类型
  equipmentCategory?: string;  // 物品子类别（如武器的 simple/martial/advanced）
  actorData?: any;
  shrineItem: EquipmentSynthesisMaterial;
  requiredTraits?: string[]; // 合成后必定携带的特征
}

/**
 * 物品合成结果接口
 */
export interface EquipmentSynthesisResult {
  equipment: PF2eEquipmentFormat;
  usedMaterials: EquipmentSynthesisMaterial[];
  balanceAnalysis: string;
  iconPrompt?: string;
}

/**
 * PF2e物品格式接口
 */
export interface PF2eEquipmentFormat {
  name: string;
  type: 'weapon' | 'equipment' | 'consumable' | 'armor' | 'treasure';
  img: string;
  system: {
    description: {
      value: string;
      gm?: string;
    };
    level: {
      value: number;
    };
    price: {
      value: {
        gp?: number;
        sp?: number;
        cp?: number;
      };
    };
    bulk: {
      value: number | string;  // 可以是数字或 'L' (light)
    };
    traits: {
      value: string[];
      rarity: 'common' | 'uncommon' | 'rare' | 'unique';
    };
    usage: {
      value: string;  // 'held-in-one-hand', 'held-in-two-hands', 'worn', etc.
    };
    // 武器特有属性
    damage?: {
      damageType: string;
      dice: number;
      die: string;
      persistent?: {
        faces: number;
        number: number;
        type: string;
      };
    };
    category?: string;  // 'simple', 'martial', 'advanced', 'unarmed'
    group?: string;  // 武器组：'sword', 'bow', etc.
    range?: number | null;
    runes?: {
      potency: number;
      property: string[];
      striking: number;
    };
    // 装备/护甲特有属性
    hardness?: number;
    hp?: {
      max: number;
      value: number;
    };
    // 消耗品特有属性
    consumableType?: {
      value: string;  // 'potion', 'scroll', 'talisman', 'elixir', etc.
    };
    charges?: {
      max: number;
      value: number;
    };
    // 护甲特有属性
    armor?: {
      value: number;  // AC bonus
    };
    dex?: {
      value: number;  // Dex cap
    };
    strength?: {
      value: number;  // Str requirement
    };
    checkPenalty?: {
      value: number;
    };
    speedPenalty?: {
      value: number;
    };
    // 通用属性
    baseItem?: string | null;
    containerId?: null;
    material?: {
      grade: string | null;
      type: string | null;
    };
    quantity?: number;
    rules?: any[];
    publication?: {
      license: string;
      remaster: boolean;
      title: string;
    };
    size?: string;
  };
}

/**
 * 物品生成的Function Calling Schema
 */
const EQUIPMENT_GENERATION_SCHEMA = {
  name: "generateEquipment",
  description: "生成一个完整的PF2e物品，包含所有必需字段",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "物品名称"
      },
      type: {
        type: "string",
        enum: ["weapon", "equipment", "consumable", "armor", "treasure"],
        description: "物品类型"
      },
      img: {
        type: "string",
        description: "物品图标路径"
      },
      system: {
        type: "object",
        properties: {
          description: {
            type: "object",
            properties: {
              value: {
                type: "string",
                description: "物品描述（HTML格式）"
              }
            },
            required: ["value"]
          },
          level: {
            type: "object",
            properties: {
              value: {
                type: "number",
                description: "物品等级 (0-20)"
              }
            },
            required: ["value"]
          },
          price: {
            type: "object",
            properties: {
              value: {
                type: "object",
                properties: {
                  gp: { type: "number" },
                  sp: { type: "number" },
                  cp: { type: "number" }
                }
              }
            },
            required: ["value"]
          },
          bulk: {
            type: "object",
            properties: {
              value: {
                type: ["number", "string"],
                description: "重量，可以是数字或'L'表示轻量"
              }
            },
            required: ["value"]
          },
          traits: {
            type: "object",
            properties: {
              value: {
                type: "array",
                items: { type: "string" },
                description: "物品特征"
              },
              rarity: {
                type: "string",
                enum: ["common", "uncommon", "rare", "unique"]
              }
            },
            required: ["value", "rarity"]
          },
          usage: {
            type: "object",
            properties: {
              value: {
                type: "string",
                description: "使用方式：held-in-one-hand, held-in-two-hands, worn等"
              }
            },
            required: ["value"]
          }
        },
        required: ["description", "level", "price", "bulk", "traits", "usage"]
      }
    },
    required: ["name", "type", "system"]
  }
};

/**
 * 物品合成服务
 * 负责基于神龛系统生成物品
 */
export class EquipmentSynthesisService {
  private aiService: AIService;

  constructor(aiService: AIService) {
    this.aiService = aiService;
  }

  /**
   * 从物品列表中提取合成材料
   */
  extractEquipmentMaterials(items: any[], knownTypes?: string[]): EquipmentSynthesisMaterial[] {
    const materials: EquipmentSynthesisMaterial[] = [];
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const traits = item.system?.traits?.value || [];
      
      let materialType: 'fragment' | 'divinity' | 'offering' | 'shrine' | null = null;
      
      if (knownTypes && knownTypes[i]) {
        materialType = knownTypes[i] as any;
      } else {
        if (traits.includes('碎片') || traits.includes('fragment')) {
          materialType = 'fragment';
        } else if (traits.includes('神性') || traits.includes('divinity')) {
          materialType = 'divinity';
        } else if (traits.includes('贡品') || traits.includes('offering')) {
          materialType = 'offering';
        } else if (traits.includes('神龛') || traits.includes('shrine')) {
          materialType = 'shrine';
        } else if (item.type === 'feat' || item.type === 'spell' || 
                   item.type === 'equipment' || item.type === 'weapon' || 
                   item.type === 'armor' || item.type === 'consumable') {
          // 专长、法术、装备类型的物品自动识别为贡品
          console.log(`物品合成：${item.type}物品自动识别为贡品`);
          materialType = 'offering';
        }
      }
      
      if (materialType) {
        const material: EquipmentSynthesisMaterial = {
          id: item.id || item._id,
          name: item.name,
          type: materialType,
          description: this.extractItemDescription(item),
          hiddenPrompt: item.system?.description?.gm || '',
          rarity: item.system?.traits?.rarity,
          img: item.img,
          originalItem: item
        };
        
        if (materialType === 'offering') {
          material.originalEquipmentData = {
            name: item.name,
            type: item.type,
            level: item.system?.level?.value,
            description: item.system?.description?.value,
            traits: item.system?.traits?.value || [],
            rarity: item.system?.traits?.rarity,
            price: item.system?.price?.value,
            bulk: item.system?.bulk?.value,
            usage: item.system?.usage?.value
          };
          
          // 提取贡品的物品类型（用于推断合成结果的类型）
          if (['equipment', 'weapon', 'armor', 'consumable'].includes(item.type)) {
            material.offeringItemType = item.type;
            console.log(`贡品"${item.name}"的物品类型: ${material.offeringItemType}`);
          }
        }
        
        if (materialType === 'shrine') {
          material.synthesisRequirements = ShrineItemService.extractSynthesisRequirements(item);
        }
        
        materials.push(material);
      }
    }
    
    return materials;
  }

  /**
   * 提取物品描述
   */
  private extractItemDescription(item: any): string {
    const desc = item.system?.description?.value || '';
    return desc.replace(/<[^>]*>/g, '').substring(0, 200);
  }

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
   */
  private parseRandomOptions(htmlContent: string): string {
    if (!htmlContent) return '';
    
    let result = htmlContent;
    const olRegex = /<ol[^>]*>([\s\S]*?)<\/ol>/gi;
    
    result = result.replace(olRegex, (match, olContent) => {
      const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      const options: string[] = [];
      let liMatch;
      
      while ((liMatch = liRegex.exec(olContent)) !== null) {
        const liContent = liMatch[1];
        const cleanContent = this.extractTextFromHtml(liContent);
        if (cleanContent.trim()) {
          options.push(cleanContent.trim());
        }
      }
      
      if (options.length === 0) {
        return '';
      }
      
      // 随机选择一个选项
      const randomIndex = Math.floor(Math.random() * options.length);
      const selectedOption = options[randomIndex];
      
      console.log(`[随机选项] 选择: 索引 ${randomIndex + 1}/${options.length} - "${selectedOption}"`);
      
      return '\n' + selectedOption + '\n';
    });
    
    return result;
  }

  /**
   * 处理包含随机选项的提示词
   */
  private processRandomPrompt(prompt: string): string {
    if (!prompt) return '';
    
    // 首先处理随机选项（在清理HTML之前）
    const withRandomResolved = this.parseRandomOptions(prompt);
    
    // 然后清理剩余的HTML标签
    const cleanText = this.extractTextFromHtml(withRandomResolved);
    
    return cleanText;
  }

  /**
   * 解析特色内容
   */
  private parseShrineFeatures(hiddenPrompt: string): {
    features?: string;
    guidance?: string;
    principles?: string;
  } {
    const result: any = {};
    
    if (!hiddenPrompt) return result;
    
    // 清理HTML标签
    const cleanText = this.extractTextFromHtml(hiddenPrompt);
    console.log('特色解析 - 清理后的文本:', cleanText);
    
    // 提取【神龛特色】或【核心特色】
    const featuresMatch = cleanText.match(/【(?:神龛特色|核心特色)】\s*([\s\S]*?)(?=【|$)/);
    if (featuresMatch) {
      result.features = featuresMatch[1].trim();
      console.log('提取到核心特色:', result.features);
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
   * 神龛物品合成
   * @param materials 合成材料（包含一个神龛）
   * @param config 合成配置
   * @returns 合成结果
   */
  async synthesizeEquipment(materials: EquipmentSynthesisMaterial[], config: EquipmentSynthesisConfig): Promise<EquipmentSynthesisResult> {
    console.log('开始物品神龛合成，材料数量:', materials.length, '配置:', config);

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

    // 构建物品合成提示词
    const synthesisPrompt = await this.buildEquipmentSynthesisPrompt(materials, config);
    
    // 生成物品（3步流程）
    const shouldGenerateIcon = this.shouldGenerateIcon();
    const equipment = await this.generateEquipmentDirect(
      synthesisPrompt,
      config,
      shouldGenerateIcon,
      materials
    );

    // 扣除神龛点数（如果需要，GM用户不消耗）
    if (!ShrinePointService.isGM()) {
      const consumed = await ShrinePointService.consumeActorPoints(config.actorData);
      if (!consumed) {
        console.warn('神龛点数消耗失败，但合成已完成');
      }
    }

    // 生成平衡性分析
    const balanceAnalysis = this.generateBalanceAnalysis(equipment, config);

    return {
      equipment: equipment,
      usedMaterials: materials,
      balanceAnalysis,
      iconPrompt: equipment.system.description.gm || undefined
    };
  }

  /**
   * 验证合成材料
   */
  private validateSynthesisMaterials(materials: EquipmentSynthesisMaterial[], shrineItem: EquipmentSynthesisMaterial): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!shrineItem || shrineItem.type !== 'shrine') {
      errors.push('缺少神龛物品');
    }
    
    const fragmentCount = materials.filter(m => m.type === 'fragment').length;
    const divinityCount = materials.filter(m => m.type === 'divinity').length;
    const offeringCount = materials.filter(m => m.type === 'offering').length;
    
    const requirements = shrineItem.synthesisRequirements;
    if (requirements) {
      if (requirements.fragment) {
        const { min = 0, max = 99 } = requirements.fragment;
        if (fragmentCount < min) errors.push(`碎片数量不足，至少需要${min}个`);
        if (fragmentCount > max) errors.push(`碎片数量过多，最多${max}个`);
      }
      
      if (requirements.divinity) {
        const { min = 0, max = 99 } = requirements.divinity;
        if (divinityCount < min) errors.push(`神性数量不足，至少需要${min}个`);
        if (divinityCount > max) errors.push(`神性数量过多，最多${max}个`);
      }
      
      if (requirements.offering) {
        const { min = 0, max = 99 } = requirements.offering;
        if (offeringCount < min) errors.push(`贡品数量不足，至少需要${min}个`);
        if (offeringCount > max) errors.push(`贡品数量过多，最多${max}个`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 构建物品合成提示词（用户提示词）
   */
  private async buildEquipmentSynthesisPrompt(materials: EquipmentSynthesisMaterial[], config: EquipmentSynthesisConfig): Promise<string> {
    const offerings = materials.filter(m => m.type === 'offering');
    const fragments = materials.filter(m => m.type === 'fragment');
    const divinities = materials.filter(m => m.type === 'divinity');
    const shrine = materials.find(m => m.type === 'shrine');

    console.log('材料分类结果:');
    console.log('- 要素(fragments):', fragments.map(f => `${f.name}(hasPrompt: ${!!f.hiddenPrompt})`));
    console.log('- 方向(divinities):', divinities.map(d => `${d.name}`));
    console.log('- 模板(offerings):', offerings.map(o => `${o.name}`));

    const hasOfferings = offerings.length > 0;
    const hasDivinities = divinities.length > 0;
    console.log(`提示词构建模式: ${hasOfferings ? '模板模式' : '设计模式'}`);
    
    let prompt = `# 物品合成任务\n\n`;
    prompt += `请基于以下材料和要求，${hasOfferings ? '调整和优化' : '设计'}一个${config.level}级的${this.getEquipmentTypeName(config.equipmentType)}。\n\n`;

    // 解析特色内容
    if (shrine) {
      const shrineFeatures = this.parseShrineFeatures(shrine.hiddenPrompt || shrine.description);
      console.log('解析特色:', shrineFeatures);
      
      if (shrineFeatures.guidance) {
        prompt += `## 【合成指导】\n\n`;
        prompt += `${shrineFeatures.guidance}\n\n`;
        console.log('添加合成指导到提示词开头');
      } else {
        prompt += `## 【合成指导】\n\n`;
        prompt += `${shrine.hiddenPrompt || shrine.description}\n\n`;
      }
      
      if (shrineFeatures.features) {
        prompt += `## 【核心特色】\n\n`;
        prompt += `${shrineFeatures.features}\n\n`;
        console.log('添加核心特色到提示词');
      }
      
      if (shrineFeatures.principles) {
        prompt += `## 【设计原则】\n\n`;
        prompt += `${shrineFeatures.principles}\n\n`;
        console.log('添加设计原则到提示词');
      }
    }

    // 核心模板物品
    if (hasOfferings) {
      console.log('[物品合成] 模板数量:', offerings.length);
      offerings.forEach((o, i) => {
        console.log(`[物品合成] 模板${i + 1}:`, {
          name: o.name,
          type: o.type,
          hasOriginalData: !!o.originalEquipmentData,
          descriptionLength: o.description?.length,
          hiddenPromptLength: o.hiddenPrompt?.length
        });
      });
      
      prompt += `## 【核心模板物品】\n\n`;
      prompt += `以下物品作为核心模板，具体如何使用由【合成指导】或【设计原则】决定（可以是结构模板、灵感来源或效果参考）：\n\n`;
      
      offerings.forEach((offering, index) => {
        prompt += `### 模板${index + 1} - ${offering.name}\n\n`;
        
        if (offering.originalEquipmentData) {
          if (offering.originalEquipmentData.level) {
            prompt += `**等级**: ${offering.originalEquipmentData.level}\n`;
          }
          if (offering.originalEquipmentData.type) {
            prompt += `**原始类型**: ${offering.originalEquipmentData.type}\n`;
          }
          // 显示完整描述
          if (offering.originalEquipmentData.description) {
            const cleanDesc = offering.originalEquipmentData.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            prompt += `**效果描述**:\n${cleanDesc}\n\n`;
          }
          if (offering.originalEquipmentData.traits && offering.originalEquipmentData.traits.length > 0) {
            prompt += `**特征**: ${offering.originalEquipmentData.traits.join(', ')}\n`;
          }
        } else {
          // 如果没有原始装备数据，使用提取的描述和隐藏提示词
          if (offering.description) {
            const cleanDesc = this.extractTextFromHtml(offering.description);
            prompt += `**效果描述**:\n${cleanDesc}\n`;
          }
          if (offering.hiddenPrompt) {
            const cleanHiddenPrompt = this.extractTextFromHtml(offering.hiddenPrompt);
            prompt += `\n**补充信息**:\n${cleanHiddenPrompt}\n`;
          }
        }
        prompt += `\n`;
      });
      
      prompt += `**注意**：核心模板物品的使用方式请参考【合成指导】或【设计原则】部分的说明。\n\n`;
    }

    // 调整指导方向
    console.log(`方向存在检查: ${hasDivinities ? '有方向' : '无方向'}`);
    
    if (hasDivinities) {
      prompt += `## 【调整指导方向】\n\n`;
      prompt += `以下机制指导定义了核心机制，你需要按照机制中需要填充的效果进行组合，无需在物品中复述其中提到的任何机制概念：\n\n`;
      
      divinities.forEach((divinity, index) => {
        prompt += `### 方向${index + 1} - ${divinity.name}\n\n`;
        const cleanHiddenPrompt = this.processRandomPrompt(divinity.hiddenPrompt || divinity.description);
        prompt += `${cleanHiddenPrompt}\n\n`;
      });
      
      if (divinities.length > 1) {
        prompt += `**注意**：如有多个指导方向，请合理整合它们的特点，创造出有趣的互动效果。\n\n`;
      }
      
      prompt += `**重要说明**：调整指导方向所述机制皆为已有机制概念，你只需要按照机制中需要填充的效果进行组合即可，无需在物品中复述其中提到的任何机制概念名称。\n\n`;
    }

    // 补充设计要素
    if (fragments.length > 0) {
      prompt += `## 【补充设计要素】\n\n`;
      prompt += `以下要素提供可选的效果内容，可以是效果的方向指引，也可以是具体的效果内容：\n\n`;
      
      fragments.forEach((fragment, index) => {
        prompt += `### 要素${index + 1} - ${fragment.name}\n\n`;
        const cleanHiddenPrompt = this.processRandomPrompt(fragment.hiddenPrompt || fragment.description);
        prompt += `${cleanHiddenPrompt}\n\n`;
      });
      
      prompt += `**使用方式**：选择合适的设计要素融入物品中，可以作为主要效果、次要效果或触发条件的一部分。\n\n`;
    }

    // 物品要求
    prompt += `## 【物品要求】\n\n`;
    prompt += `- **等级**: ${config.level}\n`;
    prompt += `- **类型**: ${this.getEquipmentTypeName(config.equipmentType)}\n`;
    if (config.equipmentCategory) {
      prompt += `- **类别**: ${config.equipmentCategory}\n`;
    }

    return prompt;
  }

  /**
   * 获取物品类型名称
   */
  private getEquipmentTypeName(type: string): string {
    const typeNames: { [key: string]: string } = {
      'weapon': '武器',
      'equipment': '装备',
      'consumable': '消耗品',
      'armor': '护甲',
      'treasure': '宝物'
    };
    return typeNames[type] || type;
  }

  /**
   * 直接生成物品（3步流程：设计→生成→图标）
   */
  private async generateEquipmentDirect(
    synthesisPrompt: string,
    config: EquipmentSynthesisConfig,
    shouldGenerateIcon: boolean,
    materials: EquipmentSynthesisMaterial[]
  ): Promise<PF2eEquipmentFormat> {
    console.log('开始物品生成流程（直接生成）');

    // 直接生成物品，不需要单独的设计阶段
    const generationSystemPrompt = this.buildGenerationSystemPrompt(config);
    
    // 输出提示词用于调试
    console.log('=== 物品生成系统提示词 ===');
    console.log(generationSystemPrompt);
    console.log('=== 系统提示词结束 ===');
    console.log('');
    console.log('=== 物品合成用户提示词 ===');
    console.log(synthesisPrompt);
    console.log('=== 用户提示词结束 ===');
    
    const combinedMessages = [
      { role: 'system', content: generationSystemPrompt },
      { role: 'user', content: synthesisPrompt }
    ];

    let equipment: PF2eEquipmentFormat;
    
    try {
      const functionCallResponse = await this.aiService.callService(
        combinedMessages,
        {
          temperature: 0.7,
          tools: [{
            type: 'function',
            function: EQUIPMENT_GENERATION_SCHEMA
          }],
          tool_choice: { type: 'function', function: { name: 'generateEquipment' } }
        }
      );

      // 尝试从tool_calls解析（GPT新格式）
      if (functionCallResponse.choices?.[0]?.message?.tool_calls?.[0]) {
        const toolCall = functionCallResponse.choices[0].message.tool_calls[0];
        console.log('检测到GPT tool_calls格式');
        equipment = JSON.parse(toolCall.function.arguments) as PF2eEquipmentFormat;
        console.log('Function calling成功生成物品（tool_calls）');
      }
      // 尝试从function_call解析（GPT旧格式）
      else if (functionCallResponse.choices?.[0]?.message?.function_call) {
        const functionCall = functionCallResponse.choices[0].message.function_call;
        console.log('检测到GPT function_call格式');
        equipment = JSON.parse(functionCall.arguments) as PF2eEquipmentFormat;
        console.log('Function calling成功生成物品（function_call）');
      } else {
        throw new Error('AI未返回function call');
      }
    } catch (error) {
      console.error('Function calling失败，使用fallback方法:', error);
      equipment = await this.generateEquipmentFallback(combinedMessages, config);
    }

    // 数据验证和格式修复
    equipment = this.validateAndFixEquipmentData(equipment);
    
    // 后处理：确保必需字段存在
    equipment = this.postProcessEquipment(equipment, config);

    // 应用必定携带的特征
    if (config.requiredTraits && config.requiredTraits.length > 0) {
      if (!equipment.system.traits) {
        equipment.system.traits = { value: [], rarity: 'common', otherTags: [] };
      }
      if (!equipment.system.traits.value) {
        equipment.system.traits.value = [];
      }
      
      // 添加必定携带的特征（避免重复）
      for (const trait of config.requiredTraits) {
        if (!equipment.system.traits.value.includes(trait)) {
          equipment.system.traits.value.push(trait);
          console.log(`[generateEquipmentDirect] ✓ 添加必定携带的特征: "${trait}"`);
        }
      }
    }

    // 图标生成（如果需要）
    if (shouldGenerateIcon && !equipment.img) {
      console.log('生成物品图标提示词');
      equipment.img = await this.generateIconPrompt(equipment);
    }

    return equipment;
  }


  /**
   * 构建生成阶段的系统提示词
   */
  private buildGenerationSystemPrompt(config: EquipmentSynthesisConfig): string {
    const hasTemplates = false; // 将在调用时传入
    
    return `你是一个专业的Pathfinder 2e物品设计师。你的角色是根据合成材料创造独特的魔法物品。

**🌏 语言要求（最高优先级）**：
- **物品名称（name字段）必须使用中文，绝对不要使用英文**
- 所有描述内容（description.value）必须使用中文

---

## 你的职责

${hasTemplates ? `**你有模板物品作为参考**：

1. **理解合成材料的主题**
   - 核心特色定义了物品的主要概念
   - 调整指导方向提供了机制框架
   - 补充设计要素提供了额外的效果方向

2. **创造性地使用模板**
   - 不要简单复制模板物品的效果
   - 结合调整指导方向的机制进行创新
   - 融合补充设计要素的特点
   - 确保效果与${config.level}级物品匹配

3. **编写完整的描述**
   - description.value必须详细描述所有规则
   - 包含激活方式、频次限制、效果细节
   - 使用HTML格式（<p>标签等）
   - **内联骰子格式**（如反制检定）：使用 [[/r 1d20+6 #Counteract]]{+6} 格式
     - 确保所有括号正确配对：[[ ]] 和 { }
     - 示例：[[/r 1d20+9 #Counteract]]{+9}
     - **禁止**错误格式如 {(1d20+6}}（括号不匹配）

4. **设置合理的数值**
   - 参考同等级官方物品
   - 确保价格、效果强度匹配等级

**关键原则**：参考模板结构，但要创造出新的、独特的物品。` : `**你需要从头设计物品**：

1. **理解合成材料的主题**
   - 核心特色定义了物品的核心概念
   - 调整指导方向提供了机制框架
   - 补充设计要素提供了效果内容

2. **选择合适的机制**
   - 根据主题确定激活方式（持续、激活、投资等）
   - 确定频次限制（每日、每小时、无限制等）
   - 确保机制与${config.level}级物品匹配

3. **编写完整的描述**
   - description.value必须包含所有规则细节
   - 使用正确的PF2e术语和格式
   - 使用HTML格式（<p>标签等）
   - **内联骰子格式**（如反制检定）：使用 [[/r 1d20+6 #Counteract]]{+6} 格式
     - 确保所有括号正确配对：[[ ]] 和 { }
     - 示例：[[/r 1d20+9 #Counteract]]{+9}
     - **禁止**错误格式如 {(1d20+6}}（括号不匹配）

4. **设置合理数值**
   - 参考同等级官方物品的强度
   - 确保平衡性`}

---

# 物品类型：${this.getEquipmentTypeName(config.equipmentType)}

${this.getTypeSpecificGuidance(config.equipmentType)}

# 价格指导

根据等级的参考价格（金币）：
- 1级: 3-20gp | 2级: 20-50gp | 3级: 40-100gp | 4级: 80-200gp
- 5级: 120-400gp | 6级: 200-600gp | 7级: 300-900gp | 8级: 450-1,300gp
- 9级: 600-2,000gp | 10级: 900-3,000gp | 11级: 1,300-4,500gp | 12级: 1,800-6,500gp
- 13级: 2,700-10,000gp | 14级: 4,000-15,000gp | 15级: 6,000-22,000gp | 16级: 9,000-32,000gp
- 17级: 13,000-48,000gp | 18级: 20,000-70,000gp | 19级: 30,000-105,000gp | 20级: 45,000-160,000gp

消耗品价格通常是同等级永久物品的1/4到1/2。

---

# 技术要求

1. **必需字段**：确保所有必需字段都存在
2. **类型正确**：字段类型必须匹配schema定义
3. **合理数值**：等级、价格、属性值要合理
4. **HTML格式**：description.value使用HTML格式（<p>标签等）
5. **特征完整**：traits.value应包含相关特征（magical等）

现在请调用generateEquipment函数生成完整的物品数据。`;
  }

  /**
   * 获取特定类型的生成指导
   */
  private getTypeSpecificGuidance(type: string): string {
    switch (type) {
      case 'weapon':
        return `武器必需字段：
- system.damage: { damageType, dice, die }
- system.category: 'simple', 'martial', 'advanced', 'unarmed'
- system.group: 武器组（sword, bow, club等）
- system.runes: { potency, property: [], striking }
- system.range: 近战武器用null，远程武器用数字（如20, 60等）
- system.usage.value: 'held-in-one-hand' 或 'held-in-two-hands'
- 特征应包含武器相关特征（finesse, deadly, reach, versatile等）`;
      
      case 'armor':
        return `护甲必需字段：
- system.armor.value: AC加值
- system.dex.value: 敏捷上限
- system.strength.value: 力量需求（可以是0）
- system.checkPenalty.value: 检定减值（通常是负数或0）
- system.speedPenalty.value: 速度减值（通常是0或负数）
- system.hardness: 护甲硬度
- system.hp: { max, value }
- system.usage.value: 'worn'
- system.category: 'light', 'medium', 'heavy'`;
      
      case 'consumable':
        return `消耗品必需字段：
- system.consumableType.value: 'potion', 'scroll', 'talisman', 'elixir', 'oil', 'ammunition'等
- system.charges: { max: 1, value: 1 } （通常是1）
- system.usage.value: 根据类型（potion是'held-in-one-hand'，talisman是'affixed-to-armor'等）
- 特征应包含'consumable'和类型特征`;
      
      case 'equipment':
        return `装备必需字段：
- system.usage.value: 'worn' (大多数饰品), 'held-in-one-hand', 'held-in-two-hands'等
- 如果是坚固物品，需要system.hardness和system.hp
- 特征应包含'magical'和位置特征（如'invested'表示需要灌注）`;
      
      case 'treasure':
        return `宝物必需字段：
- 价格可能很高或者使用特殊货币
- 通常是unique稀有度
- 可能有story背景
- system.usage.value根据具体形态`;
      
      default:
        return '';
    }
  }

  /**
   * Fallback方法：解析JSON
   */
  private async generateEquipmentFallback(messages: any[], config: EquipmentSynthesisConfig): Promise<PF2eEquipmentFormat> {
    const fallbackPrompt = '请按照schema生成完整的物品JSON数据。只输出JSON，不要其他文字。';
    messages.push({ role: 'user', content: fallbackPrompt });
    
    const response = await this.aiService.callService(messages, { temperature: 0.5 });
    
    // 从API响应中提取内容
    let content: string;
    if (response.choices?.[0]?.message?.content) {
      content = response.choices[0].message.content;
    } else if (typeof response === 'string') {
      content = response;
    } else {
      throw new Error('无法从API响应中提取内容');
    }
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('无法从AI响应中提取JSON数据');
    }
    
    return JSON.parse(jsonMatch[0]);
  }

  /**
   * 验证并修复物品数据格式
   * 确保所有字段都符合PF2e的数据类型要求
   */
  private validateAndFixEquipmentData(equipment: any): PF2eEquipmentFormat {
    console.log('[数据验证] 开始验证物品数据格式');
    
    // 修复名称
    if (typeof equipment.name !== 'string') {
      equipment.name = String(equipment.name || '未命名物品');
    }
    
    // 修复类型
    const validTypes = ['weapon', 'equipment', 'consumable', 'armor', 'treasure'];
    if (!validTypes.includes(equipment.type)) {
      console.warn(`[数据验证] 无效的物品类型: ${equipment.type}，使用默认值 equipment`);
      equipment.type = 'equipment';
    }
    
    // 修复图标
    if (typeof equipment.img !== 'string' || !equipment.img) {
      equipment.img = this.getDefaultIcon(equipment.type);
    }
    
    // 确保system对象存在
    if (!equipment.system || typeof equipment.system !== 'object') {
      equipment.system = {};
    }
    
    const sys = equipment.system;
    
    // 修复描述
    if (!sys.description || typeof sys.description !== 'object') {
      sys.description = {};
    }
    if (typeof sys.description.value !== 'string') {
      sys.description.value = String(sys.description.value || '<p>物品描述</p>');
    }
    // GM描述应该为空字符串或不存在
    if (sys.description.gm && typeof sys.description.gm !== 'string') {
      sys.description.gm = '';
    }
    
    // 修复等级
    if (!sys.level || typeof sys.level !== 'object') {
      sys.level = { value: 1 };
    }
    if (typeof sys.level.value !== 'number' || isNaN(sys.level.value)) {
      const parsed = parseInt(String(sys.level.value));
      sys.level.value = isNaN(parsed) ? 1 : Math.max(0, Math.min(20, parsed));
    }
    
    // 修复价格
    if (!sys.price || typeof sys.price !== 'object') {
      sys.price = { value: {} };
    }
    if (!sys.price.value || typeof sys.price.value !== 'object') {
      sys.price.value = {};
    }
    // 确保货币值都是数字
    ['gp', 'sp', 'cp'].forEach(currency => {
      if (sys.price.value[currency] !== undefined) {
        const val = parseFloat(String(sys.price.value[currency]));
        sys.price.value[currency] = isNaN(val) ? 0 : Math.max(0, val);
      }
    });
    
    // 修复重量（bulk）- 可以是数字或 'L'
    if (!sys.bulk || typeof sys.bulk !== 'object') {
      sys.bulk = { value: 0 };
    }
    if (sys.bulk.value === 'L' || sys.bulk.value === 'l') {
      sys.bulk.value = 'L';  // 标准化为大写
    } else if (sys.bulk.value === '-' || sys.bulk.value === 'negligible') {
      sys.bulk.value = 0;
    } else if (typeof sys.bulk.value === 'string') {
      const parsed = parseFloat(sys.bulk.value);
      sys.bulk.value = isNaN(parsed) ? 0 : parsed;
    } else if (typeof sys.bulk.value !== 'number' || isNaN(sys.bulk.value)) {
      sys.bulk.value = 0;
    }
    
    // 修复特征
    if (!sys.traits || typeof sys.traits !== 'object') {
      sys.traits = { value: [], rarity: 'common' };
    }
    if (!Array.isArray(sys.traits.value)) {
      sys.traits.value = [];
    }
    sys.traits.value = sys.traits.value.filter((t: any) => typeof t === 'string');
    const validRarities = ['common', 'uncommon', 'rare', 'unique'];
    if (!validRarities.includes(sys.traits.rarity)) {
      sys.traits.rarity = 'common';
    }
    
    // 修复使用方式
    if (!sys.usage || typeof sys.usage !== 'object') {
      sys.usage = { value: 'held-in-one-hand' };
    }
    if (typeof sys.usage.value !== 'string') {
      sys.usage.value = 'held-in-one-hand';
    }
    
    // 修复数量
    if (typeof sys.quantity !== 'number' || isNaN(sys.quantity)) {
      const parsed = parseInt(String(sys.quantity));
      sys.quantity = isNaN(parsed) ? 1 : Math.max(1, parsed);
    }
    
    // 修复规则数组
    if (!Array.isArray(sys.rules)) {
      sys.rules = [];
    }
    
    // 修复尺寸
    const validSizes = ['tiny', 'sm', 'med', 'lg', 'huge', 'grg'];
    if (!validSizes.includes(sys.size)) {
      sys.size = 'med';
    }
    
    // 修复材质
    if (!sys.material || typeof sys.material !== 'object') {
      sys.material = { grade: null, type: null };
    }
    
    // 类型特定的数据验证
    this.validateTypeSpecificData(equipment);
    
    console.log('[数据验证] 数据验证完成');
    return equipment as PF2eEquipmentFormat;
  }
  
  /**
   * 验证类型特定的数据
   */
  private validateTypeSpecificData(equipment: any): void {
    const sys = equipment.system;
    
    switch (equipment.type) {
      case 'weapon':
        // 修复伤害
        if (sys.damage) {
          if (typeof sys.damage !== 'object') sys.damage = {};
          if (typeof sys.damage.dice !== 'number') {
            const parsed = parseInt(String(sys.damage.dice));
            sys.damage.dice = isNaN(parsed) ? 1 : Math.max(1, parsed);
          }
          if (typeof sys.damage.die !== 'string' || !sys.damage.die.match(/^d\d+$/)) {
            sys.damage.die = 'd6';
          }
          if (typeof sys.damage.damageType !== 'string') {
            sys.damage.damageType = 'bludgeoning';
          }
        }
        
        // 修复符文
        if (sys.runes) {
          if (typeof sys.runes !== 'object') sys.runes = {};
          if (typeof sys.runes.potency !== 'number') sys.runes.potency = 0;
          if (typeof sys.runes.striking !== 'number') sys.runes.striking = 0;
          if (!Array.isArray(sys.runes.property)) sys.runes.property = [];
        }
        
        // 修复射程
        if (sys.range !== null && sys.range !== undefined) {
          if (typeof sys.range !== 'number') {
            const parsed = parseInt(String(sys.range));
            sys.range = isNaN(parsed) ? null : parsed;
          }
        }
        break;
      
      case 'armor':
        // 修复护甲值
        if (sys.armor) {
          if (typeof sys.armor !== 'object') sys.armor = { value: 0 };
          if (typeof sys.armor.value !== 'number') {
            const parsed = parseInt(String(sys.armor.value));
            sys.armor.value = isNaN(parsed) ? 0 : parsed;
          }
        }
        
        // 修复敏捷上限
        if (sys.dex) {
          if (typeof sys.dex !== 'object') sys.dex = { value: 5 };
          if (typeof sys.dex.value !== 'number') {
            const parsed = parseInt(String(sys.dex.value));
            sys.dex.value = isNaN(parsed) ? 5 : parsed;
          }
        }
        
        // 修复力量需求
        if (sys.strength) {
          if (typeof sys.strength !== 'object') sys.strength = { value: 0 };
          if (typeof sys.strength.value !== 'number') {
            const parsed = parseInt(String(sys.strength.value));
            sys.strength.value = isNaN(parsed) ? 0 : parsed;
          }
        }
        
        // 修复检定惩罚
        if (sys.checkPenalty) {
          if (typeof sys.checkPenalty !== 'object') sys.checkPenalty = { value: 0 };
          if (typeof sys.checkPenalty.value !== 'number') {
            const parsed = parseInt(String(sys.checkPenalty.value));
            sys.checkPenalty.value = isNaN(parsed) ? 0 : parsed;
          }
        }
        
        // 修复速度惩罚
        if (sys.speedPenalty) {
          if (typeof sys.speedPenalty !== 'object') sys.speedPenalty = { value: 0 };
          if (typeof sys.speedPenalty.value !== 'number') {
            const parsed = parseInt(String(sys.speedPenalty.value));
            sys.speedPenalty.value = isNaN(parsed) ? 0 : parsed;
          }
        }
        break;
      
      case 'consumable':
        // 修复消耗品类型
        if (sys.consumableType) {
          if (typeof sys.consumableType !== 'object') sys.consumableType = { value: 'other' };
          if (typeof sys.consumableType.value !== 'string') {
            sys.consumableType.value = 'other';
          }
        }
        
        // 修复充能
        if (sys.charges) {
          if (typeof sys.charges !== 'object') sys.charges = { max: 1, value: 1 };
          if (typeof sys.charges.max !== 'number') {
            const parsed = parseInt(String(sys.charges.max));
            sys.charges.max = isNaN(parsed) ? 1 : Math.max(1, parsed);
          }
          if (typeof sys.charges.value !== 'number') {
            const parsed = parseInt(String(sys.charges.value));
            sys.charges.value = isNaN(parsed) ? sys.charges.max : Math.min(sys.charges.max, parsed);
          }
        }
        break;
    }
    
    // 修复硬度和HP（所有物品都可能有）
    if (sys.hardness !== undefined && sys.hardness !== null) {
      if (typeof sys.hardness !== 'number') {
        const parsed = parseInt(String(sys.hardness));
        sys.hardness = isNaN(parsed) ? 0 : Math.max(0, parsed);
      }
    }
    
    if (sys.hp) {
      if (typeof sys.hp !== 'object') sys.hp = { max: 10, value: 10 };
      if (typeof sys.hp.max !== 'number') {
        const parsed = parseInt(String(sys.hp.max));
        sys.hp.max = isNaN(parsed) ? 10 : Math.max(1, parsed);
      }
      if (typeof sys.hp.value !== 'number') {
        const parsed = parseInt(String(sys.hp.value));
        sys.hp.value = isNaN(parsed) ? sys.hp.max : Math.max(0, Math.min(sys.hp.max, parsed));
      }
    }
  }

  /**
   * 后处理：确保必需字段
   */
  private postProcessEquipment(equipment: PF2eEquipmentFormat, config: EquipmentSynthesisConfig): PF2eEquipmentFormat {
    // 强制设置物品类型（从神龛配置）
    equipment.type = config.equipmentType;
    
    if (!equipment.img) {
      equipment.img = this.getDefaultIcon(config.equipmentType);
    }
    
    if (!equipment.system) {
      equipment.system = {} as any;
    }
    
    // 确保等级
    if (!equipment.system.level) {
      equipment.system.level = { value: config.level };
    }
    
    // 确保价格
    if (!equipment.system.price) {
      equipment.system.price = { value: { gp: this.getDefaultPrice(config.level, config.equipmentType) } };
    }
    
    // 确保重量
    if (!equipment.system.bulk) {
      equipment.system.bulk = { value: this.getDefaultBulk(config.equipmentType) };
    }
    
    // 确保特征
    if (!equipment.system.traits) {
      equipment.system.traits = { value: ['magical'], rarity: 'uncommon' };
    }
    
    // 确保使用方式
    if (!equipment.system.usage) {
      equipment.system.usage = { value: this.getDefaultUsage(config.equipmentType) };
    }
    
    // 确保通用字段
    if (equipment.system.baseItem === undefined) equipment.system.baseItem = null;
    if (equipment.system.containerId === undefined) equipment.system.containerId = null;
    if (!equipment.system.material) equipment.system.material = { grade: null, type: null };
    if (equipment.system.quantity === undefined) equipment.system.quantity = 1;
    if (!equipment.system.rules) equipment.system.rules = [];
    if (!equipment.system.size) equipment.system.size = 'med';
    
    // 类型特定的后处理
    this.postProcessByType(equipment, config);
    
    return equipment;
  }

  /**
   * 按类型后处理
   */
  private postProcessByType(equipment: PF2eEquipmentFormat, config: EquipmentSynthesisConfig): void {
    switch (config.equipmentType) {
      case 'weapon':
        if (!equipment.system.damage) {
          equipment.system.damage = {
            damageType: 'bludgeoning',
            dice: 1,
            die: 'd6'
          };
        }
        if (!equipment.system.category) {
          equipment.system.category = config.equipmentCategory || 'simple';
        }
        if (!equipment.system.group) {
          equipment.system.group = 'club';
        }
        if (!equipment.system.runes) {
          equipment.system.runes = { potency: 0, property: [], striking: 0 };
        }
        if (equipment.system.range === undefined) {
          equipment.system.range = null;
        }
        break;
      
      case 'armor':
        if (!equipment.system.armor) {
          equipment.system.armor = { value: 2 };
        }
        if (!equipment.system.dex) {
          equipment.system.dex = { value: 5 };
        }
        if (!equipment.system.strength) {
          equipment.system.strength = { value: 0 };
        }
        if (!equipment.system.checkPenalty) {
          equipment.system.checkPenalty = { value: 0 };
        }
        if (!equipment.system.speedPenalty) {
          equipment.system.speedPenalty = { value: 0 };
        }
        if (equipment.system.hardness === undefined) {
          equipment.system.hardness = 5;
        }
        if (!equipment.system.hp) {
          equipment.system.hp = { max: 20, value: 20 };
        }
        break;
      
      case 'consumable':
        if (!equipment.system.consumableType) {
          equipment.system.consumableType = { value: 'potion' };
        }
        if (!equipment.system.charges) {
          equipment.system.charges = { max: 1, value: 1 };
        }
        break;
      
      case 'equipment':
        // 装备可能需要硬度和HP（如果是可破坏的）
        if (equipment.system.hardness === undefined) {
          equipment.system.hardness = 0;
        }
        if (!equipment.system.hp) {
          equipment.system.hp = { max: 0, value: 0 };
        }
        break;
    }
  }

  /**
   * 获取默认图标
   */
  private getDefaultIcon(type: string): string {
    const icons: { [key: string]: string } = {
      'weapon': 'systems/pf2e/icons/default-icons/weapon.svg',
      'armor': 'systems/pf2e/icons/default-icons/armor.svg',
      'equipment': 'icons/containers/bags/coinpouch-leather-orange.webp',
      'consumable': 'systems/pf2e/icons/default-icons/consumable.svg',
      'treasure': 'systems/pf2e/icons/default-icons/treasure.svg'
    };
    return icons[type] || 'icons/containers/bags/coinpouch-leather-orange.webp';
  }

  /**
   * 获取默认价格
   */
  private getDefaultPrice(level: number, type: string): number {
    const basePrices = [0, 10, 35, 70, 140, 260, 400, 600, 850, 1300, 
                        2000, 2900, 4200, 6500, 10000, 14000, 21000, 30000, 45000, 67500, 100000];
    let price = basePrices[level] || 100;
    
    // 消耗品价格减半
    if (type === 'consumable') {
      price = Math.floor(price / 2);
    }
    
    return price;
  }

  /**
   * 获取默认重量
   */
  private getDefaultBulk(type: string): number | string {
    const bulks: { [key: string]: number | string } = {
      'weapon': 1,
      'armor': 2,
      'equipment': 'L',
      'consumable': 'L',
      'treasure': 'L'
    };
    return bulks[type] || 'L';
  }

  /**
   * 获取默认使用方式
   */
  private getDefaultUsage(type: string): string {
    const usages: { [key: string]: string } = {
      'weapon': 'held-in-one-hand',
      'armor': 'worn',
      'equipment': 'worn',
      'consumable': 'held-in-one-hand',
      'treasure': 'held-in-one-hand'
    };
    return usages[type] || 'held-in-one-hand';
  }

  /**
   * 生成图标提示词
   */
  private async generateIconPrompt(equipment: PF2eEquipmentFormat): Promise<string> {
    // 简单返回默认图标，实际的图标生成需要更复杂的逻辑
    return this.getDefaultIcon(equipment.type);
  }

  /**
   * 生成平衡性分析
   */
  private generateBalanceAnalysis(equipment: PF2eEquipmentFormat, config: EquipmentSynthesisConfig): string {
    let analysis = `# ${equipment.name} 平衡性分析\n\n`;
    analysis += `**等级**: ${equipment.system.level.value}\n`;
    analysis += `**类型**: ${this.getEquipmentTypeName(equipment.type)}\n`;
    analysis += `**稀有度**: ${equipment.system.traits.rarity}\n`;
    
    const price = equipment.system.price.value.gp || 0;
    analysis += `**价格**: ${price} gp\n\n`;
    
    analysis += `## 平衡性评估\n\n`;
    
    const expectedPrice = this.getDefaultPrice(config.level, config.equipmentType);
    if (price < expectedPrice * 0.5) {
      analysis += `⚠️ 价格可能偏低，建议调整至 ${Math.floor(expectedPrice * 0.7)}-${Math.floor(expectedPrice * 1.3)} gp\n\n`;
    } else if (price > expectedPrice * 2) {
      analysis += `⚠️ 价格可能偏高，建议调整至 ${Math.floor(expectedPrice * 0.7)}-${Math.floor(expectedPrice * 1.3)} gp\n\n`;
    } else {
      analysis += `✓ 价格合理，符合等级期望\n\n`;
    }
    
    analysis += `## 特征\n\n`;
    analysis += `${equipment.system.traits.value.join(', ')}\n\n`;
    
    return analysis;
  }

  /**
   * 是否应该生成图标
   */
  private shouldGenerateIcon(): boolean {
    const game = (globalThis as any).game;
    return game?.settings?.get('ai-pf2e-assistant', 'enableIconGeneration') || false;
  }
}

