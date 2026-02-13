import { AIService } from './ai-service';
import { Message } from '../types/api';

/**
 * 专长设计结果接口
 */
export interface FeatDesign {
  name: string;
  description: string;
  level: number;
  actionType: 'passive' | 'free' | 'reaction' | 'single' | 'double' | 'triple';
  traits: string[];
  prerequisites: string[];
  mechanics: any[];
  balanceNotes: string[]; // 数值平衡说明
}

/**
 * PF2e专长物品格式接口
 */
export interface PF2eFeatFormat {
  name: string;
  type: "feat";
  img: string;
  system: {
    description: {
      value: string;
      gm: string;
    };
    rules: any[];
    slug: null;
    traits: {
      value: string[];
      rarity: "common" | "uncommon" | "rare" | "unique";
      otherTags: string[];
    };
    level: {
      value: number;
    };
    category: "general" | "skill" | "ancestry" | "class" | "bonus";
    onlyLevel1: boolean;
    maxTakable: number;
    actionType: {
      value: "passive" | "free" | "reaction" | "action";
    };
    actions: {
      value: null | number;
    };
    prerequisites: {
      value: any[];
    };
    location: null;
    frequency?: {
      max: number;
      per: "turn" | "round" | "minute" | "hour" | "day" | "week" | "month" | "year";
    };
  };
  effects: any[];
  folder: null;
  flags: any;
}

/**
 * 专长生成器服务
 * 注重数值平衡的专长生成
 */
export class FeatGeneratorService {
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
   * 生成专长
   * @param prompt 用户提示词
   * @param level 专长等级
   * @param category 专长类别
   * @param className 职业名称（针对职业专长）
   * @param templateFeats 模板专长（用于格式化参考）
   * @returns 完整的PF2e专长格式
   */
  async generateFeat(prompt: string, level: number = 1, category: string = 'general', className?: string, templateFeats?: any[]): Promise<PF2eFeatFormat> {
    console.log(`开始生成专长，提示词: ${prompt}, 等级: ${level}, 类别: ${category}, 职业: ${className || '通用'}`);

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

    // 第一步：专长设计智能体（结合数值平衡）
    const feat = await this.designFeat(prompt + compendiumContext, level, category, className);
    console.log('专长设计完成:', feat);

    // 第二步：格式转换智能体（可能包含模板专长参考）
    const pf2eFeat = await this.convertToFeatFormat(feat, templateFeats);
    console.log('格式转换完成:', pf2eFeat);

    return pf2eFeat;
  }

  /**
   * 专长设计智能体
   * 负责设计符合数值平衡的专长
   */
  private async designFeat(prompt: string, level: number, category: string, className?: string): Promise<FeatDesign> {
    const balanceGuidance = this.getBalanceGuidance(level, category);
    
    const systemPrompt = `你是一个专业的Pathfinder 2e专长设计师。你需要根据用户的提示词设计一个符合PF2e规则和数值平衡的专长。

专长设计要求：
1. **数值平衡严格遵循**：根据等级和类别使用适当的数值
2. **机制简洁有效**：专长应该有明确的用途和适中的复杂度
3. **符合PF2e规则**：动作类型、先决条件、特征等都要准确
4. **实用性平衡**：既不能过强也不能过弱
5. **符合PF2e书写标准**：使用官方术语、格式和表述方式

**PF2e书写格式要求**：
- 使用标准PF2e术语（如"状态加值"、"环境加值"、"物品加值"等）
- 条件和状态使用官方中文译名
- 数值表述清晰（如"+2环境加值攻击检定"）
- 频率限制使用标准格式（如"每天一次"、"每场遭遇一次"）
- 先决条件明确列出
- 效果描述准确、简洁
- 动作类型通过actionType字段表示，除非有额外动作，否则不要在描述文本中包含动作符号

数值平衡指导：
${balanceGuidance}

请使用以下函数格式返回设计结果：

designFeat({
  name: "专长名称",
  description: "专长的简短描述",
  level: ${level},
  actionType: "动作类型", // passive, free, reaction, single, double, triple
  traits: ["特征1", "特征2"], // 如general, skill, combat等
  prerequisites: ["先决条件"], // 如果没有则为空数组
  mechanics: [
    // 使用PF2e规则元素，如Note, FlatModifier, DamageDice等
  ],
  balanceNotes: ["数值平衡说明"] // 解释为什么这样设计数值
});`;

    const userPrompt = `请为以下需求设计一个${level}级的${category}专长${className ? `（${className}职业）` : ''}：

${prompt}

请特别注意数值平衡，确保专长的强度适合其等级和类别。`;

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    try {
      // 读取神龛系统的专长设计模型配置
      const game = (globalThis as any).game;
      const designModel = game?.settings?.get('ai-pf2e-assistant', 'shrineDesignModel') || 'gpt-4o';
      const response = await this.aiService.callService(messages, designModel);
      return this.parseFeatResponse(response);
    } catch (error) {
      console.error('专长设计失败:', error);
      throw new Error(`专长设计失败: ${error.message}`);
    }
  }

