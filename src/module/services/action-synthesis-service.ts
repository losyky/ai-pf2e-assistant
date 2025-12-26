/**
 * 战术动作合成服务
 * 基于神龛系统合成战术动作 (Tactical Actions)
 */

import { AIService } from './ai-service';
import { ShrineItemService } from './shrine-item-service';
import { ShrinePointService } from './shrine-point-service';
import { BalanceDataService } from './balance-data-service';
import { PF2eMechanicsKnowledgeService } from './pf2e-mechanics-knowledge';
import { Logger } from '../utils/logger';
import {
  DESCRIPTION_PRINCIPLE,
  PF2E_FORMAT_STANDARD,
  TECHNICAL_REQUIREMENTS
} from './prompt-templates';

/**
 * 战术动作合成材料接口（与神龛合成材料相同结构）
 */
export interface ActionSynthesisMaterial {
  id: string;
  name: string;
  type: 'fragment' | 'divinity' | 'offering' | 'shrine';
  hiddenPrompt?: string;
  description: string;
  rarity?: string;
  deity?: string;
  aspect?: string;
  effectiveLevel?: number; // 神性的等效等级，用于提升数值强度
  originalActionData?: any;  // 动作贡品专用
  synthesisRequirements?: any;
  img?: string;
  originalItem?: any;
}

/**
 * 战术动作合成配置接口
 */
export interface ActionSynthesisConfig {
  level: number;  // 角色等级
  actorData?: any;
  shrineItem: ActionSynthesisMaterial;
  requiredTraits?: string[]; // 合成后必定携带的特征（会自动添加 'tactic'）
}

/**
 * 战术动作合成结果接口
 */
export interface ActionSynthesisResult {
  action: PF2eActionFormat;
  usedMaterials: ActionSynthesisMaterial[];
  balanceAnalysis: string;
  iconPrompt?: string;
}

/**
 * PF2e动作格式接口
 */
export interface PF2eActionFormat {
  name: string;
  type: 'action';
  img: string;
  system: {
    description: {
      value: string;
      gm?: string;
    };
    actionType: {
      value: 'action' | 'reaction' | 'free' | 'passive';
    };
    actions: {
      value: number | null;  // 1, 2, 3, null for non-actions
    };
    traits: {
      value: string[];  // 必须包含 'tactic'
      rarity: 'common' | 'uncommon' | 'rare' | 'unique';
    };
    rules?: any[];
    slug?: string;
  };
}

/**
 * 合成验证结果接口
 */
interface SynthesisValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

/**
 * 战术动作生成 Schema（Function Calling）
 */
const ACTION_GENERATION_SCHEMA = {
  name: 'generateAction',
  description: '生成PF2e战术动作',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '战术动作名称'
      },
      system: {
        type: 'object',
        properties: {
          description: {
            type: 'object',
            properties: {
              value: {
                type: 'string',
                description: '战术动作的完整HTML格式描述'
              }
            },
            required: ['value']
          },
          actionType: {
            type: 'object',
            properties: {
              value: {
                type: 'string',
                enum: ['action', 'reaction', 'free', 'passive'],
                description: '动作类型'
              }
            }
          },
          actions: {
            type: 'object',
            properties: {
              value: {
                type: ['number', 'null'],
                description: '动作数量（1/2/3或null）'
              }
            }
          },
          traits: {
            type: 'object',
            properties: {
              value: {
                type: 'array',
                items: { type: 'string' },
                description: '特征数组（必须包含tactic）'
              },
              rarity: {
                type: 'string',
                enum: ['common', 'uncommon', 'rare', 'unique']
              }
            }
          },
          rules: {
            type: 'array',
            description: '规则元素数组',
            items: { type: 'object' }
          }
        },
        required: ['description', 'actionType', 'actions', 'traits']
      }
    },
    required: ['name', 'system']
  }
};

/**
 * 战术动作合成服务
 */
export class ActionSynthesisService {
  private aiService: AIService;
  private balanceService: BalanceDataService;
  private mechanicsKnowledge: PF2eMechanicsKnowledgeService;

  constructor(aiService: AIService) {
    this.aiService = aiService;
    this.balanceService = new BalanceDataService();
    this.mechanicsKnowledge = new PF2eMechanicsKnowledgeService();
  }

