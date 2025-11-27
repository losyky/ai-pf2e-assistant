import { RuleElementsKnowledgeService } from './rule-elements-knowledge';
import { EffectItemService, EffectItemData } from './effect-item-service';

const MODULE_ID = 'ai-pf2e-assistant';

/**
 * 相似物品接口
 */
interface SimilarItem {
  id: string;
  name: string;
  type: string;
  packName: string;
  rules: any[];
  description: string;
}

/**
 * 规则元素生成结果接口
 */
export interface RuleElementGenerationResult {
  rules: any[];
  explanation: string;
  similarItems: SimilarItem[];
  effectConfigs?: EffectItemData[]; // 待创建的Effect配置
}

/**
 * Function Calling的函数定义接口
 */
interface FunctionDefinition {
  name: string;
  description: string;
  parameters: any;
}

/**
 * 规则元素生成服务
 * 负责根据物品描述生成Rule Elements配置
 */
export class RuleElementGeneratorService {
  private static instance: RuleElementGeneratorService;
  private knowledgeService: RuleElementsKnowledgeService;
  private effectService: EffectItemService;

  private constructor() {
    this.knowledgeService = RuleElementsKnowledgeService.getInstance();
    this.effectService = EffectItemService.getInstance();
  }

  public static getInstance(): RuleElementGeneratorService {
    if (!RuleElementGeneratorService.instance) {
      RuleElementGeneratorService.instance = new RuleElementGeneratorService();
    }
    return RuleElementGeneratorService.instance;
  }

  /**
   * 生成规则元素（只生成配置，不创建Effect）
   * @param itemData 物品数据
   * @param customRequirements 可选的人工自定义要求
   * @returns 生成结果（包含待创建的Effect配置）
   */
  public async generateRuleElements(
    itemData: any, 
    customRequirements?: string
  ): Promise<RuleElementGenerationResult> {
    try {
      console.log(`${MODULE_ID} | 开始生成规则元素...`);
      
      if (customRequirements) {
        console.log(`${MODULE_ID} | 检测到自定义要求: ${customRequirements}`);
      }

      // 1. 提取物品描述
      const description = this.extractItemDescription(itemData);
      if (!description) {
        throw new Error('物品描述为空，无法生成规则元素');
      }

      // 2. AI分析物品机制（如果没有自定义要求才进行自动分析）
      let mechanics: string[] = [];
      if (!customRequirements) {
        console.log(`${MODULE_ID} | AI分析物品机制...`);
        mechanics = await this.analyzeMechanics(itemData, description);
        console.log(`${MODULE_ID} | 识别到的机制:`, mechanics);
      } else {
        console.log(`${MODULE_ID} | 跳过自动机制分析（使用自定义要求）`);
      }

      // 3. 根据机制搜索相似物品
      const similarItems = await this.searchSimilarItemsByMechanics(
        itemData.type,
        mechanics
      );

      console.log(`${MODULE_ID} | 找到${similarItems.length}个机制相似的物品`);

      // 4. 调用AI生成规则元素
      let { rules, explanation } = await this.callAIToGenerateRules(
        itemData,
        description,
        similarItems,
        mechanics,
        customRequirements
      );

      console.log(`${MODULE_ID} | 成功生成${rules.length}个规则元素`);

      // 5. 分析是否需要创建effect物品（只生成配置，不创建）
      let effectConfigs: EffectItemData[] | undefined = undefined;
      
      const effectAnalysis = this.effectService.analyzeEffectNeeds(itemData);
      
      if (effectAnalysis.needsEffect && effectAnalysis.suggestedEffects.length > 0) {
        console.log(`${MODULE_ID} | 检测到需要创建effect物品: ${effectAnalysis.reasoning}`);
        
        // 请求AI为每个建议的effect生成详细配置
        effectConfigs = await this.generateEffectConfigurations(
          itemData,
          description,
          effectAnalysis.suggestedEffects,
          rules
        );

        console.log(`${MODULE_ID} | 已生成${effectConfigs.length}个Effect配置（待应用时创建）`);
      } else {
        console.log(`${MODULE_ID} | 物品不需要额外的effect物品`);
      }

      return {
        rules,
        explanation,
        similarItems,
        effectConfigs
      };
    } catch (error: any) {
      console.error(`${MODULE_ID} | 生成规则元素失败:`, error);
      throw error;
    }
  }

  /**
   * 应用规则元素并创建Effect（在用户确认后调用）
   * @param itemData 物品数据
   * @param rules 规则元素数组
   * @param effectConfigs Effect配置数组
   * @returns 包含已创建Effect的UUID的更新后规则
   */
  public async applyRulesWithEffects(
    itemData: any,
    rules: any[],
    effectConfigs?: EffectItemData[]
  ): Promise<{ rules: any[]; createdEffects: Array<{ name: string; uuid: string; folder: string }> }> {
    const createdEffects: Array<{ name: string; uuid: string; folder: string }> = [];

    try {
      // 如果有Effect配置，创建它们
      if (effectConfigs && effectConfigs.length > 0) {
        console.log(`${MODULE_ID} | 开始创建${effectConfigs.length}个Effect物品...`);

        for (const effectConfig of effectConfigs) {
          try {
            const { item, uuid, folder } = await this.effectService.createEffectForItem(
              itemData.name,
              effectConfig
            );

            createdEffects.push({
              name: effectConfig.name,
              uuid: uuid,
              folder: folder || ''
            });

            console.log(`${MODULE_ID} | 已创建effect: ${effectConfig.name} (${uuid})`);
          } catch (error) {
            console.error(`${MODULE_ID} | 创建effect失败:`, error);
            // 如果创建失败，回滚已创建的effects
            await this.rollbackCreatedEffects(createdEffects);
            throw error;
          }
        }

        // 将Effect的UUID注入到规则元素中
        if (createdEffects.length > 0) {
          const { rules: updatedRules, description: updatedDescription } = await this.injectEffectUUIDs(
            itemData,
            rules,
            createdEffects.map(e => ({ ...e, type: 'Effect' }))
          );
          rules = updatedRules;

          // 如果描述被更新了，也要应用到物品上
          if (updatedDescription && updatedDescription !== itemData.system?.description?.value) {
            await itemData.update({
              'system.description.value': updatedDescription
            });
          }

          console.log(`${MODULE_ID} | 已将${createdEffects.length}个effect UUID注入到规则元素中`);
        }
      }

      return { rules, createdEffects };
    } catch (error) {
      console.error(`${MODULE_ID} | 应用规则并创建Effect失败:`, error);
      throw error;
    }
  }