  /**
   * 格式转换智能体
   * 将专长设计转换为标准的PF2e格式
   */
  private async convertToFeatFormat(feat: FeatDesign, templateFeats?: any[]): Promise<PF2eFeatFormat> {
    const systemPrompt = `你是一个PF2e数据格式专家。请将专长设计转换为标准的Foundry VTT PF2e系统格式。

重要要求：
1. **完整的描述内容**：description.value必须包含完整的专长效果说明，使用HTML格式
2. **准确的规则数组**：rules数组包含所有机制效果
3. **正确的数据类型**：确保所有字段类型正确
4. **不要包含_id字段**：让Foundry自动生成
5. **有效的特征值**：只使用PF2e系统中存在的特征
6. **正确的频率值**：如果有frequency，per字段必须是有效值

**重要：严格遵循PF2e官方书写格式标准**：
- 使用标准的PF2e术语和表述方式
- 条件和状态使用PF2e标准名称（如困乏、疲乏、恶心等）
- 数值表述符合PF2e惯例（如"+1状态加值"、"1d6伤害"等）
- 描述风格要符合PF2e官方出版物的语调和格式


**描述格式要求**：
- 使用<p>标签分段
- 重要规则用<strong>加粗
- 条件触发用<em>斜体强调
- 包含完整的前置条件、触发条件、效果描述
- 确保规则文本清晰、准确、易于理解

**PF2e嵌入式引用格式**（重要：方括号[]内必须使用英文）：
- 区域效果：@Template[type:burst|distance:20] 或 @Template[type:cone|distance:15]
- 伤害计算：@Damage[(1+@actor.level)d6[piercing]] 或 @Damage[1d8[fire]]
  （注意：piercing=穿刺, fire=火焰, cold=寒冷, electricity=闪电, acid=强酸等）
- 检定引用：@Check[type:reflex|dc:20|basic:true]
- 职业DC引用：@Check[type:will|dc:resolve(@actor.attributes.classDC.value)]
  （使用 @actor.attributes.classDC.value 引用职业DC，不要使用特定职业名称）
- 动作引用：@UUID[Compendium.pf2e.actionspf2e.Item.Strike]
- 法术引用：@UUID[Compendium.pf2e.spells-srd.Item.Fireball]
- **关键规则**：所有方括号[]内的内容（如伤害类型、检定类型等）都必须使用英文，不能使用中文

**等级缩放公式示例**（数值应随角色等级增长）：
- 临时HP：@actor.level, @actor.level * 2, @actor.level * 3
- 伤害：@Damage[(@actor.level)d6[fire]], @Damage[1d8+floor(@actor.level/4)[slashing]]
- 持续伤害：@Damage[max(1,floor(@actor.level/4))d6[persistent,fire]]
- 治疗：1d8 + @actor.level, @actor.level * 2
- 数学函数：floor()向下取整, max()最大值, min()最小值（避免使用ceil，PF2e默认向下取整）
- 复杂示例：max(5, @actor.level * 2) 表示等级×2点，最少5点

有效的frequency.per值：turn, round, minute, hour, day, week, month, year

请使用JSON格式返回完整的PF2e专长数据。`;

    let userPrompt = `请将以下专长设计转换为PF2e格式：

${JSON.stringify(feat, null, 2)}`;

    // 如果有模板专长，添加为格式参考
    if (templateFeats && templateFeats.length > 0) {
      userPrompt += `\n\n**模板专长格式参考**：\n以下是一些PF2e专长的标准格式，请参考其描述风格和嵌入式引用的使用方式：\n`;
      templateFeats.forEach((template, index) => {
        try {
          userPrompt += `\n模板专长${index + 1} - ${template.name || '未知专长'}:\n`;
          if (template.system?.description?.value) {
            userPrompt += `描述格式参考:\n${template.system.description.value}\n`;
          }
          if (template.system?.rules && Array.isArray(template.system.rules) && template.system.rules.length > 0) {
            userPrompt += `规则结构参考:\n${JSON.stringify(template.system.rules, null, 2)}\n`;
          }
        } catch (error) {
          console.warn(`处理模板专长${index + 1}时出错:`, error);
          userPrompt += `\n模板专长${index + 1} - 数据解析失败，跳过\n`;
        }
      });
      userPrompt += `\n\n请确保description.value包含完整的专长效果描述，并且所有规则都正确实现。格式化时请参考上述模板专长的风格和结构。`;
    } else {
      userPrompt += `\n\n请确保description.value包含完整的专长效果描述，并且所有规则都正确实现。请使用标准的PF2e格式和嵌入式引用。

**重要：嵌入式引用中的方括号[]内必须使用英文，不能使用中文。**`;
    }

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    try {
      // 读取神龛系统的格式转换模型配置
      const game = (globalThis as any).game;
      const formatModel = game?.settings?.get('ai-pf2e-assistant', 'shrineFormatModel') || 'gpt-4o';
      const response = await this.aiService.callService(messages, formatModel);
      return this.parseFormatResponse(response);
    } catch (error) {
      console.error('格式转换失败:', error);
      throw new Error(`格式转换失败: ${error.message}`);
    }
  }

