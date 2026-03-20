import { AIService } from './ai-service';
import { PF2eFeatFormat } from './feat-generator-service';
import {
  PREREQUISITES_PRINCIPLE,
  FEAT_DESIGN_GUIDANCE,
  DESCRIPTION_PRINCIPLE,
  PF2E_FORMAT_STANDARD,
  TECHNICAL_REQUIREMENTS,
  FEAT_KNOWLEDGE_UNIFIED_GUIDE,
  ARCHETYPE_DESIGN_GUIDANCE,
  MECHANISM_DEPTH_GUIDE
} from './prompt-templates';
import {
  parseFunctionCallResponse,
  buildPF2eFeatFormat,
  sanitizeFeatData,
  validateActionTypeTriggerConsistency
} from '../utils/pf2e-data-utils';
import { BalanceDataService } from './balance-data-service';
import { ItemFolderStorageService } from './item-folder-storage-service';
import { Logger } from '../utils/logger';

// ============================================================
// Types
// ============================================================

export type MechanismDepth = 'none' | 'light' | 'moderate' | 'heavy' | 'extreme';

export interface ArchetypeGenerationConfig {
  prompt: string;
  style?: string;
  mechanism?: string;
  mechanismDepth: MechanismDepth;
  featCount: number;
  levelRange: { start: number; end: number };
  className?: string;
}

export interface ArchetypeFeatDesign {
  name: string;
  level: number;
  concept: string;
  mechanismRole: string;
  isDedication: boolean;
}

export interface ArchetypeBlueprint {
  name: string;
  coreStyle: string;
  mechanism: {
    name: string;
    description: string;
  } | null;
  feats: ArchetypeFeatDesign[];
}

export interface ArchetypeGenerationResult {
  blueprint: ArchetypeBlueprint;
  feats: PF2eFeatFormat[];
  folderName: string;
}

// ============================================================
// Function Calling Schema for batch feat generation
// ============================================================

const ARCHETYPE_GENERATION_SCHEMA = {
  name: "generateArchetypeFeats",
  description: "一次性生成变体的所有专长，返回完整的PF2e专长数组",
  parameters: {
    type: "object",
    properties: {
      feats: {
        type: "array",
        description: "变体中所有专长的数组，按等级从低到高排列",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "专长名称（中文 英文 双语格式）"
            },
            type: {
              type: "string",
              enum: ["feat"],
              description: "物品类型，必须是feat"
            },
            img: {
              type: "string",
              description: "专长图标路径，留空使用默认图标"
            },
            system: {
              type: "object",
              properties: {
                description: {
                  type: "object",
                  properties: {
                    value: {
                      type: "string",
                      description: "专长的完整HTML格式描述",
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
                  items: { type: "object" }
                },
                traits: {
                  type: "object",
                  properties: {
                    value: {
                      type: "array",
                      items: { type: "string" },
                      description: "特征数组，入门专长必须包含archetype和dedication"
                    },
                    rarity: {
                      type: "string",
                      enum: ["common", "uncommon", "rare", "unique"]
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
                  description: "专长类别，变体专长一般为class"
                },
                actionType: {
                  type: "object",
                  properties: {
                    value: {
                      type: "string",
                      enum: ["passive", "free", "reaction", "action"]
                    }
                  }
                },
                actions: {
                  type: "object",
                  properties: {
                    value: {
                      type: ["number", "null"],
                      description: "动作数量（1-3或null）"
                    }
                  }
                },
                frequency: {
                  type: "object",
                  properties: {
                    max: { type: "number" },
                    per: {
                      type: "string",
                      enum: ["turn", "round", "PT1M", "PT10M", "PT1H", "day", "P1W", "P1M"]
                    }
                  },
                  required: ["max", "per"]
                },
                prerequisites: {
                  type: "object",
                  properties: {
                    value: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          value: { type: "string" }
                        },
                        required: ["value"]
                      }
                    }
                  }
                }
              },
              required: ["description", "level", "category"]
            }
          },
          required: ["name", "type", "system"]
        }
      }
    },
    required: ["feats"]
  }
};

