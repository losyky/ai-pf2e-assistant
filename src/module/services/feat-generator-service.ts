import { AIService } from './ai-service';
import { Message } from '../../types/api';
import {
  PREREQUISITES_PRINCIPLE,
  FEAT_DESIGN_GUIDANCE,
  DESCRIPTION_PRINCIPLE,
  PF2E_FORMAT_STANDARD,
  TECHNICAL_REQUIREMENTS,
  FEAT_KNOWLEDGE_UNIFIED_GUIDE,
  MECHANISM_DESCRIPTION_GUIDE
} from './prompt-templates';
import {
  parseFunctionCallResponse,
  buildPF2eFeatFormat,
  sanitizeFeatData,
  validateActionTypeTriggerConsistency,
  validateFeatCategory
} from '../utils/pf2e-data-utils';

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
 * 专长生成的 Function Calling Schema
 */
const FEAT_GENERATION_SCHEMA = {
  name: "generateFeat",
  description: "生成一个完整的PF2e专长，包含所有必需字段",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "专长名称（中文）"
      },
      type: {
        type: "string",
        enum: ["feat"],
        description: "物品类型，必须是feat"
      },
      img: {
        type: "string",
        description: "专长图标路径，可以留空使用默认图标"
      },
      system: {
        type: "object",
        properties: {
          description: {
            type: "object",
            properties: {
              value: {
                type: "string",
                description: "专长的完整HTML格式描述，必须包含所有效果、触发条件、持续时间等信息。这是最重要的字段！",
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
            items: { type: "object" }
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
          category: {
            type: "string",
            enum: ["general", "skill", "ancestry", "class", "bonus"],
            description: "专长类别"
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
              max: { type: "number", description: "最大使用次数" },
              per: {
                type: "string",
                enum: ["turn", "round", "PT1M", "PT10M", "PT1H", "day", "P1W", "P1M"],
                description: "频次周期"
              }
            },
            required: ["max", "per"],
            description: "使用频次限制（可选）"
          },
          prerequisites: {
            type: "object",
            properties: {
              value: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    value: { type: "string", description: "先决条件文字描述" }
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
 * 专长生成器服务
 * 使用 Function Calling 和完整的 PF2e 知识库生成高质量专长
 */
export class FeatGeneratorService {
  private aiService: AIService;
  private compendiumSearchEnabled: boolean = true;
  private balanceData: any;

  constructor(aiService: AIService, balanceData: any) {
    this.aiService = aiService;
    this.balanceData = balanceData;
  }

  setCompendiumSearchEnabled(enabled: boolean) {
    this.compendiumSearchEnabled = enabled;
  }

  /**
   * 生成专长（单步 Function Calling 流程）
   */
  async generateFeat(prompt: string, level: number = 1, category: string = 'general', className?: string, templateFeats?: any[]): Promise<PF2eFeatFormat> {
    console.log(`[FeatGenerator] 开始生成专长: "${prompt}", 等级=${level}, 类别=${category}, 职业=${className || '通用'}`);

    let compendiumContext = '';
    if (this.compendiumSearchEnabled) {
      try {
        const keywords = await this.extractSearchKeywords(prompt);
        if (keywords.length > 0) {
          const searchResults = await this.searchCompendiumContent(keywords);
          compendiumContext = this.formatCompendiumContext(searchResults);
          console.log('[FeatGenerator] 集合包搜索完成，找到', searchResults.length, '个相关条目');
        }
      } catch (searchError) {
        console.warn('[FeatGenerator] 集合包搜索失败，继续生成:', searchError);
      }
    }

    const systemPrompt = this.buildSystemPrompt(level, category, className);
    const userPrompt = this.buildUserPrompt(prompt, level, category, className, compendiumContext, templateFeats);

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    // 输出提示词用于调试
    console.log('=== 专长生成系统提示词 ===');
    console.log(systemPrompt);
    console.log('=== 系统提示词结束 ===');
    console.log('=== 专长生成用户提示词 ===');
    console.log(userPrompt);
    console.log('=== 用户提示词结束 ===');

    let parsedContent: any;

    try {
      const game = (globalThis as any).game;
      const model = game?.settings?.get('ai-pf2e-assistant', 'shrineDirectModel') || 'gpt-4o';

      const response = await this.aiService.callService(messages, {
        temperature: 0.7,
        model: model,
        tools: [{
          type: 'function',
          function: FEAT_GENERATION_SCHEMA
        }],
        tool_choice: { type: 'function', function: { name: 'generateFeat' } }
      });

      parsedContent = parseFunctionCallResponse(response, 'generateFeat');

      if (parsedContent) {
        console.log('[FeatGenerator] Function Calling 成功解析专长数据');
      } else {
        throw new Error('Function Calling 未返回有效数据');
      }
    } catch (error) {
      console.error('[FeatGenerator] Function Calling 失败，尝试 fallback:', error);

      // Fallback: 普通文本生成
      try {
        const game = (globalThis as any).game;
        const model = game?.settings?.get('ai-pf2e-assistant', 'shrineDirectModel') || 'gpt-4o';
        const fallbackResponse = await this.aiService.callService(messages, {
          temperature: 0.5,
          model: model
        });
        parsedContent = parseFunctionCallResponse(fallbackResponse);
        if (!parsedContent) {
          throw new Error('Fallback 也无法解析响应');
        }
      } catch (fallbackError) {
        console.error('[FeatGenerator] Fallback 也失败:', fallbackError);
        throw new Error(`专长生成失败: ${(error as Error).message}`);
      }
    }

    // 构建标准 PF2e 格式
    const feat = buildPF2eFeatFormat(parsedContent);

    // 强制设置 category（确保与用户选择一致）
    feat.system.category = validateFeatCategory(category);

    // 清理和修复数据
    const sanitized = sanitizeFeatData(feat);

    // 验证动作类型与触发一致性
    validateActionTypeTriggerConsistency(sanitized);

    console.log('[FeatGenerator] 专长生成完成:', sanitized.name);
    return sanitized as PF2eFeatFormat;
  }

  /**
   * 构建系统提示词（包含完整的 PF2e 知识库）
   */
  private buildSystemPrompt(level: number, category: string, className?: string): string {
    const balanceGuidance = this.getBalanceGuidance(level, category);
    const complexity = this.getComplexityForLevel(level, category);
    const mechanismGuide = MECHANISM_DESCRIPTION_GUIDE.getGuide(complexity);

    return `你是一个专业的Pathfinder 2e专长设计师。你需要根据用户需求生成完整的PF2e专长数据。

**🌏 语言要求（最高优先级）**：
- **专长名称（name字段）使用"中文 英文"双语格式**，如"诱人表演 Alluring Performance"
- 所有描述内容（description.value）必须使用中文
- 所有结构标签必须使用中文（需求、触发、频率、效果、特殊、启动、豁免）
- ❌ 禁止使用英文标签（Requirements, Trigger, Frequency, Effect, Activate 等）
- 动作组件特征翻译为中文（concentrate→专注, manipulate→交互, envision→想象, command→命令）
- UUID引用显示文本使用双语格式：{恶心 Sickened 1}
- 嵌入式引用（@Damage、@Check等）方括号内使用英文

---

## 数值平衡指导

${balanceGuidance}

---

${FEAT_DESIGN_GUIDANCE}

---

${PREREQUISITES_PRINCIPLE}

---

## 机制设计参考

${mechanismGuide}

---

${FEAT_KNOWLEDGE_UNIFIED_GUIDE}

---

${DESCRIPTION_PRINCIPLE}

${PF2E_FORMAT_STANDARD}

${TECHNICAL_REQUIREMENTS}

---

## 你的职责

1. **设计符合规则的专长**
   - 根据用户描述确定核心概念和使用场景
   - 选择合适的动作类型（参考上方动作类型规则）
   - 确保数值平衡（参考上方平衡指导）

2. **编写完整的描述**
   - description.value 是最重要的字段，必须完整详细
   - 使用标准的 PF2e HTML 格式
   - 按需添加需求/触发/频率等元素（不要全部添加！）
   - 使用正确的嵌入式引用格式

3. **设置准确的元数据**
   - 等级: ${level}
   - 类别: ${category}${className ? `\n   - 职业: ${className}` : ''}
   - 合理的 traits、actionType、actions、prerequisites

请调用 generateFeat 函数生成完整的专长数据。`;
  }

  /**
   * 构建用户提示词
   */
  private buildUserPrompt(prompt: string, level: number, category: string, className?: string, compendiumContext?: string, templateFeats?: any[]): string {
    let userPrompt = `请生成一个 ${level} 级的 ${this.getCategoryDisplayName(category)} 专长`;
    if (className) {
      userPrompt += `（${className}职业）`;
    }
    userPrompt += `：\n\n${prompt}\n\n`;

    userPrompt += `要求：
- 等级为 ${level} 级
- 类别为 ${category}
- 符合PF2e规则和平衡性
- description.value 必须包含完整的效果描述（HTML格式）
- 只写游戏规则，不要写设计理念等元信息`;

    if (compendiumContext) {
      userPrompt += `\n\n${compendiumContext}`;
    }

    if (templateFeats && templateFeats.length > 0) {
      userPrompt += `\n\n## PF2e官方专长格式参考\n\n以下是官方专长的格式示例，请参考其描述风格和结构：\n`;
      templateFeats.forEach((template, index) => {
        try {
          userPrompt += `\n### 参考${index + 1} - ${template.name || '未知'}\n`;
          if (template.system?.description?.value) {
            userPrompt += `描述:\n${template.system.description.value}\n`;
          }
          if (template.system?.rules?.length > 0) {
            userPrompt += `规则:\n${JSON.stringify(template.system.rules, null, 2)}\n`;
          }
        } catch (e) {
          // skip invalid template
        }
      });
    }

    return userPrompt;
  }

  /**
   * 根据等级和类别确定机制复杂度
   */
  private getComplexityForLevel(level: number, _category: string): 'simple' | 'moderate' | 'complex' {
    if (level <= 4) return 'simple';
    if (level <= 12) return 'moderate';
    return 'complex';
  }

  private getBalanceGuidance(level: number, category: string): string {
    return this.balanceData.generateGuidance(level, category);
  }

  private getCategoryDisplayName(category: string): string {
    const categoryMap: Record<string, string> = {
      'general': '通用', 'skill': '技能', 'ancestry': '族裔', 'class': '职业', 'bonus': '额外'
    };
    return categoryMap[category] || category;
  }

  // ============================================================
  // 集合包搜索
  // ============================================================

  private async extractSearchKeywords(prompt: string): Promise<string[]> {
    const keywordPrompt = `请从以下文本中提取2-3个最重要的搜索关键词，用于在PF2e集合包中搜索相关专长。
只返回关键词，用逗号分隔。

文本: ${prompt}`;

    try {
      const response = await this.aiService.callService([
        { role: 'system', content: '你是一个关键词提取专家。' },
        { role: 'user', content: keywordPrompt }
      ], 'gpt-4o-mini');

      return response.choices?.[0]?.message?.content
        ?.split(',')
        .map((k: string) => k.trim())
        .filter((k: string) => k.length > 0)
        .slice(0, 3) || [];
    } catch (error) {
      console.warn('[FeatGenerator] 关键词提取失败:', error);
      return [];
    }
  }

  private async searchCompendiumContent(keywords: string[]): Promise<any[]> {
    const results: any[] = [];

    try {
      const packNames = ['pf2e.feats-srd', 'pf2e.classfeatures', 'pf2e.ancestryfeatures'];

      for (const packName of packNames) {
        const pack = (globalThis as any).game?.packs?.get(packName);
        if (!pack) continue;

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

      return results
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 5);
    } catch (error) {
      console.warn('[FeatGenerator] 集合包搜索失败:', error);
      return [];
    }
  }

  private calculateRelevance(doc: any, keywords: string[]): number {
    const text = `${doc.name} ${doc.system?.description?.value || ''}`.toLowerCase();
    let score = 0;
    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (text.includes(lowerKeyword)) {
        score += 1;
        if (doc.name.toLowerCase().includes(lowerKeyword)) {
          score += 0.5;
        }
      }
    }
    return score / keywords.length;
  }

  private formatCompendiumContext(results: any[]): string {
    if (results.length === 0) return '';

    let context = '\n\n## PF2e官方参考内容\n\n请参考以下官方内容的书写格式和术语标准：\n';
    for (const result of results) {
      const cleanDesc = result.description.replace(/<[^>]*>/g, '').substring(0, 200);
      context += `- **${result.name}** (${result.type}): ${cleanDesc}...\n`;
    }
    return context;
  }
}