  /**
   * 获取数值平衡指导
   */
  private getBalanceGuidance(level: number, category: string): string {
    return this.balanceData.generateGuidance(level, category);
  }

  /**
   * 解析专长设计响应
   */
  private parseFeatResponse(response: any): FeatDesign {
    console.log('解析专长设计响应:', response);
    
    let parsedContent: any;
    
    // 尝试从function_call解析
    if (response.choices?.[0]?.message?.function_call) {
      try {
        const functionCall = response.choices[0].message.function_call;
        console.log('从function_call解析专长设计:', functionCall.name);
        parsedContent = JSON.parse(functionCall.arguments);
      } catch (error) {
        console.error('function_call解析失败:', error);
      }
    }
    
    // 如果function_call解析失败，尝试从content解析
    if (!parsedContent && response.choices?.[0]?.message?.content) {
      const content = response.choices[0].message.content;
      console.log('尝试从content解析专长设计:', content.substring(0, 200) + '...');
      
      // 尝试提取JavaScript函数调用
      const jsMatch = content.match(/designFeat\s*\(\s*({[\s\S]*?})\s*\)/);
      if (jsMatch) {
        try {
          console.log('提取到JavaScript对象:', jsMatch[1]);
          // 使用Function构造器安全地解析JavaScript对象字面量
          const func = new Function('return ' + jsMatch[1]);
          parsedContent = func();
          console.log('JavaScript解析成功:', parsedContent);
        } catch (jsError) {
          console.log('JavaScript解析失败:', jsError);
          
          // 尝试JSON解析（修复常见错误）
          try {
            const cleanJson = this.fixCommonJsonErrors(jsMatch[1]);
            parsedContent = JSON.parse(cleanJson);
            console.log('修复后JSON解析成功:', parsedContent);
          } catch (jsonError) {
            console.log('修复后JSON解析失败:', jsonError);
          }
        }
      }
      
      // 如果JavaScript解析失败，尝试直接JSON解析
      if (!parsedContent) {
        try {
          const jsonMatch = content.match(/```(?:json|javascript)?\s*({[\s\S]*?})\s*```/) || content.match(/({[\s\S]*})/);
          if (jsonMatch) {
            const cleanJson = this.fixCommonJsonErrors(jsonMatch[1]);
            parsedContent = JSON.parse(cleanJson);
            console.log('从content解析专长设计JSON成功');
          }
        } catch (error) {
          console.log('JSON解析失败:', error);
        }
      }
    }
    
    if (!parsedContent) {
      console.warn('无法解析专长设计响应，使用默认结构');
      return {
        name: '自定义专长',
        description: response.choices?.[0]?.message?.content || '专长描述',
        level: 1,
        actionType: 'passive',
        traits: ['general'],
        prerequisites: [],
        mechanics: [],
        balanceNotes: ['数值平衡需要进一步调整']
      };
    }
    
    return this.convertToFeatDesign(parsedContent);
  }