  /**
   * 回滚已创建的Effect（清理垃圾数据）
   */
  private async rollbackCreatedEffects(createdEffects: Array<{ name: string; uuid: string; folder: string }>): Promise<void> {
    console.log(`${MODULE_ID} | 回滚已创建的${createdEffects.length}个Effect...`);
    
    for (const effect of createdEffects) {
      try {
        // 从UUID提取ID
        const id = effect.uuid.split('.').pop();
        if (id) {
          await this.effectService.deleteEffectItem(id);
          console.log(`${MODULE_ID} | 已删除effect: ${effect.name}`);
        }
      } catch (error) {
        console.error(`${MODULE_ID} | 删除effect失败:`, error);
      }
    }
  }

  /**
   * 提取物品描述
   */
  private extractItemDescription(item: any): string {
    const description = item.system?.description?.value || item.description?.value || '';
    // 移除HTML标签
    const cleanDescription = description.replace(/<[^>]*>/g, '').trim();
    return cleanDescription || item.name || '';
  }

  /**
   * AI分析物品机制
   */
  private async analyzeMechanics(itemData: any, description: string): Promise<string[]> {
    try {
      const game = (window as any).game;
      const moduleApi = game.modules.get(MODULE_ID)?.api;
      if (!moduleApi) {
        console.warn(`${MODULE_ID} | AI服务不可用，跳过机制分析`);
        return [];
      }

      const systemPrompt = `你是Pathfinder 2e规则专家。你的任务是分析物品描述，提取其中涉及的游戏机制关键词。

**常见PF2e机制类型:**
- 数值修正: attack bonus, damage bonus, AC bonus, saving throw bonus, skill bonus
- 伤害相关: extra damage, damage dice, persistent damage, splash damage
- 抗性/弱点: resistance, weakness, immunity
- 移动相关: speed bonus, fly speed, climb speed, swim speed
- 条件/状态: apply condition, grant condition, remove condition
- 特殊能力: special sense, darkvision, scent, tremorsense
- 动作/反应: extra action, reaction, free action
- 光照/光环: light, aura effect
- 治疗/再生: healing, regeneration, fast healing, temporary HP
- 技能/熟练: skill proficiency, trained, expert, master, legendary
- 特性标签: add trait, grant trait
- 打击相关: strike bonus, attack roll, damage roll
- 法术相关: spell attack, spell DC, spell slot
- 重击效果: critical hit, critical success

请返回与描述相关的机制关键词列表（英文）。`;

      const userPrompt = `物品: ${itemData.name}
类型: ${itemData.type}
描述: ${description}

请识别这个物品涉及的游戏机制，返回机制关键词列表。只返回相关的机制，不要返回无关的。`;

      const functionDefinition = {
        name: 'identifyMechanics',
        description: '识别物品的游戏机制',
        parameters: {
          type: 'object',
          required: ['mechanics'],
          properties: {
            mechanics: {
              type: 'array',
              description: '游戏机制关键词列表',
              items: {
                type: 'string',
                description: '单个机制关键词'
              }
            }
          }
        }
      };

      const result = await moduleApi.callAIAPI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], {
        tools: [{
          type: 'function',
          function: functionDefinition
        }],
        tool_choice: {
          type: 'function',
          function: { name: 'identifyMechanics' }
        }
      });

      const message = result.choices?.[0]?.message || result;
      let mechanics: string[] = [];

      if (message.tool_calls && message.tool_calls.length > 0) {
        const args = typeof message.tool_calls[0].function.arguments === 'string'
          ? JSON.parse(message.tool_calls[0].function.arguments)
          : message.tool_calls[0].function.arguments;
        mechanics = args.mechanics || [];
      } else if (message.function_call) {
        const args = typeof message.function_call.arguments === 'string'
          ? JSON.parse(message.function_call.arguments)
          : message.function_call.arguments;
        mechanics = args.mechanics || [];
      }