// ============================================================
// Service
// ============================================================

export class ArchetypeGeneratorService {
  private aiService: AIService;
  private balanceDataService: BalanceDataService;

  constructor(aiService: AIService) {
    this.aiService = aiService;
    this.balanceDataService = new BalanceDataService();
  }

  setAIService(aiService: AIService): void {
    this.aiService = aiService;
  }

  /**
   * 主入口：生成完整变体
   */
  async generateArchetype(config: ArchetypeGenerationConfig): Promise<ArchetypeGenerationResult> {
    Logger.logSynthesis('[ArchetypeGenerator] 开始生成变体');
    Logger.logSynthesis('[ArchetypeGenerator] 配置:', JSON.stringify(config, null, 2));

    // 阶段1: 变体设计
    const blueprint = await this.designArchetype(config);
    Logger.logSynthesis(`[ArchetypeGenerator] 蓝图设计完成: ${blueprint.name}, ${blueprint.feats.length}个专长`);

    // 阶段2: 一次性生成全部专长
    const rawFeats = await this.generateAllFeats(blueprint, config);
    Logger.logSynthesis(`[ArchetypeGenerator] 专长生成完成: ${rawFeats.length}个`);

    // 阶段3: 格式化与存储
    const result = await this.finalizeAndStore(rawFeats, blueprint);
    Logger.logSynthesis(`[ArchetypeGenerator] 变体生成完成: ${result.folderName}`);

    return result;
  }

  /**
   * 仅执行阶段1：设计蓝图（供UI预览用）
   */
  async designOnly(config: ArchetypeGenerationConfig): Promise<ArchetypeBlueprint> {
    return this.designArchetype(config);
  }

  /**
   * 从已有蓝图继续执行阶段2+3
   */
  async generateFromBlueprint(blueprint: ArchetypeBlueprint, config: ArchetypeGenerationConfig): Promise<ArchetypeGenerationResult> {
    const rawFeats = await this.generateAllFeats(blueprint, config);
    return this.finalizeAndStore(rawFeats, blueprint);
  }

  // ============================================================
  // Phase 1: Design
  // ============================================================

