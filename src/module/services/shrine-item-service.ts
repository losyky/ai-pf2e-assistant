import { AIService } from './ai-service';

/**
 * 神性物品数据接口
 */
export interface DivinityData {
  name: string;
  description: string;
  hiddenPrompt: string;
  deity: string; // 对应的神明
  aspect: string; // 神性方面（如战争、智慧、自然等）
  rarity?: 'common' | 'uncommon' | 'rare' | 'unique';
}

/**
 * 贡品物品数据接口
 */
export interface OfferingData {
  name: string;
  description: string;
  hiddenPrompt: string;
  originalFeatData?: any; // 原始专长数据（可选，用于专长贡品）
  originalSpellData?: any; // 原始法术数据（可选，用于法术贡品）
  rarity?: 'common' | 'uncommon' | 'rare' | 'unique';
}

/**
 * 神龛物品数据接口
 */
export interface ShrineData {
  name: string;
  description: string;
  hiddenPrompt: string;
  synthesisRequirements: {
    fragments: { min: number; max?: number };
    offerings: { min: number; max?: number };
    divinities: { min: number; max?: number };
  };
  deity: string; // 对应的神明
  rarity?: 'common' | 'uncommon' | 'rare' | 'unique';
  useRulesKnowledge?: boolean; // 是否在生成时调用PF2e规则机制知识库（默认false）
}

/**
 * 神龛物品格式接口
 */
export interface PF2eShrineItemFormat {
  name: string;
  type: "equipment";
  img: string;
  system: {
    description: {
      value: string;
      gm: string;
    };
    traits: {
      value: string[];
      rarity: "common" | "uncommon" | "rare" | "unique";
      otherTags: string[];
    };
    quantity: number;
    weight: { value: number };
    price: { value: { gp?: number } };
    level: { value: number };
    usage: { value: string };
    category: string;
    group: null;
    hands: null;
    bulk: { value: number };
    activated: null;
    rules: any[];
  };
  effects: any[];
  folder: null;
  flags: {
    'ai-pf2e-assistant': {
      itemType: 'divinity' | 'offering' | 'shrine';
      hiddenPrompt: string;
      synthesisRequirements?: ShrineData['synthesisRequirements'];
      deity?: string;
      aspect?: string;
      originalFeatData?: any;
      originalSpellData?: any;
      useRulesKnowledge?: boolean; // 是否在生成时调用PF2e规则机制知识库
    };
  };
}

/**
 * 神龛物品服务
 * 管理三种新的物品类型：神性、贡品、神龛
 */
export class ShrineItemService {
  private aiService: AIService;

  // 阿兹特克神明系统
  private static readonly AZTEC_DEITIES = {
    'Huitzilopochtli': {
      name: '维齐洛波奇特利',
      aspect: '战争与太阳',
      domain: ['战斗', '领导', '勇气', '征服'],
      description: '阿兹特克战争之神，太阳神，部落守护神'
    },
    'Quetzalcoatl': {
      name: '克察尔科亚特尔',
      aspect: '风与智慧',
      domain: ['魔法', '知识', '创造', '文明'],
      description: '羽蛇神，风神，智慧与文明之神'
    },
    'Tlaloc': {
      name: '特拉洛克',
      aspect: '雨水与丰收',
      domain: ['自然', '治疗', '生长', '丰饶'],
      description: '雨神，掌管降雨、雷电和农业'
    },
    'Tezcatlipoca': {
      name: '特斯卡特利波卡',
      aspect: '夜晚与冲突',
      domain: ['暗影', '诡计', '变化', '冲突'],
      description: '黑夜之神，冲突与变化之神，镜中烟雾'
    },
    'Xochiquetzal': {
      name: '索奇克察尔',
      aspect: '爱情与艺术',
      domain: ['魅力', '艺术', '爱情', '美丽'],
      description: '爱情女神，花卉女神，艺术与美丽的守护者'
    },
    'Mictlantecuhtli': {
      name: '米克特兰特库特利',
      aspect: '死亡与重生',
      domain: ['死亡', '重生', '生命力', '祖先'],
      description: '死亡之神，冥界之主，生死轮回的掌控者'
    }
  };