      return mechanics.filter(m => m && m.trim().length > 0);
    } catch (error) {
      console.warn(`${MODULE_ID} | 机制分析失败，将使用简单搜索:`, error);
      return [];
    }
  }

  /**
   * 根据机制搜索相似物品
   */
  private async searchSimilarItemsByMechanics(
    itemType: string,
    mechanics: string[]
  ): Promise<SimilarItem[]> {
    try {
      const game = (window as any).game;
      if (!game?.packs) {
        console.warn('游戏数据未加载');
        return [];
      }

      // 如果没有识别到机制，返回空数组（不搜索）
      if (!mechanics || mechanics.length === 0) {
        console.log(`${MODULE_ID} | 没有识别到机制，跳过搜索`);
        return [];
      }

      // 获取所有Item类型的compendium
      const itemPacks = game.packs.filter((pack: any) => 
        pack.documentName === 'Item' && pack.metadata.type === 'Item'
      );

      const similarItems: SimilarItem[] = [];
      const maxItems = 5;

      // 机制匹配得分记录
      const itemScores = new Map<string, { item: any, score: number, matchedMechanics: string[] }>();

      console.log(`${MODULE_ID} | 在合集包中搜索包含以下机制的物品:`, mechanics);

      // 遍历所有物品包
      for (const pack of itemPacks) {
        if (itemScores.size >= maxItems * 3) break; // 预筛选更多候选

        try {
          const index = await pack.getIndex({ 
            fields: ['type', 'system.rules', 'name'] 
          });

          for (const entry of index) {
            // 只看有规则元素的物品
            if (entry.type === itemType && entry.system?.rules && entry.system.rules.length > 0) {
              // 加载完整物品数据以分析规则
              const item = await pack.getDocument(entry._id);
              if (!item || !item.system?.rules) continue;

              // 分析规则元素，匹配机制
              const { score, matchedMechanics } = this.matchMechanicsInRules(item.system.rules, mechanics);

              if (score > 0) {
                itemScores.set(item.id, {
                  item: item,
                  score: score,
                  matchedMechanics: matchedMechanics
                });
              }
            }
          }
        } catch (packError) {
          console.warn(`${MODULE_ID} | 读取物品包 ${pack.metadata.label} 失败:`, packError);
          continue;
        }
      }

      // 按得分排序，取前N个
      const sortedItems = Array.from(itemScores.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, maxItems);

      // 转换为SimilarItem格式
      for (const { item, matchedMechanics } of sortedItems) {
        const pack = game.packs.find((p: any) => p.collection === item.pack);
        similarItems.push({
          id: item.id,
          name: item.name,
          type: item.type,
          packName: pack?.metadata?.label || 'Unknown',
          rules: item.system.rules,
          description: `[匹配机制: ${matchedMechanics.join(', ')}] ${this.extractItemDescription(item).substring(0, 150)}`
        });
      }

      console.log(`${MODULE_ID} | 找到${similarItems.length}个机制匹配的物品`);
      return similarItems;
    } catch (error) {
      console.warn(`${MODULE_ID} | 基于机制的搜索失败:`, error);
      return [];
    }
  }

  /**
   * 匹配规则元素中的机制
   */
  private matchMechanicsInRules(rules: any[], targetMechanics: string[]): { score: number, matchedMechanics: string[] } {
    let score = 0;
    const matchedMechanics: string[] = [];

    // 将规则元素转为文本进行分析
    const rulesText = JSON.stringify(rules).toLowerCase();

    // 机制到规则元素类型的映射
    const mechanicToRuleType: { [key: string]: string[] } = {
      'attack bonus': ['FlatModifier', 'selector:attack'],
      'damage bonus': ['FlatModifier', 'DamageDice', 'selector:damage'],
      'ac bonus': ['FlatModifier', 'selector:ac'],
      'saving throw bonus': ['FlatModifier', 'selector:saving-throw'],
      'skill bonus': ['FlatModifier', 'selector:skill'],
      'extra damage': ['DamageDice', 'RollOption'],
      'damage dice': ['DamageDice'],
      'persistent damage': ['DamageDice', 'persistent'],
      'resistance': ['Resistance'],
      'weakness': ['Weakness'],
      'immunity': ['Immunity'],
      'speed bonus': ['BaseSpeed', 'FlatModifier', 'selector:speed'],
      'fly speed': ['BaseSpeed', 'fly'],
      'climb speed': ['BaseSpeed', 'climb'],
      'swim speed': ['BaseSpeed', 'swim'],
      'apply condition': ['GrantItem', 'condition'],
      'grant condition': ['GrantItem', 'condition'],
      'darkvision': ['Sense', 'darkvision'],
      'light': ['Light', 'TokenLight'],
      'aura': ['Aura'],
      'healing': ['FastHealing', 'Regeneration'],
      'regeneration': ['Regeneration'],
      'fast healing': ['FastHealing'],
      'temporary hp': ['TempHP'],
      'add trait': ['AdjustStrike', 'trait'],
      'strike bonus': ['FlatModifier', 'selector:strike'],
      'critical': ['CriticalSpecialization', 'criticalSuccess']
    };

    for (const mechanic of targetMechanics) {
      const mechanicLower = mechanic.toLowerCase();
      const keywords = mechanicToRuleType[mechanicLower] || [mechanicLower];

      // 检查规则文本中是否包含相关关键词
      let mechanicMatched = false;
      for (const keyword of keywords) {
        if (rulesText.includes(keyword.toLowerCase())) {
          mechanicMatched = true;
          break;
        }
      }

      if (mechanicMatched) {
        score += 10; // 每个匹配的机制+10分
        matchedMechanics.push(mechanic);
      }
    }

    // 额外加分：规则数量合理（不要太简单也不要太复杂）
    if (rules.length >= 1 && rules.length <= 5) {
      score += 2;
    }

    return { score, matchedMechanics };
  }

  /**
   * 搜索相似物品（旧方法，保留作为后备）
   * @param itemName 物品名称
   * @param itemType 物品类型
   * @param description 物品描述
   * @returns 相似物品列表
   */
  public async searchSimilarItems(
    itemName: string,
    itemType: string,
    description: string
  ): Promise<SimilarItem[]> {
    try {
      const game = (window as any).game;
      if (!game?.packs) {
        console.warn('游戏数据未加载');
        return [];
      }

      // 获取所有Item类型的compendium
      const itemPacks = game.packs.filter((pack: any) => 
        pack.documentName === 'Item' && pack.metadata.type === 'Item'
      );

      const similarItems: SimilarItem[] = [];
      const maxItems = 5; // 最多返回5个相似物品

      // 提取关键词用于搜索
      const keywords = this.extractKeywords(itemName, description);
      console.log(`${MODULE_ID} | 搜索关键词:`, keywords);

      // 遍历所有物品包
      for (const pack of itemPacks) {
        if (similarItems.length >= maxItems) break;

        try {
          const index = await pack.getIndex({ 
            fields: ['type', 'system.description.value', 'system.rules', 'name'] 
          });

          for (const entry of index) {
            if (similarItems.length >= maxItems) break;

            // 筛选条件：类型匹配，有规则元素，名称或描述包含关键词
            if (entry.type === itemType && entry.system?.rules && entry.system.rules.length > 0) {
              // 计算相似度
              const similarity = this.calculateSimilarity(
                entry.name,
                entry.system?.description?.value || '',
                keywords
              );

              if (similarity > 0.3) { // 相似度阈值
                // 加载完整物品数据
                const item = await pack.getDocument(entry._id);
                if (item && item.system?.rules) {
                  similarItems.push({
                    id: item.id,
                    name: item.name,
                    type: item.type,
                    packName: pack.metadata.label,
                    rules: item.system.rules,
                    description: this.extractItemDescription(item).substring(0, 200)
                  });
                }
              }
            }
          }
        } catch (packError) {
          console.warn(`${MODULE_ID} | 读取物品包 ${pack.metadata.label} 失败:`, packError);
          continue;
        }
      }

      // 按规则数量排序（有更多规则的物品可能更有参考价值）
      similarItems.sort((a, b) => b.rules.length - a.rules.length);

      return similarItems.slice(0, maxItems);
    } catch (error) {
      console.warn(`${MODULE_ID} | 搜索相似物品失败:`, error);
      return [];
    }
  }

  /**
   * 提取关键词
   */
  private extractKeywords(name: string, description: string): string[] {
    const text = `${name} ${description}`.toLowerCase();
    const keywords = new Set<string>();

    // PF2e常见关键词
    const commonKeywords = [
      'attack', 'damage', 'bonus', 'penalty', 'modifier',
      'ac', 'save', 'saving throw', 'resistance', 'weakness',
      'speed', 'movement', 'fly', 'swim', 'climb',
      'strike', 'weapon', 'spell', 'action', 'reaction',
      'trait', 'condition', 'effect', 'aura', 'light',
      'heal', 'regeneration', 'temp hp', 'fast healing',
      'perception', 'skill', 'proficiency', 'trained',
      'critical', 'success', 'failure', 'degree',
      '攻击', '伤害', '加值', '减值', '修正',
      '护甲', '豁免', '抗性', '弱点', '免疫',
      '速度', '移动', '飞行', '游泳', '攀爬',
      '打击', '武器', '法术', '动作', '反应',
      '特性', '状态', '效果', '光环', '光照',
      '治疗', '再生', '临时生命', '快速治疗',
      '察觉', '技能', '熟练', '受训',
      '重击', '成功', '失败', '程度'
    ];

    for (const keyword of commonKeywords) {
      if (text.includes(keyword)) {
        keywords.add(keyword);
      }
    }

    return Array.from(keywords);
  }

  /**
   * 计算相似度
   */
  private calculateSimilarity(name: string, description: string, keywords: string[]): number {
    const text = `${name} ${description}`.toLowerCase();
    let matchCount = 0;

    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        matchCount++;
      }
    }

    // 相似度 = 匹配的关键词数 / 总关键词数
    return keywords.length > 0 ? matchCount / keywords.length : 0;
  }

  /**
   * 调用AI生成规则元素
   */
  private async callAIToGenerateRules(
    itemData: any,
    description: string,
    similarItems: SimilarItem[],
    mechanics?: string[],
    customRequirements?: string
  ): Promise<{ rules: any[], explanation: string }> {
    // 获取AI服务
    const game = (window as any).game;
    const moduleApi = game.modules.get(MODULE_ID)?.api;
    if (!moduleApi) {
      throw new Error('AI助手模块未正确加载');
    }

    // 构建提示词
    const systemPrompt = this.buildSystemPrompt(customRequirements);
    const userPrompt = this.buildUserPrompt(
      itemData, 
      description, 
      similarItems, 
      mechanics, 
      customRequirements
    );

    // 定义Function Calling Schema
    const functionDefinition: FunctionDefinition = {
      name: 'generateRuleElements',
      description: '生成PF2e规则元素配置数组',
      parameters: {
        type: 'object',
        properties: {
          rules: {
            type: 'array',
            description: '规则元素数组，每个元素是一个规则对象',
            items: {
              type: 'object',
              description: '单个规则元素对象，必须包含key字段',
              properties: {
                key: {
                  type: 'string',
                  description: '规则元素类型，如FlatModifier、DamageDice等'
                }
              },
              required: ['key']
            }
          },
          explanation: {
            type: 'string',
            description: '对生成的规则元素的中文解释说明，说明每个规则的作用'
          }
        },
        required: ['rules', 'explanation']
      }
    };

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    console.log(`${MODULE_ID} | 调用AI生成规则元素...`);

    // 调用AI API - 使用tools格式(新标准)
    const result = await moduleApi.callAIAPI(messages, {
      tools: [{
        type: 'function',
        function: functionDefinition
      }],
      tool_choice: {
        type: 'function',
        function: { name: 'generateRuleElements' }
      }
    });

    console.log(`${MODULE_ID} | AI返回结果:`, result);

    // 解析Function Calling结果
    let rules: any[] = [];
    let explanation = '';

    // 获取消息对象
    const message = result.choices?.[0]?.message || result;
    console.log(`${MODULE_ID} | 消息对象:`, message);

    // 优先检查tool_calls (新格式)
    if (message.tool_calls && message.tool_calls.length > 0) {
      try {
        const toolCall = message.tool_calls[0];
        console.log(`${MODULE_ID} | 检测到tool_calls格式:`, toolCall);
        
        const args = typeof toolCall.function.arguments === 'string'
          ? JSON.parse(toolCall.function.arguments)
          : toolCall.function.arguments;
        
        console.log(`${MODULE_ID} | 解析的tool_call参数:`, args);
        rules = args.rules || [];
        explanation = args.explanation || '';
      } catch (parseError) {
        console.error(`${MODULE_ID} | 解析tool_calls参数失败:`, parseError);
        throw new Error('解析AI返回的规则元素失败');
      }
    } else if (message.function_call) {
      // 向后兼容旧的function_call格式
      try {
        const args = typeof message.function_call.arguments === 'string'
          ? JSON.parse(message.function_call.arguments)
          : message.function_call.arguments;
        
        console.log(`${MODULE_ID} | 解析的function_call参数:`, args);
        rules = args.rules || [];
        explanation = args.explanation || '';
      } catch (parseError) {
        console.error(`${MODULE_ID} | 解析Function Calling参数失败:`, parseError);
        throw new Error('解析AI返回的规则元素失败');
      }
    } else if (message.content) {
      // 如果没有function_call，尝试从content中解析JSON
      console.log(`${MODULE_ID} | 尝试从content解析:`, message.content);
      try {
        // 先尝试直接解析content
        let parsed = JSON.parse(message.content);
        
        // 检查是否是包装的function call格式
        if (parsed.name && parsed.arguments) {
          console.log(`${MODULE_ID} | 检测到包装的function call格式`);
          // 解析arguments字段
          const args = typeof parsed.arguments === 'string' 
            ? JSON.parse(parsed.arguments) 
            : parsed.arguments;
          rules = args.rules || [];
          explanation = args.explanation || '';
        } else {
          // 直接是规则数据
          rules = parsed.rules || [];
          explanation = parsed.explanation || '';
        }
      } catch (e) {
        console.warn(`${MODULE_ID} | JSON解析失败，尝试正则提取:`, e);
        // 如果直接解析失败，尝试正则提取
        try {
          const jsonMatch = message.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.name && parsed.arguments) {
              const args = typeof parsed.arguments === 'string' 
                ? JSON.parse(parsed.arguments) 
                : parsed.arguments;
              rules = args.rules || [];
              explanation = args.explanation || '';
            } else {
              rules = parsed.rules || [];
              explanation = parsed.explanation || '';
            }
          }
        } catch (e2) {
          console.error(`${MODULE_ID} | 所有解析方法都失败:`, e2);
        }
      }
    }

    console.log(`${MODULE_ID} | 解析结果 - rules数量: ${rules.length}, explanation: ${explanation ? '有' : '无'}`);

    // 验证规则元素
    if (!rules || rules.length === 0) {
      throw new Error('AI未能生成有效的规则元素');
    }

    // 验证每个规则都有key字段
    for (const rule of rules) {
      if (!rule.key) {
        throw new Error('生成的规则元素缺少必需的key字段');
      }
    }

    return { rules, explanation };
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(customRequirements?: string): string {
    const knowledge = this.knowledgeService.getFullKnowledge();
    
    let systemPrompt = `你是一个Pathfinder 2e规则专家，精通PF2e系统的Rule Elements（规则元素）配置。

你的任务是根据物品的描述，分析其需要自动化的规则效果，然后生成对应的Rule Elements配置。

${knowledge}

`;

    if (customRequirements) {
      systemPrompt += `**特别重要：用户提供了自定义实现要求**
用户明确指定了如何实现规则元素。你必须：
1. **优先遵循用户的自定义要求**来生成规则元素
2. 用户的要求是最高优先级，必须严格按照要求实现
3. 在实现用户要求的基础上，参考物品描述补充其他必要的规则
4. 如果用户要求与物品描述有冲突，以用户要求为准
5. 确保完全理解并实现用户的具体要求

`;
    }

    systemPrompt += `重要原则：
1. ${customRequirements ? '**首要任务：严格遵循用户的自定义要求**' : '仔细阅读物品描述，识别所有可以自动化的效果'}
2. 选择最合适的规则元素类型来实现这些效果
3. 确保规则元素的JSON格式完全正确
4. 为复杂条件使用predicate（谓词）
5. 使用正确的selector（选择器）
6. 提供清晰的label（标签）说明
7. 参考相似物品的规则元素作为示例
8. 如果描述中没有明确的自动化效果，也要生成基本的规则元素（如添加trait等）
9. 必须使用提供的generateRuleElements函数返回结果

**效果划分重要原则:**
- 主物品只包含：永久被动效果、选择配置(ChoiceSet)、光环(Aura)、使用说明(Note)
- 临时战术增益(攻击加值、伤害加值、AC加值等)应该由系统自动创建为Effect物品
- 不要在主物品中包含临时战术增益的rules

**AdjustStrike的正确使用:**
- ✅ property可以是: "weapon-traits", "materials", "property-runes", "range-increment"
- ❌ 不要使用: "damage-die", "damage-dice"
- 如需修改伤害骰，应该在Effect物品中使用DamageDice规则元素

你必须使用提供的函数来返回规则元素配置。`;

    return systemPrompt;
  }

  /**
   * 构建用户提示词
   */
  private buildUserPrompt(
    itemData: any,
    description: string,
    similarItems: SimilarItem[],
    mechanics?: string[],
    customRequirements?: string
  ): string {
    let prompt = `请为以下物品生成Rule Elements配置：

**物品信息**
- 名称: ${itemData.name}
- 类型: ${itemData.type}
- 等级: ${itemData.system?.level?.value || 'N/A'}
- 特性: ${itemData.system?.traits?.value?.join(', ') || 'N/A'}

**物品描述**
${description}

`;

    // 优先添加自定义要求
    if (customRequirements) {
      prompt += `\n**⭐ 用户自定义实现要求（最高优先级）**\n`;
      prompt += `用户明确指定了以下实现要求，你必须严格遵循这些要求来生成规则元素：\n\n`;
      prompt += `${customRequirements}\n\n`;
      prompt += `**重要提醒：**\n`;
      prompt += `1. 上述自定义要求是最高优先级，必须完全按照要求实现\n`;
      prompt += `2. 在满足自定义要求的基础上，可以参考物品描述补充其他规则\n`;
      prompt += `3. 如果自定义要求与物品描述有任何冲突，以自定义要求为准\n\n`;
    }

    // 添加识别的机制（仅在没有自定义要求时）
    if (mechanics && mechanics.length > 0 && !customRequirements) {
      prompt += `\n**识别到的游戏机制**\n`;
      prompt += `通过分析描述，识别到以下需要实现的游戏机制：\n`;
      for (const mechanic of mechanics) {
        prompt += `- ${mechanic}\n`;
      }
      prompt += `\n请确保为这些机制生成相应的规则元素。\n\n`;
    }

    // 添加相似物品示例
    if (similarItems && similarItems.length > 0) {
      prompt += `\n**参考示例（来自官方合集包的机制相似物品）**\n`;
      prompt += `以下物品包含类似的游戏机制，可以参考它们的规则元素配置方式：\n\n`;

      for (const item of similarItems) {
        prompt += `### ${item.name} (${item.packName})\n`;
        prompt += `${item.description}\n`;
        prompt += `规则元素示例:\n`;
        prompt += `\`\`\`json\n${JSON.stringify(item.rules, null, 2)}\n\`\`\`\n\n`;
      }
      
      prompt += `**重要**: 这些示例仅供参考其规则结构和写法，`;
      if (customRequirements) {
        prompt += `请优先按照用户的自定义要求生成规则。\n\n`;
      } else {
        prompt += `请根据当前物品的实际描述生成规则，不要直接复制示例。\n\n`;
      }
    }

    if (customRequirements) {
      prompt += `\n请严格按照用户的自定义要求生成规则元素配置。

要求：
1. **最重要：完全遵循用户的自定义要求，这是最高优先级**
2. 规则元素必须是有效的JSON格式
3. 每个规则必须包含key字段
4. 按照用户指定的方式实现规则类型和配置
5. 如果用户要求使用特定的规则元素类型，必须使用该类型
6. 如果用户指定了条件，正确使用predicate实现
7. 提供清晰的label标签（中文）
8. 使用中文解释每个规则的作用，说明如何实现了用户的要求

使用generateRuleElements函数返回结果。`;
    } else {
      prompt += `\n请分析物品描述和识别的机制，生成合适的规则元素配置。

要求：
1. 规则元素必须是有效的JSON格式
2. 每个规则必须包含key字段
3. 根据识别的机制选择最合适的规则类型
4. 参考示例的结构和写法，但要根据当前物品的实际内容生成
5. 如果有条件触发，使用predicate
6. 提供清晰的label标签（中文）
7. 使用中文解释每个规则的作用

使用generateRuleElements函数返回结果。`;
    }

    return prompt;
  }

  /**
   * 验证规则元素
   */
  public validateRuleElements(rules: any[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!Array.isArray(rules)) {
      errors.push('规则元素必须是数组');
      return { valid: false, errors };
    }

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      
      // 检查是否是对象
      if (typeof rule !== 'object' || rule === null) {
        errors.push(`规则 ${i + 1} 必须是对象`);
        continue;
      }

      // 检查key字段
      if (!rule.key) {
        errors.push(`规则 ${i + 1} 缺少必需的key字段`);
        continue;
      }

      // 检查key是否是已知类型
      const knownTypes = this.knowledgeService.getCommonRuleElementTypes();
      if (!knownTypes.includes(rule.key)) {
        // 警告但不视为错误
        console.warn(`${MODULE_ID} | 规则 ${i + 1} 使用了不常见的key类型: ${rule.key}`);
      }

      // 检查特定规则类型的必需字段
      if (rule.key === 'FlatModifier' && !rule.selector) {
        errors.push(`规则 ${i + 1} (FlatModifier) 缺少selector字段`);
      }

      if (rule.key === 'DamageDice' && !rule.selector) {
        errors.push(`规则 ${i + 1} (DamageDice) 缺少selector字段`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 复查并修正规则元素
   * @param itemData 物品数据
   * @param originalRules 原始规则元素
   * @param validationErrors 验证错误列表
   * @returns 修正后的规则元素
   */
  public async reviewAndFixRules(
    itemData: any,
    originalRules: any[],
    validationErrors: string[]
  ): Promise<{ rules: any[]; explanation: string }> {
    try {
      console.log(`${MODULE_ID} | 开始复查修正规则元素...`);
      console.log(`${MODULE_ID} | 验证错误:`, validationErrors);
      console.log(`${MODULE_ID} | 原始规则:`, originalRules);

      // 构建复查修正的提示词
      const systemPrompt = this.buildReviewSystemPrompt();
      const userPrompt = this.buildReviewUserPrompt(itemData, originalRules, validationErrors);

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      console.log(`${MODULE_ID} | 发送复查修正请求到AI...`);

      // 调用AI API进行修正
      const moduleApi = (window as any).game.modules.get(MODULE_ID)?.api;
      if (!moduleApi?.callAIAPI) {
        throw new Error('AI助手模块未正确加载');
      }

      const functionDefinition: FunctionDefinition = {
        name: 'fixRuleElements',
        description: '修正Pathfinder 2e规则元素配置',
        parameters: {
          type: 'object',
          required: ['rules', 'explanation'],
          properties: {
            rules: {
              type: 'array',
              description: '修正后的规则元素数组',
              items: {
                type: 'object',
                description: '单个规则元素配置'
              }
            },
            explanation: {
              type: 'string',
              description: '修正说明：简要说明发现的问题以及如何修正的'
            }
          }
        }
      };

      const result = await moduleApi.callAIAPI(messages, {
        tools: [{
          type: 'function',
          function: functionDefinition
        }],
        tool_choice: {
          type: 'function',
          function: { name: 'fixRuleElements' }
        }
      });

      console.log(`${MODULE_ID} | AI复查修正返回结果:`, result);

      // 解析AI返回的修正结果
      let rules: any[] = [];
      let explanation = '';

      // 首先尝试从标准的choices[0].message.tool_calls路径解析
      if (result.choices && result.choices.length > 0) {
        const message = result.choices[0].message;
        
        if (message.tool_calls && message.tool_calls.length > 0) {
          const toolCall = message.tool_calls[0];
          const args = typeof toolCall.function.arguments === 'string'
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments;
          
          rules = args.rules || [];
          explanation = args.explanation || '';
          console.log(`${MODULE_ID} | 从tool_calls解析成功，获得${rules.length}个规则`);
        } else if (message.function_call) {
          // 向后兼容旧的function_call格式
          const args = typeof message.function_call.arguments === 'string'
            ? JSON.parse(message.function_call.arguments)
            : message.function_call.arguments;
          
          rules = args.rules || [];
          explanation = args.explanation || '';
          console.log(`${MODULE_ID} | 从function_call解析成功`);
        } else if (message.content) {
          // 尝试从content中解析
          try {
            let parsed = JSON.parse(message.content);
            
            if (parsed.name && parsed.arguments) {
              const args = typeof parsed.arguments === 'string' 
                ? JSON.parse(parsed.arguments) 
                : parsed.arguments;
              rules = args.rules || [];
              explanation = args.explanation || '';
            } else {
              rules = parsed.rules || [];
              explanation = parsed.explanation || '';
            }
            console.log(`${MODULE_ID} | 从content解析成功`);
          } catch (e) {
            const jsonMatch = message.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.name && parsed.arguments) {
                const args = typeof parsed.arguments === 'string' 
                  ? JSON.parse(parsed.arguments) 
                  : parsed.arguments;
                rules = args.rules || [];
                explanation = args.explanation || '';
              } else {
                rules = parsed.rules || [];
                explanation = parsed.explanation || '';
              }
              console.log(`${MODULE_ID} | 从content正则匹配解析成功`);
            }
          }
        }
      } else {
        // 后备：尝试直接从result解析（用于非标准响应格式）
        const message = result.message || result;
        
        if (message.tool_calls && message.tool_calls.length > 0) {
          const toolCall = message.tool_calls[0];
          const args = typeof toolCall.function.arguments === 'string'
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments;
          
          rules = args.rules || [];
          explanation = args.explanation || '';
          console.log(`${MODULE_ID} | 从后备路径tool_calls解析成功`);
        }
      }

      if (!rules || rules.length === 0) {
        console.error(`${MODULE_ID} | 解析失败，完整响应:`, JSON.stringify(result, null, 2));
        throw new Error('AI未能生成修正后的规则元素');
      }

      console.log(`${MODULE_ID} | 复查修正完成，修正了${rules.length}个规则元素`);

      return { rules, explanation };
    } catch (error: any) {
      console.error(`${MODULE_ID} | 复查修正失败:`, error);
      throw error;
    }
  }

  /**
   * 构建复查修正的系统提示词
   */
  private buildReviewSystemPrompt(): string {
    return `你是一个Pathfinder 2e规则元素(Rule Elements)的专家。你的任务是根据Foundry VTT返回的验证错误信息，修正规则元素配置中的问题。

${this.knowledgeService.getFullKnowledge()}

**你的职责:**
1. 仔细阅读验证错误信息
2. 分析原始规则元素配置中的问题
3. 根据Rule Elements Wiki知识库修正这些问题
4. 确保修正后的规则元素语法正确、逻辑合理
5. 保持原有规则的功能意图不变，只修正错误

**常见错误类型:**
1. **字段拼写错误**: selector vs selectors, predicate vs predicates
2. **类型错误**: value应该是数字但提供了字符串
3. **必需字段缺失**: 如FlatModifier缺少selector
4. **无效的key值**: 使用了不存在的规则元素类型
5. **predicate语法错误**: 错误的predicate数组格式
6. **selector错误**: 无效的selector字符串

**修正原则:**
1. 优先修正明显的语法错误
2. 参考相似的工作示例
3. 保持规则的简洁性
4. 确保规则符合PF2e系统的约定

请使用fixRuleElements函数返回修正后的规则元素。`;
  }

  /**
   * 构建复查修正的用户提示词
   */
  private buildReviewUserPrompt(
    itemData: any,
    originalRules: any[],
    validationErrors: string[]
  ): string {
    const rulesJson = JSON.stringify(originalRules, null, 2);
    const errorsText = validationErrors.join('\n');
    
    return `请修正以下物品的规则元素配置：

**物品信息:**
- 名称: ${itemData.name}
- 类型: ${itemData.type}
- 等级: ${itemData.system?.level?.value || 'N/A'}

**原始规则元素配置:**
\`\`\`json
${rulesJson}
\`\`\`

**Foundry VTT验证错误:**
${errorsText}

**请按照以下步骤修正:**
1. 识别错误中提到的具体问题
2. 定位问题所在的规则元素和字段
3. 根据Rule Elements Wiki的规范进行修正
4. 确保修正后的规则保持原有功能意图
5. 提供简要的修正说明

请返回修正后的完整规则元素数组和修正说明。`;
  }

  /**
   * 生成effect配置
   * 请求AI为每个建议的effect生成详细的配置
   */
  private async generateEffectConfigurations(
    itemData: any,
    description: string,
    suggestedEffects: Array<{ type: string; name: string; description: string }>,
    existingRules: any[]
  ): Promise<EffectItemData[]> {
    try {
      const game = (window as any).game;
      const moduleApi = game.modules.get(MODULE_ID)?.api;
      if (!moduleApi) {
        console.warn(`${MODULE_ID} | AI服务不可用，使用默认effect配置`);
        return suggestedEffects.map(effect => this.createDefaultEffectData(effect, itemData));
      }

      const systemPrompt = `你是PF2e规则专家，专门创建effect物品配置。
      
effect物品用于实现专长或道具的非常态效果，通常需要单独施加的buff或状态。

**effect物品的特点:**
1. 类型为"effect"
2. 有明确的持续时间（duration）
3. 包含rules数组定义实际游戏效果
4. 可以施加给角色或其他单位
5. 通常配合RollOption（开关）或GrantItem使用

**常见effect类型:**
- **Toggle效果**: 可开关的持续性增益（如战斗姿态、光环）
- **Aura效果**: 影响周围单位的光环效果
- **Target效果**: 施加给目标的buff/debuff
- **Duration效果**: 有明确持续时间的临时效果

**重要的数据格式规范:**
1. duration.expiry 只能是: "turn-start", "turn-end", null
2. traits 必须是空数组 [] （Effect不使用traits）
3. rarity 只能是: "common", "uncommon", "rare", "unique"

请根据物品描述生成完整的effect配置。`;

      const userPrompt = `物品信息:
名称: ${itemData.name}
类型: ${itemData.type}
等级: ${itemData.system?.level?.value || 1}
描述: ${description}

建议创建的effect:
${suggestedEffects.map((e, i) => `${i + 1}. ${e.name} (${e.type}): ${e.description}`).join('\n')}

已生成的规则元素（用于参考，理解主物品的机制）:
${JSON.stringify(existingRules, null, 2)}

请为每个建议的effect生成完整配置，包括:
- name: effect名称（必须以 "Effect: " 开头，例如 "Effect: Defensive Stance"）
- description: HTML格式的描述（说明由哪个专长/物品授予）
- level: 等级（与主物品相同）
- duration: 持续时间对象
- rules: 规则元素数组（实现effect的实际效果）
- traits: 特征标签数组
- rarity: 稀有度

**重要:**
1. effect的name必须以 "Effect: " 开头，这是PF2e系统的命名规范
2. effect的rules应该包含实际的游戏效果（如FlatModifier、Resistance等）
3. 描述中应包含: <p>由 @UUID[...] 授予</p> （但现在先用物品名称）
4. duration应该根据effect类型设置合理值
5. 如果是toggle型，duration应该是unlimited
6. 如果是target型，duration应该有明确的时间单位
7. **duration.expiry 必须是 "turn-start", "turn-end", 或 null，不能是其他值**
8. **traits 必须是空数组 []，Effect不使用traits字段**`;

      const functionDefinition = {
        name: 'generateEffectConfigurations',
        description: '生成effect物品配置数组',
        parameters: {
          type: 'object',
          properties: {
            effects: {
              type: 'array',
              description: 'effect配置数组',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'effect名称（必须以"Effect: "开头）' },
                  description: { type: 'string', description: 'HTML格式描述' },
                  level: { type: 'number', description: '等级' },
                  duration: {
                    type: 'object',
                    properties: {
                      expiry: { type: 'string' },
                      sustained: { type: 'boolean' },
                      unit: { type: 'string' },
                      value: { type: 'number' }
                    }
                  },
                  rules: {
                    type: 'array',
                    description: '规则元素数组',
                    items: { type: 'object' }
                  },
                  traits: {
                    type: 'array',
                    items: { type: 'string' }
                  },
                  rarity: { type: 'string' }
                },
                required: ['name', 'description', 'level', 'duration', 'rules']
              }
            }
          },
          required: ['effects']
        }
      };

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      const result = await moduleApi.callAIAPI(messages, {
        tools: [{
          type: 'function',
          function: functionDefinition
        }],
        tool_choice: {
          type: 'function',
          function: { name: 'generateEffectConfigurations' }
        }
      });

      console.log(`${MODULE_ID} | AI返回的effect配置结果:`, result);

      // 解析结果 - 支持多种格式
      let toolCalls = null;
      
      // 格式1: 直接在result中的tool_calls
      if (result.tool_calls && result.tool_calls.length > 0) {
        toolCalls = result.tool_calls;
      }
      // 格式2: 在choices[0].message.tool_calls中
      else if (result.choices?.[0]?.message?.tool_calls?.length > 0) {
        toolCalls = result.choices[0].message.tool_calls;
      }

      if (toolCalls && toolCalls.length > 0) {
        const functionCall = toolCalls[0];
        if (functionCall.function && functionCall.function.arguments) {
          try {
            const argsString = typeof functionCall.function.arguments === 'string' 
              ? functionCall.function.arguments 
              : JSON.stringify(functionCall.function.arguments);
            const parsed = JSON.parse(argsString);
            
            if (parsed.effects && Array.isArray(parsed.effects) && parsed.effects.length > 0) {
              console.log(`${MODULE_ID} | 成功解析AI生成的${parsed.effects.length}个effect配置`);
              return parsed.effects;
            }
          } catch (parseError) {
            console.error(`${MODULE_ID} | 解析effect配置失败:`, parseError);
          }
        }
      }

      // 如果AI调用失败，使用默认配置
      console.warn(`${MODULE_ID} | AI未返回有效的effect配置，使用默认配置`);
      return suggestedEffects.map(effect => this.createDefaultEffectData(effect, itemData));

    } catch (error) {
      console.error(`${MODULE_ID} | 生成effect配置失败:`, error);
      return suggestedEffects.map(effect => this.createDefaultEffectData(effect, itemData));
    }
  }

  /**
   * 创建默认的effect数据
   */
  private createDefaultEffectData(
    suggestion: { type: string; name: string; description: string },
    itemData: any
  ): EffectItemData {
    const level = itemData.system?.level?.value || 1;
    
    // 根据类型设置默认持续时间
    let duration: EffectItemData['duration'];
    switch (suggestion.type) {
      case 'toggle':
      case 'aura':
      case 'stance':
        duration = {
          expiry: null as any,
          sustained: false,
          unit: 'unlimited',
          value: -1
        };
        break;
      case 'target':
        duration = {
          expiry: 'turn-start',
          sustained: false,
          unit: 'minutes',
          value: 1
        };
        break;
      case 'duration':
        duration = {
          expiry: 'turn-start',
          sustained: false,
          unit: 'rounds',
          value: 1
        };
        break;
      default:
        duration = {
          expiry: 'turn-start',
          sustained: false,
          unit: 'unlimited',
          value: -1
        };
    }

    // 确保名称以 "Effect: " 开头
    let effectName = suggestion.name;
    if (!effectName.startsWith('Effect: ')) {
      effectName = `Effect: ${effectName}`;
    }

    // 确保duration.expiry是有效值
    if (duration.expiry && !['turn-start', 'turn-end'].includes(duration.expiry as string)) {
      console.warn(`${MODULE_ID} | 无效的expiry值: ${duration.expiry}，改为turn-start`);
      duration.expiry = 'turn-start';
    }

    return {
      name: effectName,
      description: `<p>由 ${itemData.name} 授予</p><p>${suggestion.description}</p>`,
      level: level,
      duration: duration,
      rules: [], // 默认空规则，稍后可以手动添加
      traits: [], // Effect必须使用空数组
      rarity: 'common',
      showTokenIcon: true
    };
  }

  /**
   * 将effect的UUID注入到物品中
   * 策略: 
   * 1. 如果是光环(Aura规则元素) -> 注入到Aura.effects中
   * 2. 其他情况 -> 添加到描述中作为UUID链接或Note规则
   */
  private injectEffectUUIDs(
    itemData: any,
    rules: any[],
    createdEffects: Array<{ name: string; uuid: string; folder: string; type?: string }>
  ): { rules: any[]; description: string } {
    const updatedRules = [...rules];
    let description = itemData.system?.description?.value || itemData.description?.value || '';

    for (const effect of createdEffects) {
      // 查找是否有Aura规则元素
      const auraRuleIndex = updatedRules.findIndex(rule => rule.key === 'Aura');

      if (auraRuleIndex >= 0 && effect.type === 'Aura') {
        // 光环效果 - 注入到Aura规则中
        const auraRule = updatedRules[auraRuleIndex];
        if (!auraRule.effects) {
          auraRule.effects = [];
        }
        auraRule.effects.push({
          uuid: effect.uuid,
          affects: 'enemies' // 默认影响敌人,可根据需要调整
        });
        console.log(`${MODULE_ID} | 已将effect UUID注入到Aura规则中: ${effect.uuid}`);
      } else {
        // 非光环效果 - 添加Note规则说明如何使用
        const noteRule: any = {
          key: 'Note',
          selector: 'self',
          title: '使用说明',
          text: `使用此能力后,将 @UUID[${effect.uuid}]{${effect.name}} 添加到角色身上(从物品目录拖拽或点击链接)`
        };

        updatedRules.push(noteRule);
        console.log(`${MODULE_ID} | 已添加Note规则引用effect: ${effect.name}`);
      }
    }

    // 在描述中也添加effect引用
    if (createdEffects.length > 0) {
      description = this.addEffectReferencesToDescription(description, createdEffects);
    }

    return { rules: updatedRules, description };
  }

  /**
   * 将effect引用添加到物品描述中
   * 在description.value中添加UUID链接
   */
  public addEffectReferencesToDescription(
    description: string,
    createdEffects: Array<{ name: string; uuid: string }>
  ): string {
    if (createdEffects.length === 0) {
      return description;
    }

    let updatedDescription = description;

    // 在描述末尾添加效果链接
    updatedDescription += '\n<hr />\n<p><strong>效果</strong>:</p>\n<ul>\n';
    
    for (const effect of createdEffects) {
      updatedDescription += `<li>@UUID[${effect.uuid}]{${effect.name}} - 点击添加效果</li>\n`;
    }
    
    updatedDescription += '</ul>';

    console.log(`${MODULE_ID} | 已将${createdEffects.length}个effect引用添加到描述中`);

    return updatedDescription;
  }
}