  /**
   * 将解析的内容转换为标准的FeatDesign格式
   */
  private convertToFeatDesign(data: any): FeatDesign {
    return {
      name: data.name || '未命名专长',
      description: data.description || '专长描述',
      level: data.level || 1,
      actionType: data.actionType || 'passive',
      traits: Array.isArray(data.traits) ? data.traits : ['general'],
      prerequisites: Array.isArray(data.prerequisites) ? data.prerequisites : [],
      mechanics: Array.isArray(data.mechanics) ? data.mechanics : [],
      balanceNotes: Array.isArray(data.balanceNotes) ? data.balanceNotes : []
    };
  }

  /**
   * 解析格式转换响应
   */
  private parseFormatResponse(response: any): PF2eFeatFormat {
    console.log('解析格式转换响应:', response);
    
    let parsedContent: any;
    
    // 尝试从function_call解析
    if (response.choices?.[0]?.message?.function_call) {
      try {
        const functionCall = response.choices[0].message.function_call;
        parsedContent = JSON.parse(functionCall.arguments);
        console.log('从function_call解析格式转换成功');
      } catch (error) {
        console.error('function_call解析失败:', error);
      }
    }
    
    // 如果function_call解析失败，尝试从content解析
    if (!parsedContent && response.choices?.[0]?.message?.content) {
      const content = response.choices[0].message.content;
      console.log('尝试从content解析格式转换:', content.substring(0, 100) + '...');
      
      try {
        // 提取JSON内容
        const jsonMatch = content.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || content.match(/({[\s\S]*})/);
        if (jsonMatch) {
          const cleanJson = this.fixCommonJsonErrors(jsonMatch[1]);
          parsedContent = JSON.parse(cleanJson);
          console.log('从content解析格式转换JSON成功');
        }
      } catch (error) {
        console.log('JSON解析失败:', error);
      }
    }
    
    if (!parsedContent) {
      throw new Error('无法解析格式转换响应');
    }
    
    return this.buildPF2eFeatFormat(parsedContent);
  }