  constructor(aiService: AIService) {
    this.aiService = aiService;
  }

  /**
   * 从现有物品中识别类型
   */
  static getItemType(item: any): 'divinity' | 'offering' | 'shrine' | 'fragment' | 'unknown' {
    console.log(`识别物品类型 "${item.name}":`, {
      flagsItemType: item.flags?.['ai-pf2e-assistant']?.itemType,
      traits: item.system?.traits?.value,
      fragmentType: item.flags?.['ai-pf2e-assistant']?.fragmentType,
      hasGmDescription: !!(item.system?.description?.gm),
      hasHiddenPrompt: !!item.flags?.['ai-pf2e-assistant']?.hiddenPrompt
    });

    // 首先检查明确的物品类型标记
    const itemType = item.flags?.['ai-pf2e-assistant']?.itemType;
    if (['divinity', 'offering', 'shrine'].includes(itemType)) {
      console.log(`通过flags识别为: ${itemType}`);
      return itemType;
    }
    
    // 接下来通过特征标签识别（支持中英文）- 优先于fragmentType检查
    const traits = item.system?.traits?.value || [];
    
    // 神性识别 - 支持神龛主题和爱达梦主题
    if (traits.includes('divinity') || traits.includes('神性') || traits.includes('指导')) {
      console.log('通过traits识别为: divinity');
      return 'divinity';
    }
    
    // 贡品识别 - 支持神龛主题和爱达梦主题  
    if (traits.includes('offering') || traits.includes('贡品') || traits.includes('技能机')) {
      console.log('通过traits识别为: offering');
      return 'offering';
    }
    
    // 神龛识别 - 支持神龛主题和爱达梦主题
    if (traits.includes('shrine') || traits.includes('神龛') || traits.includes('训练场')) {
      console.log('通过traits识别为: shrine');
      return 'shrine';
    }
    
    // 碎片识别 - 支持爱达梦主题
    if (traits.includes('fragment') || traits.includes('碎片') || traits.includes('个性')) {
      console.log('通过traits识别为: fragment');
      return 'fragment';
    }
    
    // 智能识别：如果物品名称包含已知神明名称，识别为神性
    const itemName = item.name.toLowerCase();
    const deityNames = Object.keys(this.AZTEC_DEITIES).map(name => name.toLowerCase());
    const chineseDeityNames = Object.values(this.AZTEC_DEITIES).map(deity => deity.name.toLowerCase());
    
    if (deityNames.some(deity => itemName.includes(deity)) || 
        chineseDeityNames.some(deity => itemName.includes(deity)) ||
        itemName.includes('阿雷科斯特斯')) {
      console.log('通过神明名称识别为: divinity');
      return 'divinity';
    }
    
    // 专长、法术、装备类型的物品自动识别为贡品
    if (item.type === 'feat') {
      console.log('专长物品识别为: offering');
      return 'offering';
    }
    
    if (item.type === 'spell') {
      console.log('法术物品识别为: offering');
      return 'offering';
    }
    
    if (item.type === 'equipment' || item.type === 'weapon' || item.type === 'armor' || item.type === 'consumable') {
      console.log(`${item.type}物品识别为: offering`);
      return 'offering';
    }
    
    // 最后检查碎片类型（通过flags标记）
    if (item.flags?.['ai-pf2e-assistant']?.fragmentType === 'feat-fragment') {
      console.log('通过fragmentType识别为: fragment');
      return 'fragment';
    }
    
    console.log('无法识别，归类为: unknown');
    return 'unknown';
  }