  private async designArchetype(config: ArchetypeGenerationConfig): Promise<ArchetypeBlueprint> {
    const levelAllocation = this.calculateLevelAllocation(config.featCount, config.levelRange);
    const mechanismGuide = MECHANISM_DEPTH_GUIDE.getGuide(config.mechanismDepth);

    const systemPrompt = `你是一个专业的Pathfinder 2e变体（Archetype）设计师。你需要根据用户需求设计一个完整的变体方案。

**🌏 语言要求**：
- 变体名称和专长名称使用"中文 英文"双语格式
- 所有描述内容使用中文

---

${ARCHETYPE_DESIGN_GUIDANCE}

---

## 机制深度：${this.getMechanismDepthLabel(config.mechanismDepth)}

${mechanismGuide}

---

## 你的职责

设计一个完整的变体方案，输出以下内容：

1. **变体名称**：简洁有力的中文+英文名称
2. **核心画风**：用1-3句话描述变体的整体风格和主题
3. **独有机制**（如适用）：机制名称和完整运作方式描述${config.mechanismDepth === 'none' ? '（当前设定为无独有机制，跳过此项）' : ''}
4. **专长列表**：每个专长的名称、等级、设计理念、在机制中的角色

**等级分配参考**：${levelAllocation.map(l => `${l}级`).join('、')}

---

## 输出格式

请严格输出以下JSON格式（不要添加其他内容）：

\`\`\`json
{
  "name": "变体名称 English Name",
  "coreStyle": "核心画风描述",
  "mechanism": ${config.mechanismDepth === 'none' ? 'null' : '{ "name": "机制名", "description": "完整的机制运作方式描述" }'},
  "feats": [
    { "name": "入门名 English", "level": ${levelAllocation[0]}, "concept": "设计理念", "mechanismRole": "在机制中的角色", "isDedication": true },
    { "name": "专长2 English", "level": ${levelAllocation[1] || levelAllocation[0] + 2}, "concept": "设计理念", "mechanismRole": "在机制中的角色", "isDedication": false }
  ]
}
\`\`\``;

    let userPrompt = `请设计一个变体：\n\n`;
    userPrompt += `**核心主题**：${config.prompt}\n\n`;

    if (config.style) {
      userPrompt += `**画风要求**：${config.style}\n\n`;
    }
    if (config.mechanism) {
      userPrompt += `**自定义机制**：${config.mechanism}\n\n`;
    }
    if (config.className) {
      userPrompt += `**关联职业**：${config.className}\n\n`;
    }

    userPrompt += `**专长数量**：${config.featCount}个（含1个入门专长）\n`;
    userPrompt += `**等级范围**：${config.levelRange.start}级 到 ${config.levelRange.end}级\n`;
    userPrompt += `**等级分配**：${levelAllocation.map(l => `${l}级`).join('、')}\n`;
    userPrompt += `**机制深度**：${this.getMechanismDepthLabel(config.mechanismDepth)}\n`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt }
    ];

    const model = this.getModel('design');
    Logger.logSynthesis(`[ArchetypeGenerator-设计] 使用模型: ${model}`);

    const response = await this.aiService.callService(messages, model);
    return this.parseBlueprintResponse(response);
  }

  // ============================================================
  // Phase 2: Generate All Feats
  // ============================================================

  private async generateAllFeats(blueprint: ArchetypeBlueprint, _config: ArchetypeGenerationConfig): Promise<PF2eFeatFormat[]> {
    const balanceGuidances = blueprint.feats.map(f => {
      return this.balanceDataService.generateBalanceGuidance(f.level, 'feat');
    });

    const blueprintContext = this.formatBlueprintContext(blueprint);

    const systemPrompt = `你是一个专业的Pathfinder 2e专长生成器。你需要根据变体设计蓝图，一次性生成所有专长的完整数据。

**🌏 语言要求（最高优先级）**：
- **专长名称（name字段）使用"中文 英文"双语格式**
- 所有描述内容（description.value）必须使用中文
- 所有结构标签使用中文（需求、触发、频率、效果、特殊）
- ❌ 禁止使用英文标签（Requirements, Trigger, Frequency, Effect 等）
- 动作组件特征翻译为中文（concentrate→专注, manipulate→交互）

---

## 变体设计蓝图

${blueprintContext}

---

## 变体专长格式要求

### 入门专长（Dedication）
- \`category\`: \`"class"\`
- \`traits.value\` 必须包含 \`"archetype"\` 和 \`"dedication"\`
- 通常是被动专长（passive），赋予角色变体的基础能力
- 先决条件通常为属性要求或技能要求

### 后续专长
- \`category\`: \`"class"\`（职业专长）或 \`"skill"\`（技能专长）
- \`traits.value\` 必须包含 \`"archetype"\`
- 先决条件必须包含入门专长名称：\`{value: "${blueprint.name.split(' ')[0]}入门 ${blueprint.name} Dedication"}\`
- 高级专长可以额外要求前置专长

---

## 数值平衡指导

${balanceGuidances.map((g, i) => `### ${blueprint.feats[i].name}（${blueprint.feats[i].level}级）\n${g}`).join('\n\n')}

---

${FEAT_DESIGN_GUIDANCE}

---

${PREREQUISITES_PRINCIPLE}

---

${FEAT_KNOWLEDGE_UNIFIED_GUIDE}

---

${DESCRIPTION_PRINCIPLE}

${PF2E_FORMAT_STANDARD}

${TECHNICAL_REQUIREMENTS}

---

## 你的职责

根据蓝图中每个专长的设计方向，生成 ${blueprint.feats.length} 个完整的PF2e专长。
- 所有专长必须服务于统一的画风：${blueprint.coreStyle}
${blueprint.mechanism ? `- 机制 "${blueprint.mechanism.name}" 必须贯穿专长链` : '- 本变体无独有机制，每个专长独立设计'}
- 专长之间形成递进关系
- 调用 generateArchetypeFeats 函数，返回专长数组

**重要**：description.value 是最核心的字段，必须完整详细，使用标准PF2e HTML格式。`;

    const userPrompt = `请根据上述变体蓝图，一次性生成所有 ${blueprint.feats.length} 个专长的完整数据。

专长列表：
${blueprint.feats.map((f, i) => `${i + 1}. ${f.name}（${f.level}级${f.isDedication ? '，入门专长' : ''}）- ${f.concept}`).join('\n')}

请调用 generateArchetypeFeats 函数生成所有专长。`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt }
    ];

    const model = this.getModel('generate');
    Logger.logSynthesis(`[ArchetypeGenerator-生成] 使用模型: ${model}`);

    const response = await this.aiService.callService(messages, {
      model,
      tools: [{
        type: 'function',
        function: ARCHETYPE_GENERATION_SCHEMA
      }],
      tool_choice: { type: 'function', function: { name: 'generateArchetypeFeats' } }
    });

    return this.parseFeatsResponse(response);
  }

  // ============================================================
  // Phase 3: Finalize & Store
  // ============================================================

  private async finalizeAndStore(rawFeats: PF2eFeatFormat[], blueprint: ArchetypeBlueprint): Promise<ArchetypeGenerationResult> {
    const finalFeats: PF2eFeatFormat[] = [];

    for (let i = 0; i < rawFeats.length; i++) {
      let feat = buildPF2eFeatFormat(rawFeats[i]);
      feat = sanitizeFeatData(feat);
      validateActionTypeTriggerConsistency(feat);

      const isFirst = i === 0;

      // 强制设置 category
      feat.system.category = 'class';

      // 确保特征正确
      if (!feat.system.traits) {
        feat.system.traits = { value: [], rarity: 'common', otherTags: [] };
      }
      if (!Array.isArray(feat.system.traits.value)) {
        feat.system.traits.value = [];
      }

      if (!feat.system.traits.value.includes('archetype')) {
        feat.system.traits.value.push('archetype');
      }
      if (isFirst && !feat.system.traits.value.includes('dedication')) {
        feat.system.traits.value.push('dedication');
      }

      // 确保等级与蓝图一致
      if (i < blueprint.feats.length) {
        feat.system.level = { value: blueprint.feats[i].level };
      }

      finalFeats.push(feat as PF2eFeatFormat);
    }

    // 存入文件夹
    const folderName = blueprint.name;
    let folderId: string | null = null;

    try {
      const folder = await ItemFolderStorageService.getOrCreateArchetypeFolder(folderName);
      folderId = folder?.id || null;
    } catch (error) {
      Logger.warn('[ArchetypeGenerator] 创建文件夹失败，专长将不关联文件夹:', error);
    }

    const createdFeats: PF2eFeatFormat[] = [];
    for (const feat of finalFeats) {
      try {
        const itemData: any = { ...feat, folder: folderId };
        const createdItem = await (window as any).Item.create(itemData);
        if (createdItem) {
          createdFeats.push(feat);
          Logger.logSynthesis(`[ArchetypeGenerator] 创建专长: ${feat.name}`);
        }
      } catch (error) {
        Logger.error(`[ArchetypeGenerator] 创建专长 "${feat.name}" 失败:`, error);
        createdFeats.push(feat);
      }
    }

    return {
      blueprint,
      feats: createdFeats,
      folderName
    };
  }

  // ============================================================
  // Response Parsers
  // ============================================================

  private parseBlueprintResponse(response: any): ArchetypeBlueprint {
    let content: string;

    if (typeof response === 'string') {
      content = response;
    } else if (response.choices?.[0]?.message?.content) {
      content = response.choices[0].message.content;
    } else {
      throw new Error('无法解析AI响应');
    }

    // 提取 JSON
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) {
      throw new Error('AI响应中未找到有效的JSON');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonMatch[1].trim());
    } catch (e) {
      // 尝试修复常见错误
      let fixed = jsonMatch[1].trim();
      fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
      parsed = JSON.parse(fixed);
    }

    if (!parsed.name || !Array.isArray(parsed.feats) || parsed.feats.length === 0) {
      throw new Error('蓝图数据不完整：缺少name或feats');
    }

    return {
      name: parsed.name,
      coreStyle: parsed.coreStyle || '',
      mechanism: parsed.mechanism || null,
      feats: parsed.feats.map((f: any) => ({
        name: f.name || '未命名',
        level: f.level || 2,
        concept: f.concept || '',
        mechanismRole: f.mechanismRole || '',
        isDedication: f.isDedication === true
      }))
    };
  }

  private parseFeatsResponse(response: any): PF2eFeatFormat[] {
    // 尝试 Function Calling 解析
    const parsed = parseFunctionCallResponse(response, 'generateArchetypeFeats');
    if (parsed?.feats && Array.isArray(parsed.feats)) {
      Logger.logSynthesis(`[ArchetypeGenerator] Function Calling 解析成功: ${parsed.feats.length}个专长`);
      return parsed.feats;
    }

    // 回退：从文本内容中提取
    let content: string;
    if (typeof response === 'string') {
      content = response;
    } else if (response.choices?.[0]?.message?.content) {
      content = response.choices[0].message.content;
    } else {
      throw new Error('无法解析AI生成响应');
    }

    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/(\[[\s\S]*\])/);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1].trim());
        const feats = Array.isArray(data) ? data : data.feats;
        if (Array.isArray(feats) && feats.length > 0) {
          return feats;
        }
      } catch (e) {
        Logger.error('[ArchetypeGenerator] JSON解析失败:', e);
      }
    }

    throw new Error('无法从AI响应中提取专长数据');
  }

  // ============================================================
  // Helpers
  // ============================================================

  private calculateLevelAllocation(featCount: number, levelRange: { start: number; end: number }): number[] {
    const levels: number[] = [];
    const { start, end } = levelRange;

    // 入门专长固定为 start 级（通常2级）
    levels.push(start);

    if (featCount <= 1) return levels;

    // 后续专长均匀分配在 start+2 到 end 之间
    const remainingCount = featCount - 1;
    const minFollowUp = Math.max(start + 2, 4);
    const step = remainingCount > 1
      ? Math.max(2, Math.floor((end - minFollowUp) / (remainingCount - 1)))
      : 0;

    for (let i = 0; i < remainingCount; i++) {
      const level = Math.min(minFollowUp + step * i, end);
      // PF2e 专长等级必须是偶数
      levels.push(level % 2 === 0 ? level : level + 1);
    }

    return levels;
  }

  private formatBlueprintContext(blueprint: ArchetypeBlueprint): string {
    let context = `### 变体名称：${blueprint.name}\n\n`;
    context += `### 核心画风\n${blueprint.coreStyle}\n\n`;

    if (blueprint.mechanism) {
      context += `### 独有机制：${blueprint.mechanism.name}\n${blueprint.mechanism.description}\n\n`;
    }

    context += `### 专长设计方向\n\n`;
    blueprint.feats.forEach((f, i) => {
      context += `**${i + 1}. ${f.name}**（${f.level}级${f.isDedication ? '，入门专长' : ''}）\n`;
      context += `- 设计理念：${f.concept}\n`;
      context += `- 机制角色：${f.mechanismRole}\n\n`;
    });

    return context;
  }

  private getMechanismDepthLabel(depth: MechanismDepth): string {
    const labels: Record<MechanismDepth, string> = {
      'none': '无独有机制',
      'light': '轻度机制',
      'moderate': '中度机制',
      'heavy': '重度机制',
      'extreme': '极端机制'
    };
    return labels[depth];
  }

  private getModel(phase: 'design' | 'generate'): string {
    const game = (window as any).game;
    if (!game?.settings) {
      return 'gpt-4o';
    }

    const settingKey = phase === 'design' ? 'archetypeDesignModel' : 'archetypeGenerateModel';
    try {
      return game.settings.get('ai-pf2e-assistant', settingKey) as string || 'gpt-4o';
    } catch {
      return 'gpt-4o';
    }
  }
}