  /**
   * 标准化先决条件格式为 [{value: string}]
   */
  private normalizePrerequisites(rawPrereqs: any): Array<{value: string}> {
    if (!rawPrereqs) return [];
    if (typeof rawPrereqs === 'string') {
      const trimmed = rawPrereqs.trim();
      return trimmed.length > 0 ? [{ value: trimmed }] : [];
    }
    if (!Array.isArray(rawPrereqs)) return [];

    const normalized: Array<{value: string}> = [];
    for (const item of rawPrereqs) {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed.length > 0) normalized.push({ value: trimmed });
      } else if (item && typeof item === 'object') {
        const text = item.value || item.label || item.name;
        if (typeof text === 'string' && text.trim().length > 0) {
          normalized.push({ value: text.trim() });
        }
      }
    }
    return normalized;
  }

  /**
   * 构建标准的PF2e专长格式
   */
  private buildPF2eFeatFormat(args: any): PF2eFeatFormat {
    const result: PF2eFeatFormat = {
      name: args.name || '未命名专长',
      type: "feat",
      img: args.img || "systems/pf2e/icons/features/feats/feats.webp",
      system: {
        description: {
          value: args.system?.description?.value || args.description?.value || '',
          gm: args.system?.description?.gm || args.description?.gm || ''
        },
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
        category: this.validateFeatCategory(args.system?.category) || "general",
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

      // 验证频率值
      const validFrequencyPers = ['turn', 'round', 'minute', 'hour', 'day', 'week', 'month', 'year'];
      if (result.system.frequency.per && !validFrequencyPers.includes(result.system.frequency.per)) {
        console.warn(`无效的frequency.per值: ${result.system.frequency.per}，将其改为'day'`);
        result.system.frequency.per = 'day';
      }
    }

    // 过滤无效的特征
    const validTraits = ['general', 'skill', 'combat', 'spellcasting', 'archetype', 'class', 'ancestry'];
    result.system.traits.value = result.system.traits.value.filter(trait => 
      validTraits.includes(trait) || trait.length > 0
    );

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

  // 以下方法与特性生成器相同，用于集合包搜索
  /**
   * 提取搜索关键词
   */
  private async extractSearchKeywords(prompt: string): Promise<string[]> {
    const keywordPrompt = `请从以下文本中提取2-3个最重要的搜索关键词，用于在Pathfinder 2e集合包中搜索相关内容。
请只返回关键词，用逗号分隔，不要其他解释。

文本: ${prompt}`;

    try {
      const response = await this.aiService.callService([
        { role: 'system', content: '你是一个关键词提取专家。' },
        { role: 'user', content: keywordPrompt }
      ], 'gpt-4o-mini');

      const keywords = response.choices?.[0]?.message?.content
        ?.split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0)
        .slice(0, 3) || [];

      return keywords;
    } catch (error) {
      console.warn('关键词提取失败:', error);
      return [];
    }
  }

  /**
   * 搜索集合包内容
   */
  private async searchCompendiumContent(keywords: string[]): Promise<any[]> {
    const results: any[] = [];
    
    try {
      // 搜索相关的集合包
      const packNames = ['pf2e.feats-srd', 'pf2e.classfeatures', 'pf2e.ancestryfeatures'];
      
      for (const packName of packNames) {
        const pack = game.packs?.get(packName);
        if (!pack) continue;
        
        // 获取集合包内容
        const documents = await pack.getDocuments();
        
        for (const doc of documents) {
          const relevance = this.calculateRelevance(doc, keywords);
          if (relevance > 0.3) {
            results.push({
              name: doc.name,
              type: doc.type,
              description: doc.system?.description?.value || '',
              source: packName,
              relevance: relevance
            });
          }
        }
      }
      
      // 按相关性排序并限制结果数量
      return results
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 5);
        
    } catch (error) {
      console.warn('集合包搜索失败:', error);
      return [];
    }
  }

  /**
   * 计算相关性分数
   */
  private calculateRelevance(doc: any, keywords: string[]): number {
    const text = `${doc.name} ${doc.system?.description?.value || ''}`.toLowerCase();
    let score = 0;
    
    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (text.includes(lowerKeyword)) {
        score += 1;
        // 名称匹配权重更高
        if (doc.name.toLowerCase().includes(lowerKeyword)) {
          score += 0.5;
        }
      }
    }
    
    return score / keywords.length;
  }

  /**
   * 格式化集合包上下文
   */
  private formatCompendiumContext(results: any[]): string {
    if (results.length === 0) return '';
    
    let context = '\n\n=== PF2e官方参考内容（请严格遵循其书写格式和术语标准）===\n';
    for (const result of results) {
      context += `- ${result.name} (${result.type}): ${result.description.replace(/<[^>]*>/g, '').substring(0, 150)}...\n`;
    }
    context += '\n**重要提醒**：请参考上述官方内容的书写格式、术语使用和表述方式，确保生成的内容符合PF2e标准。\n';
    
    return context;
  }
}