  /**
   * 提取神龛的合成需求
   */
  static extractSynthesisRequirements(shrineItem: any): ShrineData['synthesisRequirements'] | null {
    console.log('解析神龛合成需求，物品:', shrineItem.name);
    
    // 首先从标准的GM描述字段获取配置
    let configText = shrineItem.system?.description?.gm || '';
    console.log('从GM描述获取配置:', configText);
    
    // 如果GM描述中没有配置，回退到flags（兼容旧数据）
    if (!configText.includes('FRAGMENTS_MIN') && !configText.includes('DIVINITIES_MIN')) {
      const flagsRequirements = shrineItem.flags?.['ai-pf2e-assistant']?.synthesisRequirements;
      if (flagsRequirements) {
        console.log('使用存储的flags需求:', flagsRequirements);
        return flagsRequirements;
      }
      
      // 最后尝试从flags的隐藏提示词中解析
      configText = shrineItem.flags?.['ai-pf2e-assistant']?.hiddenPrompt || '';
      console.log('从flags隐藏提示词获取配置:', configText);
    }
    
    // 清理HTML并解析
    const cleanText = this.extractTextFromHtml(configText);
    console.log('清理后的配置文本:', cleanText);
    
    const parsed = this.parseSynthesisRequirementsFromText(cleanText);
    console.log('解析结果:', parsed);
    
    return parsed;
  }

