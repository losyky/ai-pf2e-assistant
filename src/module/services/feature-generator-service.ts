import { AIService } from './ai-service';
import { Message } from '../types/api';

/**
 * 机制设计结果接口
 */
export interface MechanismDesign {
  name: string;
  description: string;
  mechanismType: 'resource' | 'state' | 'trigger' | 'modifier' | 'action';
  gameReference?: string; // 参考的游戏机制，如"MOBA技能冷却"、"桌游资源管理"等
  coreRules: string[]; // 核心规则描述
  balanceConsiderations: string[]; // 平衡性考虑
  extensionPotential: string[]; // 扩展潜力
  suggestedFeats: string[]; // 建议的衍生专长方向
}

/**
 * 特性设计结果接口
 */
export interface FeatureDesign {
  name: string;
  description: string;
  level: number;
  mechanismIntegration: string; // 如何整合机制
  prerequisites?: string[];
  traits: string[];
  category: 'classfeature' | 'feat';
  actionType: 'passive' | 'free' | 'reaction' | 'action' | 'activity';
  actions?: number;
  rulesElements: any[]; // PF2e规则元素
  flavorText: string; // 风味文本
}

/**
 * PF2e物品格式结果接口
 */
export interface PF2eItemFormat {
  name: string;
  type: 'feat';
  img: string;
  system: {
    actionType: { value: string };
    actions: { value: number | null };
    category: string;
    description: { value: string; gm: string };
    level: { value: number };
    prerequisites: { value: any[] };
    publication: {
      license: string;
      remaster: boolean;
      title: string;
      authors: string;
    };
    rules: any[];
    traits: {
      rarity: string;
      value: string[];
      otherTags: string[];
    };
    slug: string;
    _migration: {
      version: number;
      previous: null;
    };
    onlyLevel1: boolean;
    maxTakable: number;
    subfeatures: {
      proficiencies: {};
      senses: {};
      suppressedFeatures: string[];
    };
    location: null;
  };
  effects: any[];
  folder: null;
  flags: any;
}

/**
 * 特性生成器服务
 * 使用三个智能体协作生成职业特性
 */
export class FeatureGeneratorService {
  private aiService: AIService;
  private compendiumSearchEnabled: boolean = true;
  private balanceData: any;

  constructor(aiService: AIService, balanceData: any) {
    this.aiService = aiService;
    this.balanceData = balanceData;
  }

  /**
   * 设置集合包搜索功能启用状态
   */
  setCompendiumSearchEnabled(enabled: boolean) {
    this.compendiumSearchEnabled = enabled;
  }

  /**
   * 生成职业特性
   * @param prompt 用户提示词
   * @param level 特性等级
   * @param className 职业名称（可选）
   * @returns 完整的PF2e物品格式
   */
  async generateFeature(prompt: string, level: number = 1, className?: string): Promise<PF2eItemFormat> {
    console.log(`开始生成特性，提示词: ${prompt}, 等级: ${level}, 职业: ${className || '通用'}`);

    let compendiumContext = '';
    
    // 可选步骤：集合包搜索
    if (this.compendiumSearchEnabled) {
      console.log('正在搜索集合包相关内容...');
      try {
        const keywords = await this.extractSearchKeywords(prompt);
        if (keywords.length > 0) {
          const searchResults = await this.searchCompendiumContent(keywords);
          compendiumContext = this.formatCompendiumContext(searchResults);
          console.log('集合包搜索完成，找到', searchResults.length, '个相关条目');
        }
      } catch (searchError) {
        console.warn('集合包搜索失败，继续生成:', searchError);
      }
    }

    // 第一步：机制设计智能体
    const mechanism = await this.designMechanism(prompt + compendiumContext, level);
    console.log('机制设计完成:', mechanism);

    // 第二步：特性设计智能体
    const feature = await this.designFeature(mechanism, prompt + compendiumContext, level, className);
    console.log('特性设计完成:', feature);

    // 第三步：格式转换智能体
    const pf2eItem = await this.convertToFeatureFormat(feature, mechanism);
    console.log('格式转换完成:', pf2eItem);

    return pf2eItem;
  }

  /**
   * 机制设计智能体
   * 负责设计独特的游戏机制
   */
  private async designMechanism(prompt: string, level: number): Promise<MechanismDesign> {
    const messages: Message[] = [
      {
        role: 'system',
        content: `你是一个专业的游戏机制设计师，精通各种桌游和电子游戏的机制设计。
你的任务是为Pathfinder 2e创造独特而有趣的游戏机制。

设计原则：
1. 机制应该简洁明了，易于理解和执行
2. 必须符合PF2e的数值平衡和动作经济
3. 应该有足够的拓展性，可以衍生出相关专长
4. 可以参考其他游戏的成功机制，但要适配PF2e规则
5. 避免与现有机制过度重复

常见机制类型：
- resource: 资源管理（如法术位、气、能量等）
- state: 状态切换（如愤怒、专注、防守姿态等）
- trigger: 触发效果（如反击、连锁反应等）
- modifier: 调整值变化（如精确度提升、伤害加成等）
- action: 特殊动作（如独特的攻击方式、移动技巧等）

请用自然语言详细描述机制设计，不需要使用特定的代码格式。包含：
1. 机制名称和类型
2. 核心规则详细说明  
3. 平衡性考虑
4. 扩展潜力
5. 建议的衍生专长方向`
      },
      {
        role: 'user',
        content: `请为以下需求设计一个游戏机制：
${prompt}

等级要求：${level}级特性
请确保机制适合这个等级的角色使用，不要过于强大或过于弱小。

请用清晰的自然语言描述机制设计，包含机制名称、类型、核心规则、平衡考虑、扩展潜力和建议的专长方向。`
      }
    ];

    // 不指定模型，使用通用配置中的模型
    const response = await this.aiService.callService(messages);

    return this.parseMechanismResponse(response);
  }