  /**
   * 从物品列表中提取合成材料（与神龛合成相同逻辑）
   */
  extractActionMaterials(items: any[], knownTypes?: string[]): ActionSynthesisMaterial[] {
    const materials: ActionSynthesisMaterial[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemType = knownTypes?.[i] || ShrineItemService.getItemType(item);
      
      Logger.debug(`处理战术动作合成材料 "${item.name}":`, {
        itemType,
        traits: item.system?.traits?.value
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
  private extractFragmentMaterial(item: any): ActionSynthesisMaterial {
    return {
      id: item.id || item._id,
      name: item.name,
      type: 'fragment',
      hiddenPrompt: item.flags?.['ai-pf2e-assistant']?.hiddenPrompt || '',
      description: this.extractItemDescription(item),
      rarity: item.system?.traits?.rarity || 'common',
      img: item.img,
      originalItem: item
    };
  }

  /**
   * 提取神性材料
   */
  private extractDivinityMaterial(item: any): ActionSynthesisMaterial {
    const hiddenPrompt = item.flags?.['ai-pf2e-assistant']?.hiddenPrompt || '';
    
    // 解析等效等级配置
    let effectiveLevel: number | undefined = undefined;
    const cleanText = this.extractTextFromHtml(hiddenPrompt);
    const effectiveLevelMatch = cleanText.match(/EFFECTIVE_LEVEL:\s*(\d+)/i);
    if (effectiveLevelMatch) {
      effectiveLevel = parseInt(effectiveLevelMatch[1]);
      console.log(`神性 "${item.name}" 设置了等效等级: ${effectiveLevel}`);
    }
    
    return {
      id: item.id || item._id,
      name: item.name,
      type: 'divinity',
      hiddenPrompt: hiddenPrompt,
      description: this.extractItemDescription(item),
      deity: item.flags?.['ai-pf2e-assistant']?.deity,
      aspect: item.flags?.['ai-pf2e-assistant']?.aspect,
      effectiveLevel: effectiveLevel,
      rarity: item.system?.traits?.rarity || 'common',
      img: item.img,
      originalItem: item
    };
  }

  /**
   * 提取贡品材料
   */
  private extractOfferingMaterial(item: any): ActionSynthesisMaterial {
    const material: ActionSynthesisMaterial = {
      id: item.id || item._id,
      name: item.name,
      type: 'offering',
      hiddenPrompt: item.flags?.['ai-pf2e-assistant']?.hiddenPrompt || '',
      description: this.extractItemDescription(item),
      rarity: item.system?.traits?.rarity || 'common',
      img: item.img,
      originalItem: item
    };

    // 如果贡品本身就是战术动作，保存其数据
    if (item.type === 'action') {
      material.originalActionData = item;
    }

    return material;
  }

  /**
   * 提取神龛材料
   */
  private extractShrineMaterial(item: any): ActionSynthesisMaterial {
    return {
      id: item.id || item._id,
      name: item.name,
      type: 'shrine',
      description: this.extractItemDescription(item),
      deity: item.flags?.['ai-pf2e-assistant']?.deity,
      synthesisRequirements: item.flags?.['ai-pf2e-assistant']?.synthesisRequirements,
      rarity: item.system?.traits?.rarity || 'rare',
      img: item.img,
      originalItem: item
    };
  }

  /**
   * 提取其他材料
   */
  private extractOtherMaterial(item: any): ActionSynthesisMaterial {
    return {
      id: item.id || item._id,
      name: item.name,
      type: 'offering',
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
    const descValue = item.system?.description?.value || '';
    const descGm = item.system?.description?.gm || '';
    return descValue + (descGm ? '\n[GM]\n' + descGm : '');
  }

  /**
   * 合成战术动作
   */
  async synthesizeAction(
    materials: ActionSynthesisMaterial[], 
    config: ActionSynthesisConfig
  ): Promise<ActionSynthesisResult> {
    console.log('开始战术动作合成，材料数量:', materials.length, '配置:', config);

    // 检查神龛点数权限
    const pointCheck = ShrinePointService.canUseSynthesis(config.actorData);
    if (!pointCheck.canUse) {
      throw new Error(`战术动作合成受限: ${pointCheck.reason}`);
    }

    // 验证合成材料
    const validation = this.validateSynthesisMaterials(materials, config.shrineItem);
    if (!validation.isValid) {
      throw new Error(`战术动作合成验证失败: ${validation.errors.join(', ')}`);
    }

    // 构建合成提示词
    const synthesisPrompt = await this.buildActionSynthesisPrompt(materials, config);
    
    // 生成战术动作
    const action = await this.generateActionDirect(
      synthesisPrompt,
      config.level,
      materials,
      config.requiredTraits
    );

    // 合成成功，消耗神龛点数（GM用户不消耗）
    if (!ShrinePointService.isGM()) {
      const consumed = await ShrinePointService.consumeActorPoints(config.actorData);
      if (!consumed) {
        console.warn('神龛点数消耗失败，但合成已完成');
      }
    }

    const result: ActionSynthesisResult = {
      action,
      usedMaterials: materials,
      balanceAnalysis: '战术动作合成完成',
      iconPrompt: (action as any).iconPrompt
    };

    Logger.logSynthesis('战术动作合成完成:', action.name);
    return result;
  }

  /**
   * 验证合成材料
   */
  validateSynthesisMaterials(
    materials: ActionSynthesisMaterial[], 
    shrineItem: ActionSynthesisMaterial
  ): SynthesisValidationResult {
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
      errors.push('战术动作合成需要至少一个神龛物品');
    } else if (materialBreakdown.shrines.length > 1) {
      warnings.push('使用多个神龛可能导致神力冲突');
    }

    // 获取神龛的合成需求
    const requirements = shrineItem.synthesisRequirements;
    if (requirements) {
      const fragmentCount = materialBreakdown.fragments.length;
      const divinityCount = materialBreakdown.divinities.length;
      const offeringCount = materialBreakdown.offerings.length;

      if (fragmentCount < requirements.fragments?.min) {
        errors.push(`神龛需要至少${requirements.fragments.min}个碎片，当前只有${fragmentCount}个`);
      }
      if (divinityCount < requirements.divinities?.min) {
        errors.push(`神龛需要至少${requirements.divinities.min}个神性，当前只有${divinityCount}个`);
      }
      if (offeringCount < requirements.offerings?.min) {
        errors.push(`神龛需要至少${requirements.offerings.min}个贡品，当前只有${offeringCount}个`);
      }
    }

    // 建议
    if (materialBreakdown.fragments.length === 0) {
      suggestions.push('添加碎片可以提供更多设计灵感');
    }
    if (materialBreakdown.offerings.length === 0) {
      suggestions.push('添加战术动作作为贡品可以作为参考模板');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * 构建战术动作合成提示词
   */
  private async buildActionSynthesisPrompt(
    materials: ActionSynthesisMaterial[],
    config: ActionSynthesisConfig
  ): string {
    const shrineItem = config.shrineItem;
    const otherMaterials = materials.filter(m => m.type !== 'shrine');

    let prompt = `# 战术动作合成任务\n\n`;
    prompt += `你是一位PF2e战术大师，正在基于神龛力量合成一个新的战术动作。\n\n`;

    // 神龛信息
    prompt += `## 神龛信息\n`;
    prompt += `名称: ${shrineItem.name}\n`;
    prompt += `描述:\n${shrineItem.description}\n`;
    if (shrineItem.deity) {
      prompt += `神明: ${shrineItem.deity}\n`;
    }
    prompt += `\n`;

    // 材料信息
    const fragments = otherMaterials.filter(m => m.type === 'fragment');
    const divinities = otherMaterials.filter(m => m.type === 'divinity');
    const offerings = otherMaterials.filter(m => m.type === 'offering');

    if (fragments.length > 0) {
      prompt += `## 设计灵感碎片\n`;
      fragments.forEach(f => {
        prompt += `### ${f.name}\n`;
        prompt += `${f.description}\n`;
        if (f.hiddenPrompt) {
          prompt += `设计提示: ${f.hiddenPrompt}\n`;
        }
        prompt += `\n`;
      });
    }

    if (divinities.length > 0) {
      prompt += `## 神性指引\n`;
      divinities.forEach(d => {
        prompt += `### ${d.name}${d.deity ? ` (${d.deity})` : ''}\n`;
        prompt += `${d.description}\n`;
        if (d.hiddenPrompt) {
          prompt += `设计提示: ${d.hiddenPrompt}\n`;
        }
        prompt += `\n`;
      });
    }

    if (offerings.length > 0) {
      prompt += `## 参考贡品\n`;
      offerings.forEach(o => {
        prompt += `### ${o.name}\n`;
        prompt += `${o.description}\n`;
        if (o.originalActionData) {
          prompt += `[这是一个战术动作，可作为参考模板]\n`;
        }
        prompt += `\n`;
      });
    }

    // 合成要求
    prompt += `## 合成要求\n`;
    prompt += `- 角色等级: ${config.level}\n`;
    prompt += `- 物品类型: action (战术动作)\n`;
    prompt += `- 必须特征: tactic (战术)\n`;
    if (config.requiredTraits && config.requiredTraits.length > 0) {
      prompt += `- 额外特征: ${config.requiredTraits.join(', ')}\n`;
    }
    prompt += `\n`;

    // 设计原则
    prompt += `## 战术动作设计原则\n`;
    prompt += `战术动作是需要在战斗外准备的特殊动作，类似于法术的准备机制。\n\n`;
    prompt += `特点要求:\n`;
    prompt += `1. 必须携带 "tactic" 特征\n`;
    prompt += `2. 效果应该是战术性的、需要规划的\n`;
    prompt += `3. 可以是 action (1-3动作)、reaction (反应) 或 free (自由动作)\n`;
    prompt += `4. 描述要体现战术规划和执行的特性\n`;
    prompt += `5. 效果强度应适合角色等级\n\n`;

    // 添加PF2e规则知识
    prompt += this.mechanicsKnowledge.getFullKnowledge();
    prompt += `\n`;

    // 格式要求
    prompt += PF2E_FORMAT_STANDARD;
    prompt += `\n`;
    prompt += DESCRIPTION_PRINCIPLE;
    prompt += `\n`;
    prompt += TECHNICAL_REQUIREMENTS;

    return prompt;
  }

  /**
   * 直接生成战术动作
   */
  private async generateActionDirect(
    prompt: string,
    level: number,
    materials: ActionSynthesisMaterial[],
    requiredTraits?: string[]
  ): Promise<PF2eActionFormat> {
    try {
      const messages = [
        {
          role: 'system' as const,
          content: '你是一个专业的PF2e战术动作设计师。请根据提示生成符合规则的战术动作。'
        },
        {
          role: 'user' as const,
          content: prompt
        }
      ];

      // 使用 Function Calling 生成战术动作
      const response = await this.aiService.callService(messages, {
        tools: [{
          type: 'function',
          function: ACTION_GENERATION_SCHEMA
        }],
        tool_choice: { type: 'function', function: { name: 'generateAction' } }
      });

      // 解析生成的战术动作
      const action = this.parseActionResponse(response);

      // 确保有 tactic 特征
      if (!action.system.traits.value.includes('tactic')) {
        action.system.traits.value.push('tactic');
      }

      // 添加必需特征
      if (requiredTraits && requiredTraits.length > 0) {
        requiredTraits.forEach(trait => {
          if (!action.system.traits.value.includes(trait)) {
            action.system.traits.value.push(trait);
          }
        });
      }

      // 设置默认图标
      if (!action.img || action.img === '') {
        action.img = 'systems/pf2e/icons/actions/OneAction.webp';
      }

      return action;
    } catch (error) {
      console.error('战术动作生成失败:', error);
      throw new Error(`战术动作生成失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 解析 Function Calling 响应
   */
  private parseActionResponse(response: any): PF2eActionFormat {
    try {
      // 处理 Function Calling 响应
      let actionData;
      
      if (response.choices && response.choices[0]) {
        const message = response.choices[0].message;
        
        // 检查 tool_calls（新格式）
        if (message.tool_calls && message.tool_calls.length > 0) {
          const toolCall = message.tool_calls[0];
          if (toolCall.function && toolCall.function.arguments) {
            actionData = JSON.parse(toolCall.function.arguments);
          }
        }
        // 检查 function_call（旧格式）
        else if (message.function_call && message.function_call.arguments) {
          actionData = JSON.parse(message.function_call.arguments);
        }
        // 检查 content（作为后备）
        else if (message.content) {
          actionData = JSON.parse(message.content);
        }
      }
      
      if (!actionData) {
        throw new Error('无法从响应中提取战术动作数据');
      }
      
      // 构建完整的动作对象
      const action: PF2eActionFormat = {
        name: actionData.name || '未命名战术动作',
        type: 'action',
        img: 'systems/pf2e/icons/actions/OneAction.webp',
        system: {
          description: {
            value: actionData.system?.description?.value || ''
          },
          actionType: {
            value: actionData.system?.actionType?.value || 'action'
          },
          actions: {
            value: actionData.system?.actions?.value ?? 1
          },
          traits: {
            value: actionData.system?.traits?.value || ['tactic'],
            rarity: actionData.system?.traits?.rarity || 'common'
          },
          rules: actionData.system?.rules || [],
          slug: null
        }
      };
      
      return action;
    } catch (error) {
      console.error('解析战术动作响应失败:', error);
      throw new Error(`解析战术动作响应失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 解析AI生成的战术动作（文本格式）
   */
  private parseGeneratedAction(response: string): PF2eActionFormat {
    try {
      // 查找JSON代码块
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      let jsonStr = jsonMatch ? jsonMatch[1] : response;

      // 清理可能的格式问题
      jsonStr = jsonStr.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.substring(7);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.substring(0, jsonStr.length - 3);
      }
      jsonStr = jsonStr.trim();

      const action = JSON.parse(jsonStr);

      // 验证基本结构
      if (!action.name || !action.type || !action.system) {
        throw new Error('战术动作格式不完整');
      }

      // 确保是action类型
      action.type = 'action';

      // 确保有必需的system字段
      if (!action.system.actionType) {
        action.system.actionType = { value: 'action' };
      }
      if (!action.system.actions) {
        action.system.actions = { value: 1 };
      }
      if (!action.system.traits) {
        action.system.traits = { value: [], rarity: 'common' };
      }
      if (!action.system.description) {
        action.system.description = { value: '' };
      }

      return action as PF2eActionFormat;
    } catch (error) {
      console.error('解析战术动作失败:', error);
      throw new Error(`解析战术动作失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