  /**
   * 解析文本中的合成需求
   */
  /**
   * 从HTML或纯文本中提取纯文本内容
   */
  private static extractTextFromHtml(content: string): string {
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

  private static parseSynthesisRequirementsFromText(text: string): ShrineData['synthesisRequirements'] | null {
    try {
      // 先清理HTML标签
      const cleanText = this.extractTextFromHtml(text);
      console.log('清理后的神龛配置文本:', cleanText);
      
      // 新的结构化格式解析
      const requirements = {
        fragments: { min: 0, max: undefined as number | undefined },
        divinities: { min: 0, max: undefined as number | undefined },
        offerings: { min: 0, max: undefined as number | undefined }
      };

      // 解析新格式：FRAGMENTS_MIN: 2
      const parseField = (fieldName: string) => {
        const minPattern = new RegExp(`${fieldName}_MIN:\\s*(\\d+)`, 'i');
        const maxPattern = new RegExp(`${fieldName}_MAX:\\s*(\\d+)`, 'i');
        
        const minMatch = cleanText.match(minPattern);
        const maxMatch = cleanText.match(maxPattern);
        
        return {
          min: minMatch ? parseInt(minMatch[1]) : 0,
          max: maxMatch ? parseInt(maxMatch[1]) : undefined
        };
      };

      requirements.fragments = parseField('FRAGMENTS');
      requirements.divinities = parseField('DIVINITIES');
      requirements.offerings = parseField('OFFERINGS');

      // 检查是否至少解析到了一些数据
      const hasData = requirements.fragments.min > 0 || 
                     requirements.divinities.min > 0 || 
                     requirements.offerings.min > 0 ||
                     cleanText.includes('FRAGMENTS_MIN') ||
                     cleanText.includes('DIVINITIES_MIN') ||
                     cleanText.includes('OFFERINGS_MIN');

      if (hasData) {
        console.log('使用新格式解析结果:', requirements);
        return requirements;
      }

      // 回退：尝试旧格式
      const oldRequirementPattern = /合成需求[:：]\s*(?:fragments?|碎片)[:：]?\s*(\d+)(?:-(\d+))?[，,]?\s*(?:offerings?|贡品)[:：]?\s*(\d+)(?:-(\d+))?[，,]?\s*(?:divinities?|神性)[:：]?\s*(\d+)(?:-(\d+))?/i;
      const oldMatch = cleanText.match(oldRequirementPattern);
      
      if (oldMatch) {
        console.log('使用旧格式解析结果');
        return {
          fragments: { 
            min: parseInt(oldMatch[1]), 
            max: oldMatch[2] ? parseInt(oldMatch[2]) : undefined 
          },
          offerings: { 
            min: parseInt(oldMatch[3]), 
            max: oldMatch[4] ? parseInt(oldMatch[4]) : undefined 
          },
          divinities: { 
            min: parseInt(oldMatch[5]), 
            max: oldMatch[6] ? parseInt(oldMatch[6]) : undefined 
          }
        };
      }

      // 如果都没有匹配，说明这是旧版本的神龛，使用默认配置
      console.log('无法解析合成需求，使用默认配置');
      return {
        fragments: { min: 1, max: 3 },
        divinities: { min: 0, max: 2 },
        offerings: { min: 0, max: 1 }
      };
    } catch (error) {
      console.error('解析合成需求失败:', error);
      return null;
    }
  }

  /**
   * 解析神龛的配置（统一支持专长、法术和物品）
   */
  static extractShrineConfig(shrineItem: any): { 
    level?: number; 
    category?: string; 
    className?: string; 
    rank?: number; 
    traditions?: string[]; 
    mechanismComplexity?: 'none' | 'simple' | 'moderate' | 'complex';
    equipmentType?: 'weapon' | 'equipment' | 'consumable' | 'armor' | 'treasure';
    equipmentCategory?: string;
    requiredTraits?: string[]; // 合成后必定携带的特征
  } | null {
    // 优先使用GM描述，如果没有则使用hiddenPrompt
    let configText = shrineItem.system?.description?.gm || '';
    if (!configText.trim()) {
      configText = shrineItem.flags?.['ai-pf2e-assistant']?.hiddenPrompt || '';
    }
    
    // 清理HTML标签以便解析
    const cleanText = this.extractTextFromHtml(configText);
    
    try {
      // 解析等级 - 支持 LEVEL 或 FEAT_LEVEL（向下兼容）
      const levelPattern = /(?:FEAT_)?LEVEL:\s*(\d+)/i;
      const levelMatch = cleanText.match(levelPattern);
      
      // 解析类别
      const categoryPattern = /(?:FEAT_)?CATEGORY:\s*(general|skill|ancestry|class|bonus)/i;
      const categoryMatch = cleanText.match(categoryPattern);
      
      // 解析职业名称（如果是class类别）
      const classPattern = /CLASS_NAME:\s*([^\r\n]+)/i;
      const classMatch = cleanText.match(classPattern);
      
      // 解析机制复杂度
      const complexityPattern = /MECHANISM_COMPLEXITY:\s*(none|simple|moderate|complex)/i;
      const complexityMatch = cleanText.match(complexityPattern);
      const mechanismComplexity = complexityMatch ? complexityMatch[1].toLowerCase() as 'none' | 'simple' | 'moderate' | 'complex' : 'moderate'; // 默认值为中等
      
      // 解析物品类型
      const equipmentTypePattern = /EQUIPMENT_TYPE:\s*(weapon|equipment|consumable|armor|treasure)/i;
      const equipmentTypeMatch = cleanText.match(equipmentTypePattern);
      const equipmentType = equipmentTypeMatch ? equipmentTypeMatch[1].toLowerCase() as any : undefined;
      
      // 解析物品子类别
      const equipmentCategoryPattern = /EQUIPMENT_CATEGORY:\s*([^\r\n]+)/i;
      const equipmentCategoryMatch = cleanText.match(equipmentCategoryPattern);
      const equipmentCategory = equipmentCategoryMatch && equipmentCategoryMatch[1].trim() ? equipmentCategoryMatch[1].trim() : undefined;
      
      // 解析必定携带的特征
      const requiredTraitsPattern = /REQUIRED_TRAITS:\s*([^\r\n]+)/i;
      const requiredTraitsMatch = cleanText.match(requiredTraitsPattern);
      let requiredTraits: string[] | undefined = undefined;
      if (requiredTraitsMatch && requiredTraitsMatch[1].trim()) {
        // 支持逗号分隔的特征列表
        requiredTraits = requiredTraitsMatch[1].split(',').map(t => t.trim()).filter(t => t.length > 0);
      }
      
      console.log('神龛配置解析:', {
        原始文本长度: configText.length,
        清理后文本: cleanText.substring(0, 200) + '...',
        等级匹配: levelMatch,
        类别匹配: categoryMatch,
        职业匹配: classMatch,
        机制复杂度: mechanismComplexity,
        物品类型: equipmentType,
        物品子类别: equipmentCategory,
        必定携带特征: requiredTraits
      });
      
      // 专长配置
      if (categoryMatch) {
        const level = levelMatch ? parseInt(levelMatch[1]) : undefined;
        const category = categoryMatch[1].toLowerCase();
        const className = classMatch && classMatch[1].trim() ? classMatch[1].trim() : undefined;
        
        const result = { level, category, className, mechanismComplexity, requiredTraits };
        console.log('✅ 神龛配置解析成功（专长）:');
        console.log('  - level:', level);
        console.log('  - category:', category);
        console.log('  - className:', className);
        console.log('  - mechanismComplexity:', mechanismComplexity);
        console.log('  - requiredTraits:', requiredTraits);
        return result;
      }
      
      // 物品配置
      if (equipmentType) {
        const level = levelMatch ? parseInt(levelMatch[1]) : undefined;
        
        console.log('神龛配置解析成功（物品）:', { level, equipmentType, equipmentCategory, mechanismComplexity, requiredTraits });
        return { level, equipmentType, equipmentCategory, mechanismComplexity, requiredTraits };
      }
      
      console.warn('神龛配置解析失败 - 缺少必要字段');
      return null;
    } catch (error) {
      console.error('解析神龛配置失败:', error);
      return null;
    }
  }

  /**
   * 根据需求选择合适的神明
   */
  private selectRandomDeity(requirement: string): string {
    const keywords = requirement.toLowerCase();
    
    // 根据关键词匹配合适的神明
    for (const [deityKey, deityInfo] of Object.entries(ShrineItemService.AZTEC_DEITIES)) {
      for (const domain of deityInfo.domain) {
        if (keywords.includes(domain)) {
          return deityKey;
        }
      }
    }
    
    // 如果没有匹配，随机选择
    const deityKeys = Object.keys(ShrineItemService.AZTEC_DEITIES);
    return deityKeys[Math.floor(Math.random() * deityKeys.length)];
  }

  /**
   * 构建神龛物品描述HTML (保留用于识别现有物品)
   */
  private buildShrineItemDescription(visibleDescription: string, hiddenPrompt: string, flavor: string): string {
    return `
      <p>${visibleDescription}</p>
      <hr />
      <p><em>${flavor}</em></p>
      <section class="secret" style="display: none;">
        <h4>AI提示词内容</h4>
        <p>${hiddenPrompt}</p>
      </section>
    `;
  }

  /**
   * 计算物品价值
   */
  private calculateItemValue(rarity: string, isShrine: boolean = false): number {
    const baseValue = isShrine ? 100 : 25;
    const multipliers = { common: 1, uncommon: 2, rare: 4, unique: 8 };
    return baseValue * (multipliers[rarity] || 1);
  }

  /**
   * 计算物品等级
   */
  private calculateItemLevel(rarity: string, isShrine: boolean = false): number {
    const baseLevel = isShrine ? 3 : 1;
    const bonus = { common: 0, uncommon: 1, rare: 2, unique: 3 };
    return baseLevel + (bonus[rarity] || 0);
  }

  /**
   * 解析AI响应
   */
  private parseAIResponse(response: any): any {
    try {
      if (typeof response === 'object' && response !== null) {
        if (response.choices && response.choices.length > 0) {
          const content = response.choices[0].message?.content;
          if (content) {
            return this.parseAIResponse(content);
          }
        }
        if (response.name && response.description && response.hiddenPrompt) {
          return response;
        }
        response = JSON.stringify(response);
      }
      
      if (typeof response === 'string') {
        let cleanResponse = response.trim();
        cleanResponse = cleanResponse.replace(/```json\s*/gi, '');
        cleanResponse = cleanResponse.replace(/```\s*/g, '');
        
        const jsonStartIndex = cleanResponse.indexOf('{');
        const jsonEndIndex = cleanResponse.lastIndexOf('}');
        
        if (jsonStartIndex !== -1 && jsonEndIndex !== -1 && jsonEndIndex > jsonStartIndex) {
          cleanResponse = cleanResponse.substring(jsonStartIndex, jsonEndIndex + 1);
        }
        
        return JSON.parse(cleanResponse);
      }
      
      throw new Error('无法识别的AI响应格式');
    } catch (error) {
      console.error('解析AI响应失败:', error);
      throw new Error(`无法解析AI响应为JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取所有阿兹特克神明信息
   */
  static getAllDeities() {
    return ShrineItemService.AZTEC_DEITIES;
  }
}