  /**
   * 特性设计智能体
   * 负责将机制转化为具体的职业特性设计
   */
  private async designFeature(mechanism: MechanismDesign, originalPrompt: string, level: number, className?: string): Promise<FeatureDesign> {
    const messages: Message[] = [
      {
        role: 'system',
        content: `你是一个Pathfinder 2e职业特性设计专家，精通PF2e的规则系统。
你的任务是将设计好的机制转化为具体的职业特性。

设计要求：
1. 特性必须符合PF2e的规则框架
2. 重点在于机制创新而非数值优化
3. 规则元素必须正确使用PF2e的规则系统
4. 描述要生动有趣，符合PF2e的风格
5. 考虑特性的叙事性和趣味性
6. **严格遵循PF2e官方书写格式和术语标准**

**PF2e书写格式要求**：
- 使用标准PF2e术语（如"状态加值"、"环境加值"、"物品加值"等）
- 动作成本明确标注（单动作、双动作、三动作、自由动作、反应）
- 条件和状态使用官方中文译名（如困乏、疲乏、恶心、目眩、震慑等）
- 数值表述清晰准确（如"+2环境加值攻击检定"、"1d6+力量调整值伤害"）
- 频率限制使用标准格式（如"每天一次"、"每场遭遇一次"、"每轮一次"）
- 先决条件和触发条件明确列出
- 效果描述准确、简洁、符合官方出版物风格

PF2e规则元素类型：
- Note: 提示信息，在特定情况下显示
- RollOption: 添加骰子选项或标记
- FlatModifier: 固定数值调整（避免过大数值）
- ItemAlteration: 修改物品属性
- GrantItem: 赋予物品或能力
- RollTwice: 骰两次取较好/较差结果
- DamageDice: 伤害骰调整（保持适度）

动作类型：
- passive: 被动能力
- free: 自由动作
- reaction: 反应动作  
- action: 单动作
- activity: 活动（多动作）

等级指导：
- 1-5级：基础机制，效果简单明确
- 6-10级：机制开始复杂化，有一定战术深度
- 11-15级：强化机制，可以影响战斗策略
- 16-20级：顶级机制，可以有显著的游戏改变效果`
      },
      {
        role: 'user',
        content: `基于以下机制设计一个${level}级的职业特性：

机制信息：
名称：${mechanism.name}
描述：${mechanism.description}
类型：${mechanism.mechanismType}
核心规则：${mechanism.coreRules.join('; ')}

原始需求：${originalPrompt}
${className ? `目标职业：${className}` : ''}

请重点关注机制的创新性和趣味性，避免过度复杂的数值计算。
请使用designFeature函数返回特性设计结果。`
      }
    ];

    const functionDefinition = {
      name: 'designFeature',
      description: '设计职业特性',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '特性名称' },
          description: { type: 'string', description: '特性描述' },
          level: { type: 'number', description: '特性等级' },
          mechanismIntegration: { type: 'string', description: '如何整合机制' },
          prerequisites: { 
            type: 'array', 
            items: { type: 'string' },
            description: '前置条件（可选）' 
          },
          traits: { 
            type: 'array', 
            items: { type: 'string' },
            description: '特性标签' 
          },
          category: { 
            type: 'string',
            enum: ['classfeature', 'feat'],
            description: '特性类别'
          },
          actionType: { 
            type: 'string',
            enum: ['passive', 'free', 'reaction', 'action', 'activity'],
            description: '动作类型'
          },
          actions: { type: 'number', description: '动作数量（可选）' },
          rulesElements: { 
            type: 'array',
            description: 'PF2e规则元素',
            items: { type: 'object' }
          },
          flavorText: { type: 'string', description: '风味文本' }
        },
        required: ['name', 'description', 'level', 'mechanismIntegration', 'traits', 'category', 'actionType', 'rulesElements', 'flavorText']
      }
    };

    const response = await this.aiService.callService(messages, { 
      functions: [functionDefinition],
      function_call: { name: 'designFeature' }
    });

    return this.parseFeatureResponse(response);
  }

  /**
   * 格式转换智能体
   * 负责将特性设计转换为标准的PF2e物品格式
   */
  private async convertToFeatureFormat(feature: FeatureDesign, mechanism: MechanismDesign): Promise<PF2eItemFormat> {
    const messages: Message[] = [
      {
        role: 'system',
        content: `你是一个PF2e数据格式专家，精通Foundry VTT的PF2e系统数据结构。
你的任务是将特性设计转换为标准的PF2e物品JSON格式。

格式要求：
1. 必须严格遵循PF2e系统的数据结构
2. 所有字段都必须正确填写
3. rules数组必须包含有效的规则元素
4. traits必须使用标准的PF2e特性标签
5. description必须是HTML格式的文本，且包含完整的规则描述

**重要：description.value字段必须包含完整的特性规则文本**
- 包含特性的完整描述和所有机制说明
- 包含触发条件、效果、限制等详细信息
- 使用HTML格式，包含<p>、<strong>、<em>等标签
- 确保用户能够通过阅读description了解特性的完整功能
- 不要仅仅依赖rules数组，因为用户主要通过description查看规则

**严格遵循PF2e官方书写格式标准**：
- 使用标准的PF2e术语和表述方式
- 动作类型使用标准图标：◆（单动作）、◆◆（双动作）、◆◆◆（三动作）、◇（自由动作）、⤷（反应）
- 条件和状态使用PF2e标准中文译名（如困乏、疲乏、恶心、目眩等）
- 数值表述符合PF2e惯例（如"+1状态加值"、"1d6伤害"、"+2环境加值"等）
- 描述风格要符合PF2e官方出版物的语调和格式
- 使用标准的加值类型：状态加值、环境加值、物品加值、增强加值等
- 频率表述使用标准格式（如"每天一次"、"每场遭遇一次"、"每轮一次"等）

标准格式参考：
- type: 'feat'
- category: 'classfeature' 或 'feat'
- actionType: { value: 'passive'|'free'|'reaction'|'action'|'activity' }
- actions: { value: null|1|2|3 }
- level: { value: 数字 }
- traits: { rarity: 'common', value: [...], otherTags: [] }
- description: { value: '完整的HTML格式规则描述', gm: '' }
- frequency: { max: 数字, per: '有效选项' } (可选)
- rules: [...规则元素...]

**重要：frequency字段的per值只能使用以下有效选项：**
- "turn" (每回合)
- "round" (每轮)  
- "minute" (每分钟)
- "hour" (每小时)
- "day" (每天)
- "week" (每周)
- "month" (每月)
- "year" (每年)
- "PT1M" (每分钟的标准格式)
- "PT10M" (每10分钟)
- "PT1H" (每小时的标准格式)

不要使用"rage"、"encounter"等非标准值，如果需要表达"每次愤怒"的概念，请在description中说明，并使用"day"或其他标准值。`
      },
      {
        role: 'user',
        content: `请将以下特性设计转换为PF2e物品格式：

特性信息：
${JSON.stringify(feature, null, 2)}

机制信息：
${JSON.stringify(mechanism, null, 2)}

**重要要求：**
1. description.value字段必须包含完整详细的规则文本
2. 将特性的所有机制、触发条件、效果、限制都写入description
3. 使用清晰的HTML格式，包含适当的段落和强调标签
4. 确保用户仅通过阅读description就能完全理解这个特性的功能

请使用convertToPF2eFormat函数返回完整的PF2e物品格式。`
      }
    ];

    const functionDefinition = {
      name: 'convertToPF2eFormat',
      description: '转换为PF2e物品格式',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '物品名称' },
          type: { type: 'string', enum: ['feat'], description: '物品类型' },
          img: { type: 'string', description: '物品图标路径' },
          system: {
            type: 'object',
            properties: {
              actionType: { 
                type: 'object',
                properties: { value: { type: 'string' } }
              },
              actions: { 
                type: 'object',
                properties: { value: { type: ['number', 'null'] } }
              },
              category: { type: 'string' },
              description: {
                type: 'object',
                properties: {
                  value: { type: 'string' },
                  gm: { type: 'string' }
                }
              },
              level: {
                type: 'object',
                properties: { value: { type: 'number' } }
              },
              prerequisites: {
                type: 'object',
                properties: { value: { type: 'array' } }
              },
              publication: {
                type: 'object',
                properties: {
                  license: { type: 'string' },
                  remaster: { type: 'boolean' },
                  title: { type: 'string' },
                  authors: { type: 'string' }
                }
              },
              rules: { type: 'array' },
              traits: {
                type: 'object',
                properties: {
                  rarity: { type: 'string' },
                  value: { type: 'array' },
                  otherTags: { type: 'array' }
                }
              },
              slug: { type: 'string' }
            }
          }
        },
        required: ['name', 'type', 'img', 'system']
      }
    };

    const response = await this.aiService.callService(messages, { 
      functions: [functionDefinition],
      function_call: { name: 'convertToPF2eFormat' }
    });

    return this.parseFormatResponse(response);
  }

  /**
   * 获取等级对应的平衡数据
   */
  private getLevelBalanceData(level: number): any {
    if (!this.balanceData) return {};

    const result: any = {};
    
    // 为每个数据类型找到对应等级的数据
    for (const [dataType, dataArray] of Object.entries(this.balanceData)) {
      if (Array.isArray(dataArray)) {
        // 找到最接近的等级数据
        const levelData = (dataArray as any[]).find(item => item.level === level) ||
                         (dataArray as any[]).filter(item => item.level <= level).pop() ||
                         (dataArray as any[])[0];
        
        if (levelData) {
          result[dataType] = levelData;
        }
      }
    }

    return result;
  }

  /**
   * 解析机制设计响应
   */
  private parseMechanismResponse(response: any): MechanismDesign {
    console.log('解析机制设计响应:', response);
    
    try {
      if (response.choices && response.choices[0]) {
        const choice = response.choices[0];
        
        // 优先尝试function_call
        if (choice.message?.function_call) {
          console.log('使用function_call解析:', choice.message.function_call);
          const args = JSON.parse(choice.message.function_call.arguments);
          return args as MechanismDesign;
        }
        
        // 如果没有function_call，尝试从content中解析
        if (choice.message?.content) {
          console.log('尝试从content解析:', choice.message.content);
          
          // 先尝试提取JavaScript函数调用中的参数
          const jsMatch = choice.message.content.match(/designMechanism\s*\(\s*(\{[\s\S]*?\})\s*\)/);
          if (jsMatch) {
            try {
              // 尝试解析JavaScript对象字面量
              const jsObjectStr = jsMatch[1];
              console.log('提取到JavaScript对象:', jsObjectStr);
              
              // 使用Function构造器安全地解析JavaScript对象
              const parsed = new Function('return ' + jsObjectStr)();
              console.log('JavaScript解析成功:', parsed);
              
              // 转换为MechanismDesign格式
              return this.convertToMechanismDesign(parsed);
            } catch (jsError) {
              console.log('JavaScript解析失败:', jsError);
            }
          }
          
          // 尝试提取JSON
          const jsonMatch = choice.message.content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || 
                           choice.message.content.match(/(\{[\s\S]*?\})/);
          
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
              console.log('从content解析JSON成功:', parsed);
              return parsed as MechanismDesign;
            } catch (jsonError) {
              console.log('JSON解析失败:', jsonError);
            }
          }
          
          // 如果无法解析JSON/JS，解析自然语言描述
          console.log('解析自然语言机制描述');
          return this.parseNaturalLanguageMechanism(choice.message.content);
        }
      }
    } catch (error) {
      console.error('解析机制设计响应时出错:', error);
      console.log('原始响应:', JSON.stringify(response, null, 2));
    }
    
    // 最后的fallback
    return this.createFallbackMechanism('AI响应解析失败');
  }

  /**
   * 将任意对象转换为MechanismDesign格式
   */
  private convertToMechanismDesign(obj: any): MechanismDesign {
    return {
      name: obj.name || '自定义机制',
      description: obj.description || '基于用户描述的游戏机制',
      mechanismType: this.validateMechanismType(obj.type || obj.mechanismType) || 'resource',
      gameReference: obj.gameReference || obj.comparison || '通用机制设计',
      coreRules: this.extractCoreRules(obj),
      balanceConsiderations: this.extractBalanceConsiderations(obj),
      extensionPotential: this.extractExtensionPotential(obj),
      suggestedFeats: this.extractSuggestedFeats(obj)
    };
  }

  /**
   * 验证机制类型
   */
  private validateMechanismType(type: string): 'resource' | 'state' | 'trigger' | 'modifier' | 'action' {
    const validTypes = ['resource', 'state', 'trigger', 'modifier', 'action'];
    return validTypes.includes(type) ? type as any : 'resource';
  }

  /**
   * 提取核心规则
   */
  private extractCoreRules(obj: any): string[] {
    if (obj.coreRules && Array.isArray(obj.coreRules)) {
      return obj.coreRules;
    }
    
    const rules: string[] = [];
    
    // 从mechanics.core中提取
    if (obj.mechanics?.core?.effect) {
      rules.push(obj.mechanics.core.effect);
    }
    
    // 从其他字段提取
    if (obj.effect) {
      rules.push(obj.effect);
    }
    
    // 从progression中提取
    if (obj.mechanics?.progression) {
      const progression = obj.mechanics.progression;
      Object.keys(progression).forEach(key => {
        if (typeof progression[key] === 'string') {
          rules.push(`${key}: ${progression[key]}`);
        }
      });
    }
    
    return rules.length > 0 ? rules : ['这是一个基础的游戏机制', '具体规则需要根据实际情况调整'];
  }

  /**
   * 提取平衡性考虑
   */
  private extractBalanceConsiderations(obj: any): string[] {
    if (obj.balanceConsiderations && Array.isArray(obj.balanceConsiderations)) {
      return obj.balanceConsiderations;
    }
    
    const considerations: string[] = [];
    
    if (obj.balanceNotes) {
      if (obj.balanceNotes.strengths) {
        considerations.push(`优势: ${obj.balanceNotes.strengths}`);
      }
      if (obj.balanceNotes.weaknesses) {
        considerations.push(`劣势: ${obj.balanceNotes.weaknesses}`);
      }
      if (obj.balanceNotes.comparison) {
        considerations.push(`对比: ${obj.balanceNotes.comparison}`);
      }
    }
    
    return considerations.length > 0 ? considerations : ['需要测试平衡性', '建议从较弱的效果开始'];
  }

  /**
   * 提取扩展潜力
   */
  private extractExtensionPotential(obj: any): string[] {
    if (obj.extensionPotential && Array.isArray(obj.extensionPotential)) {
      return obj.extensionPotential;
    }
    
    const potential: string[] = [];
    
    // 从features中提取
    if (obj.features) {
      Object.keys(obj.features).forEach(key => {
        potential.push(`可扩展${key}相关功能`);
      });
    }
    
    return potential.length > 0 ? potential : ['可以扩展更多相关能力', '考虑添加升级版本'];
  }

  /**
   * 提取建议专长
   */
  private extractSuggestedFeats(obj: any): string[] {
    if (obj.suggestedFeats && Array.isArray(obj.suggestedFeats)) {
      return obj.suggestedFeats;
    }
    
    const feats: string[] = [];
    
    // 从relatedFeats中提取
    if (obj.relatedFeats && Array.isArray(obj.relatedFeats)) {
      obj.relatedFeats.forEach((feat: any) => {
        if (feat.name) {
          feats.push(feat.name);
        }
      });
    }
    
    return feats.length > 0 ? feats : ['强化版本', '扩展应用', '组合效果'];
  }

  /**
   * 解析自然语言机制描述
   */
  private parseNaturalLanguageMechanism(content: string): MechanismDesign {
    const text = content.toLowerCase();
    
    // 提取机制名称
    let name = '自定义机制';
    const nameMatches = content.match(/(?:机制名称|名称)[：:]\s*([^\n]+)/i) ||
                       content.match(/^([^：:\n]+)(?:机制|本能|能力)/i);
    if (nameMatches) {
      name = nameMatches[1].trim();
    }
    
    // 判断机制类型
    let mechanismType: 'resource' | 'state' | 'trigger' | 'modifier' | 'action' = 'resource';
    if (text.includes('资源') || text.includes('点数') || text.includes('消耗')) {
      mechanismType = 'resource';
    } else if (text.includes('状态') || text.includes('姿态') || text.includes('切换')) {
      mechanismType = 'state';
    } else if (text.includes('触发') || text.includes('反应') || text.includes('当你')) {
      mechanismType = 'trigger';
    } else if (text.includes('修正') || text.includes('加值') || text.includes('调整')) {
      mechanismType = 'modifier';
    } else if (text.includes('动作') || text.includes('行动') || text.includes('攻击')) {
      mechanismType = 'action';
    }
    
    // 提取核心规则（分段落）
    const paragraphs = content.split('\n').filter(p => p.trim().length > 10);
    const coreRules = paragraphs.slice(0, 3).map(p => p.trim());
    
    // 提取平衡性考虑
    const balanceConsiderations: string[] = [];
    if (text.includes('平衡') || text.includes('限制')) {
      const balanceSection = content.match(/(?:平衡|限制)[^]*?(?=\n\n|\n[A-Za-z]|$)/i);
      if (balanceSection) {
        balanceConsiderations.push(balanceSection[0]);
      }
    }
    if (balanceConsiderations.length === 0) {
      balanceConsiderations.push('需要根据实际测试调整平衡性');
    }
    
    // 提取扩展潜力
    const extensionPotential: string[] = [];
    if (text.includes('扩展') || text.includes('发展') || text.includes('潜力')) {
      const extensionSection = content.match(/(?:扩展|发展|潜力)[^]*?(?=\n\n|\n[A-Za-z]|$)/i);
      if (extensionSection) {
        extensionPotential.push(extensionSection[0]);
      }
    }
    if (extensionPotential.length === 0) {
      extensionPotential.push('可以在后续等级中增强效果');
    }
    
    // 提取建议的专长方向
    const suggestedFeats: string[] = [];
    if (text.includes('专长') || text.includes('衍生')) {
      const featSection = content.match(/(?:专长|衍生)[^]*?(?=\n\n|\n[A-Za-z]|$)/i);
      if (featSection) {
        suggestedFeats.push(featSection[0]);
      }
    }
    if (suggestedFeats.length === 0) {
      suggestedFeats.push('相关增强专长', '高级应用专长', '组合机制专长');
    }
    
    return {
      name,
      description: content,
      mechanismType,
      gameReference: '自然语言设计',
      coreRules: coreRules.length > 0 ? coreRules : ['基于自然语言描述的机制'],
      balanceConsiderations,
      extensionPotential,
      suggestedFeats
    };
  }

  /**
   * 创建备用机制（当解析失败时）
   */
  private createFallbackMechanism(content: string): MechanismDesign {
    return {
      name: '自定义机制',
      description: content || '基于用户描述的自定义游戏机制',
      mechanismType: 'resource',
      gameReference: '通用机制设计',
      coreRules: [
        '这是一个基础的游戏机制',
        '具体规则需要根据实际情况调整',
        '建议GM审核后使用'
      ],
      balanceConsiderations: [
        '需要测试平衡性',
        '建议从较弱的效果开始',
        '观察实际游戏中的表现'
      ],
      extensionPotential: [
        '可以扩展更多相关能力',
        '考虑添加升级版本',
        '可能衍生相关专长'
      ],
      suggestedFeats: [
        '强化版本',
        '扩展应用',
        '组合效果'
      ]
    };
  }

  /**
   * 解析特性设计响应
   */
  private parseFeatureResponse(response: any): FeatureDesign {
    console.log('解析特性设计响应:', response);
    
    try {
      if (response.choices && response.choices[0]) {
        const choice = response.choices[0];
        
        // 优先尝试function_call
        if (choice.message?.function_call) {
          console.log('使用function_call解析特性设计');
          const args = JSON.parse(choice.message.function_call.arguments);
          return args as FeatureDesign;
        }
        
        // 如果没有function_call，尝试从content中解析
        if (choice.message?.content) {
          console.log('尝试从content解析特性设计:', choice.message.content);
          
          // 先尝试提取JavaScript函数调用中的参数
          const jsMatch = choice.message.content.match(/designFeature\s*\(\s*(\{[\s\S]*?\})\s*\)/);
          if (jsMatch) {
            try {
              // 尝试解析JavaScript对象字面量
              const jsObjectStr = jsMatch[1];
              console.log('提取到JavaScript对象:', jsObjectStr);
              
              // 使用Function构造器安全地解析JavaScript对象
              const parsed = new Function('return ' + jsObjectStr)();
              console.log('JavaScript解析成功:', parsed);
              
              return parsed as FeatureDesign;
            } catch (jsError) {
              console.log('JavaScript解析失败:', jsError);
            }
          }
          
          // 尝试提取JSON
          const jsonMatch = choice.message.content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || 
                           choice.message.content.match(/(\{[\s\S]*?\})/);
          
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
              console.log('从content解析特性设计JSON成功:', parsed);
              return parsed as FeatureDesign;
            } catch (jsonError) {
              console.log('JSON解析失败:', jsonError);
            }
          }
          
          return this.createFallbackFeature(choice.message.content);
        }
      }
    } catch (error) {
      console.error('解析特性设计响应时出错:', error);
    }
    
    return this.createFallbackFeature('AI响应解析失败');
  }

  /**
   * 创建备用特性设计
   */
  private createFallbackFeature(content: string): FeatureDesign {
    return {
      name: '自定义特性',
      description: content || '基于用户描述的自定义特性',
      level: 1,
      mechanismIntegration: '简单的特性实现',
      prerequisites: [],
      traits: ['uncommon'],
      category: 'classfeature',
      actionType: 'passive',
      rulesElements: [
        {
          key: 'Note',
          selector: 'all',
          text: content || '这是一个自定义特性，需要GM审核'
        }
      ],
      flavorText: '这个特性体现了角色的独特能力。'
    };
  }

  /**
   * 解析格式转换响应
   */
  private parseFormatResponse(response: any): PF2eItemFormat {
    console.log('解析格式转换响应:', response);
    
    try {
      if (response.choices && response.choices[0]) {
        const choice = response.choices[0];
        let args: any = null;
        
        // 优先尝试function_call
        if (choice.message?.function_call) {
          console.log('使用function_call解析格式转换');
          args = JSON.parse(choice.message.function_call.arguments);
        } else if (choice.message?.content) {
          console.log('尝试从content解析格式转换:', choice.message.content);
          
          // 先尝试提取JavaScript函数调用中的参数
          const jsMatch = choice.message.content.match(/convertToFormat\s*\(\s*(\{[\s\S]*?\})\s*\)/);
          if (jsMatch) {
            try {
              // 尝试解析JavaScript对象字面量
              const jsObjectStr = jsMatch[1];
              console.log('提取到JavaScript对象:', jsObjectStr);
              
              // 使用Function构造器安全地解析JavaScript对象
              args = new Function('return ' + jsObjectStr)();
              console.log('JavaScript解析成功:', args);
            } catch (jsError) {
              console.log('JavaScript解析失败:', jsError);
            }
          }
          
          // 如果JavaScript解析失败，尝试提取JSON
          if (!args) {
            const jsonMatch = choice.message.content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || 
                             choice.message.content.match(/(\{[\s\S]*?\})/);
            
            if (jsonMatch) {
              try {
                let jsonStr = jsonMatch[1] || jsonMatch[0];
                
                // 清理常见的JSON格式问题
                jsonStr = this.cleanJsonString(jsonStr);
                
                args = JSON.parse(jsonStr);
                console.log('从content解析格式转换JSON成功');
              } catch (jsonError) {
                console.log('JSON解析失败:', jsonError);
                console.log('尝试解析的JSON字符串:', jsonMatch[1] || jsonMatch[0]);
                
                // 尝试修复常见的JSON错误并重新解析
                try {
                  let fixedJsonStr = this.fixCommonJsonErrors(jsonMatch[1] || jsonMatch[0]);
                  console.log('修复后的JSON字符串:', fixedJsonStr);
                  args = JSON.parse(fixedJsonStr);
                  console.log('使用修复后的JSON解析成功');
                } catch (fixError) {
                  console.log('修复后的JSON仍然解析失败:', fixError);
                  
                  // 最后的回退机制：尝试逐步清理和分步解析
                  try {
                    let lastResortJson = this.lastResortJsonFix(jsonMatch[1] || jsonMatch[0]);
                    args = JSON.parse(lastResortJson);
                    console.log('使用最后回退机制解析成功');
                  } catch (lastResortError) {
                    console.log('所有JSON修复尝试均失败:', lastResortError);
                  }
                }
              }
            }
          }
        }
        
        if (args) {
          return this.buildPF2eItemFormat(args);
        }
      }
    } catch (error) {
      console.error('解析格式转换响应时出错:', error);
      console.log('原始响应:', JSON.stringify(response, null, 2));
    }
    
    // 如果所有解析都失败，创建一个基本的可用格式
    console.log('所有解析尝试失败，创建基本格式');
    return this.createFallbackFormat(response);
  }

  /**
   * 清理JSON字符串中的常见格式问题
   */
  private cleanJsonString(jsonStr: string): string {
    // 移除多余的空白字符
    jsonStr = jsonStr.trim();
    
    // 移除可能的markdown代码块标记
    jsonStr = jsonStr.replace(/^```json?\s*/, '').replace(/\s*```$/, '');
    
    // 移除注释（// 和 /* */ 风格）
    jsonStr = jsonStr.replace(/\/\/.*$/gm, '');
    jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '');
    
    return jsonStr;
  }

  /**
   * 修复常见的JSON错误
   */
  private fixCommonJsonErrors(jsonStr: string): string {
    let fixed = this.cleanJsonString(jsonStr);
    
    // 先修复字符串值中的不当转义和特殊字符
    // 修复字符串中未转义的换行符
    fixed = fixed.replace(/"([^"]*?)\n([^"]*?)"/g, '"$1\\n$2"');
    
    // 修复字符串中未转义的双引号
    fixed = fixed.replace(/"([^"]*?)"([^"]*?)"/g, (match, p1, p2) => {
      // 检查这是否真的是字符串内的引号而不是属性分隔符
      if (p2.includes(':')) {
        return `"${p1}\\"${p2}"`;
      }
      return match;
    });
    
    // 修复属性名没有引号的问题
    fixed = fixed.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
    
    // 修复尾随逗号（在对象和数组中）
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // 修复对象内多余的逗号（如：key: value, }）
    fixed = fixed.replace(/,(\s*,)/g, '$1');
    
    // 修复数组内多余的逗号（如：[item1,, item2]）
    fixed = fixed.replace(/,(\s*,)/g, ',');
    
    // 修复缺失逗号的问题（在属性之间）
    fixed = fixed.replace(/"\s*\n\s*"/g, '",\n"');
    
    // 修复单引号为双引号（但要小心不要破坏字符串内容）
    // 只替换属性名和值开始/结束的单引号
    fixed = fixed.replace(/([{,]\s*)'([^']*?)'(\s*:)/g, '$1"$2"$3');
    fixed = fixed.replace(/(:)\s*'([^']*?)'(\s*[,}])/g, '$1"$2"$3');
    
    // 修复字符串值中的换行符（JSON中不允许多行字符串）
    fixed = fixed.replace(/"([^"]*)\n([^"]*)":/g, '"$1 $2":');
    
    // 修复可能的中文属性名问题
    fixed = fixed.replace(/"([^"]*火效果[^"]*)":\s*"([^"]*)/g, '"text": "$2');
    
    // 修复可能的属性名错误（如缺失的"text"属性）
    fixed = fixed.replace(/"key":\s*"Note",\s*"([^"]*)":/g, '"key": "Note", "text": "$1"');
    
    // 修复对象末尾缺少逗号但后面还有属性的情况
    fixed = fixed.replace(/}(\s*)"([^"]*)":/g, '},\n"$2":');
    
    // 修复数组末尾缺少逗号但后面还有元素的情况  
    fixed = fixed.replace(/](\s*)"([^"]*)":/g, '],\n"$2":');
    
    // 修复值后面缺少逗号的情况（数字、布尔值、null后）
    fixed = fixed.replace(/(true|false|null|\d+)(\s*)"([^"]*)":/g, '$1,\n"$3":');
    
    // 修复多余的换行和空格
    fixed = fixed.replace(/\s+/g, ' ');
    fixed = fixed.replace(/\s*:\s*/g, ':');
    fixed = fixed.replace(/\s*,\s*/g, ',');
    
    return fixed;
  }

  /**
   * 最后回退的JSON修复机制
   */
  private lastResortJsonFix(jsonStr: string): string {
    let fixed = jsonStr.trim();
    
    // 移除所有多余的空白字符
    fixed = fixed.replace(/\s+/g, ' ');
    
    // 确保所有字符串值都被正确引用和转义
    // 使用更保守的方法：找到每个属性的值，并确保其格式正确
    
    // 修复明显的HTML内容转义问题
    fixed = fixed.replace(/"value":\s*"([^"]*<[^>]*>[^"]*)"([^,}]*)/g, (match, content, rest) => {
      // 转义HTML内容中的引号和特殊字符
      const escapedContent = content
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
      return `"value":"${escapedContent}"${rest}`;
    });
    
    // 修复字符串值中的换行符
    fixed = fixed.replace(/"([^"]*?)\n([^"]*?)"/g, '"$1\\n$2"');
    
    // 移除字符串末尾的非闭合引号
    fixed = fixed.replace(/"\s*([,}])/g, '"$1');
    
    // 确保所有属性名都被引用
    fixed = fixed.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
    
    // 移除尾随逗号
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // 确保基本的对象和数组结构正确
    if (!fixed.startsWith('{') && !fixed.startsWith('[')) {
      // 如果不是以对象或数组开始，尝试包装成对象
      if (fixed.includes(':')) {
        fixed = '{' + fixed + '}';
      }
    }
    
    return fixed;
  }

  /**
   * 创建后备格式（当所有解析都失败时）
   */
  private createFallbackFormat(response?: any): PF2eItemFormat {
    console.log('创建后备PF2e物品格式');
    
    const fallbackData = {
      name: '自定义特性',
      type: 'feat',
      img: 'icons/sundries/gaming/dice-runed-brown.webp',
      system: {
        description: {
          value: response?.choices?.[0]?.message?.content?.substring(0, 500) || '特性描述生成失败，请手动编辑',
          gm: ''
        },
        level: { value: 1 },
        category: 'classfeature',
        actionType: { value: 'passive' },
        actions: { value: null },
        traits: {
          rarity: 'common',
          value: [],
          otherTags: []
        },
        prerequisites: { value: [] },
        rules: [],
        slug: 'custom-feature'
      }
    };
    
    return this.buildPF2eItemFormat(fallbackData);
  }

  /**
   * 构建完整的PF2e物品格式
   */
  private buildPF2eItemFormat(args: any): PF2eItemFormat {
    const result: PF2eItemFormat = {
      ...args,
      effects: args.effects || [],
      folder: args.folder || null,
      flags: args.flags || {
        exportSource: {
          world: "ai-generated",
          system: "pf2e",
          coreVersion: "12.331",
          systemVersion: "6.12.4"
        }
      }
    };

    // 移除_id字段，让Foundry VTT自动生成
    if (result._id) {
      delete result._id;
    }

    // 确保system字段完整
    if (!result.system) {
      result.system = {};
    }
    
    if (!result.system._migration) {
      result.system._migration = { version: 0.935, previous: null };
    }
    if (result.system.onlyLevel1 === undefined) {
      result.system.onlyLevel1 = false;
    }
    if (!result.system.maxTakable) {
      result.system.maxTakable = 1;
    }
    if (!result.system.subfeatures) {
      result.system.subfeatures = {
        proficiencies: {},
        senses: {},
        suppressedFeatures: []
      };
    }
    if (result.system.location === undefined) {
      result.system.location = null;
    }

    // 修复traits字段
    if (result.system.traits) {
      // 移除无效的trait值（如"instinct"）
      if (result.system.traits.value && Array.isArray(result.system.traits.value)) {
        result.system.traits.value = result.system.traits.value.filter((trait: string) => {
          // 移除无效的traits
          const invalidTraits = ['instinct'];
          return !invalidTraits.includes(trait);
        });
      }
      
      // 确保traits结构完整
      if (!result.system.traits.rarity) {
        result.system.traits.rarity = 'common';
      }
      if (!result.system.traits.otherTags) {
        result.system.traits.otherTags = [];
      }
    } else {
      // 如果没有traits字段，创建默认的
      result.system.traits = {
        rarity: 'common',
        value: [],
        otherTags: []
      };
    }

    // 修复frequency字段的无效值
    if (result.system.frequency) {
      const validFrequencyPers = ['turn', 'round', 'minute', 'hour', 'day', 'week', 'month', 'year', 'PT1M', 'PT10M', 'PT1H'];
      if (result.system.frequency.per && !validFrequencyPers.includes(result.system.frequency.per)) {
        console.warn(`无效的frequency.per值: ${result.system.frequency.per}，将其改为'day'`);
        result.system.frequency.per = 'day';
      }
    }

    return result;
  }

  /**
   * 从用户提示词中提取搜索关键词
   */
  private async extractSearchKeywords(prompt: string): Promise<string[]> {
    const messages: Message[] = [
      {
        role: 'system',
        content: `你是一个关键词提取专家，专门从PF2e特性生成提示词中提取有用的搜索关键词。
你的任务是分析用户的描述，提取出可以在PF2e集合包中搜索相关内容的关键词。

提取原则：
1. 提取主题相关的词汇（如：火焰、凤凰、狂暴、法师等）
2. 提取机制相关的词汇（如：资源、冷却、姿态、手牌等）
3. 提取游戏系统词汇（如：动作、反应、专长、特性等）
4. 避免过于通用的词汇（如：能力、效果、系统等）
5. 每次提取3-8个最相关的关键词

请使用extractKeywords函数返回关键词数组。`
      },
      {
        role: 'user',
        content: `请从以下提示词中提取搜索关键词：

"${prompt}"

请提取最相关的关键词，用于在PF2e集合包中搜索相关内容。`
      }
    ];

    const functionDefinition = {
      name: 'extractKeywords',
      description: '提取搜索关键词',
      parameters: {
        type: 'object',
        properties: {
          keywords: {
            type: 'array',
            items: { type: 'string' },
            description: '提取的关键词数组'
          },
          reasoning: {
            type: 'string',
            description: '提取这些关键词的理由'
          }
        },
        required: ['keywords', 'reasoning']
      }
    };

    try {
      const response = await this.aiService.callService(messages, {
        functions: [functionDefinition],
        function_call: { name: 'extractKeywords' }
      });

      if (response.choices && response.choices[0]?.message?.function_call) {
        const args = JSON.parse(response.choices[0].message.function_call.arguments);
        console.log('提取的关键词:', args.keywords);
        console.log('提取理由:', args.reasoning);
        return args.keywords || [];
      }
    } catch (error) {
      console.error('提取关键词时出错:', error);
    }

    // 备用方案：简单的关键词提取
    return this.extractKeywordsFallback(prompt);
  }

  /**
   * 备用关键词提取方法
   */
  private extractKeywordsFallback(prompt: string): string[] {
    const keywords = [];
    const text = prompt.toLowerCase();

    // 主题词汇
    const themeWords = ['火焰', 'fire', '冰霜', 'ice', '雷电', 'lightning', '凤凰', 'phoenix', '龙', 'dragon', '恶魔', 'demon'];
    // 职业词汇
    const classWords = ['战士', 'fighter', '法师', 'wizard', '游荡者', 'rogue', '野蛮人', 'barbarian', '牧师', 'cleric'];
    // 机制词汇
    const mechanicWords = ['资源', 'resource', '冷却', 'cooldown', '姿态', 'stance', '专长', 'feat', '狂暴', 'rage'];

    [...themeWords, ...classWords, ...mechanicWords].forEach(word => {
      if (text.includes(word) && !keywords.includes(word)) {
        keywords.push(word);
      }
    });

    return keywords.slice(0, 6); // 限制数量
  }

  /**
   * 在集合包中搜索相关内容
   */
  private async searchCompendiumContent(keywords: string[]): Promise<any[]> {
    try {
      const results = [];
      
      // 搜索不同类型的集合包
      const compendiumTypes = ['classfeatures', 'feats', 'spells', 'equipment', 'ancestryfeatures'];
      
      for (const type of compendiumTypes) {
        const compendium = game.packs.get(`pf2e.${type}`);
        if (!compendium) continue;

        // 获取索引
        const index = compendium.index;
        
        // 搜索匹配的条目
        for (const entry of index) {
          const relevance = this.calculateRelevance(entry, keywords);
          if (relevance > 0.3) { // 相关度阈值
            results.push({
              name: entry.name,
              type: type,
              relevance: relevance,
              uuid: entry.uuid,
              description: entry.system?.description?.value || ''
            });
          }
        }
      }

      // 按相关度排序并限制数量
      return results
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 10);
        
    } catch (error) {
      console.error('搜索集合包内容时出错:', error);
      return [];
    }
  }

  /**
   * 计算内容与关键词的相关度
   */
  private calculateRelevance(entry: any, keywords: string[]): number {
    const text = (entry.name + ' ' + (entry.system?.description?.value || '')).toLowerCase();
    let score = 0;
    
    keywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase();
      if (text.includes(keywordLower)) {
        // 名称匹配权重更高
        if (entry.name.toLowerCase().includes(keywordLower)) {
          score += 0.5;
        } else {
          score += 0.2;
        }
      }
    });

    return Math.min(score, 1.0); // 限制最大值为1
  }

  /**
   * 格式化集合包搜索结果为上下文
   */
  private formatCompendiumContext(results: any[]): string {
    if (results.length === 0) {
      return '';
    }

    let context = '\n\n=== PF2e官方参考内容（请严格遵循其书写格式和术语标准）===\n';
    
    results.forEach((result, index) => {
      context += `\n${index + 1}. ${result.name} (${result.type})\n`;
      if (result.description) {
        // 提取描述的前200个字符
        const shortDesc = result.description.replace(/<[^>]*>/g, '').substring(0, 200);
        context += `   描述: ${shortDesc}${shortDesc.length >= 200 ? '...' : ''}\n`;
      }
    });

    context += '\n**重要提醒**：请参考上述官方内容的书写格式、术语使用和表述方式，确保生成的内容符合PF2e标准。\n';
    
    return context;
  }
}