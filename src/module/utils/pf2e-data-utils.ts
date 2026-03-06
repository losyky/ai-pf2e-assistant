/**
 * PF2e 数据验证与格式化工具函数
 * 从 shrine-synthesis-service 和 equipment-synthesis-service 中提取的共享逻辑
 */

// ============================================================
// JSON 解析与修复
// ============================================================

/**
 * 清理 JSON 字符串，移除代码块标记、return 语句等
 */
export function cleanJsonString(jsonStr: string): string {
  return jsonStr
    .replace(/^\s*```(?:json|javascript)?\s*/, '')
    .replace(/\s*```\s*$/, '')
    .replace(/^\s*return\s+/, '')
    .replace(/;?\s*$/, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\n\s*/g, ' ')
    .trim();
}

/**
 * 修复常见的 JSON 格式错误
 */
export function fixCommonJsonErrors(jsonStr: string): string {
  let fixed = cleanJsonString(jsonStr);
  fixed = fixed.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
  fixed = fixed.replace(/,(\s*,)/g, '$1');
  fixed = fixed.replace(/"\s*\n\s*"/g, '",\n"');
  fixed = fixed.replace(/'/g, '"');
  return fixed;
}

// ============================================================
// Function Calling 响应解析
// ============================================================

/**
 * 从 AI API 响应中统一提取 function call 的参数
 * 支持 GPT tool_calls / GPT function_call / Claude tool_use
 */
export function parseFunctionCallResponse(response: any, functionName?: string): any | null {
  // GPT tool_calls 格式（新版）
  if (response.choices?.[0]?.message?.tool_calls?.[0]) {
    const toolCall = response.choices[0].message.tool_calls[0];
    if (!functionName || toolCall.function?.name === functionName) {
      try {
        return JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error('[parseFunctionCallResponse] tool_calls JSON 解析失败:', e);
      }
    }
  }

  // GPT function_call 格式（旧版）
  if (response.choices?.[0]?.message?.function_call) {
    const functionCall = response.choices[0].message.function_call;
    if (!functionName || functionCall.name === functionName) {
      try {
        return JSON.parse(functionCall.arguments);
      } catch (e) {
        console.error('[parseFunctionCallResponse] function_call JSON 解析失败:', e);
      }
    }
  }

  // Claude tool_use 格式
  if (response.content && Array.isArray(response.content)) {
    const toolUse = response.content.find((block: any) =>
      block.type === 'tool_use' && (!functionName || block.name === functionName)
    );
    if (toolUse?.input) {
      return toolUse.input;
    }
  }

  // 尝试从文本内容中提取 JSON
  const content = response.choices?.[0]?.message?.content;
  if (content) {
    try {
      const jsonMatch = content.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || content.match(/({[\s\S]*})/);
      if (jsonMatch) {
        const cleanJson = fixCommonJsonErrors(jsonMatch[1]);
        return JSON.parse(cleanJson);
      }
    } catch (e) {
      console.error('[parseFunctionCallResponse] 文本 JSON 提取失败:', e);
    }
  }

  return null;
}

// ============================================================
// 专长数据验证与标准化
// ============================================================

/**
 * 标准化先决条件格式为 [{value: string}]
 * 支持多种输入格式：字符串数组、对象数组、纯字符串等
 */
export function normalizePrerequisites(rawPrereqs: any): Array<{ value: string }> {
  if (!rawPrereqs) return [];

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

  const normalized: Array<{ value: string }> = [];
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

  if (rawPrereqs.length > 0 && normalized.length !== rawPrereqs.length) {
    console.log(`[先决条件] 标准化: ${rawPrereqs.length}项 → ${normalized.length}项有效`);
  }

  return normalized;
}

/**
 * 验证动作类型与触发条件的一致性
 * 如果 action 类型的专长包含触发词条，自动移除触发词条
 */
export function validateActionTypeTriggerConsistency(feat: any): void {
  let descriptionValue = feat.system?.description?.value || '';
  const actionTypeValue = feat.system?.actionType?.value || 'passive';
  const featName = feat.name || '未命名';

  const hasTrigger = /<strong>\s*触发\s*<\/strong>/i.test(descriptionValue) ||
    /<strong>\s*Trigger\s*<\/strong>/i.test(descriptionValue) ||
    /触发[:：]/i.test(descriptionValue) ||
    /Trigger:/i.test(descriptionValue);

  if (hasTrigger) {
    if (actionTypeValue !== 'reaction' && actionTypeValue !== 'free') {
      console.error(`[动作类型验证] ❌ "${featName}"包含触发条件，但动作类型是"${actionTypeValue}"，自动移除触发词条`);
      descriptionValue = descriptionValue
        .replace(/<p>\s*<strong>\s*触发\s*<\/strong>[^<]*<\/p>/gi, '')
        .replace(/<p>\s*<strong>\s*Trigger\s*<\/strong>[^<]*<\/p>/gi, '')
        .replace(/^\s*<hr\s*\/>\s*/gim, '')
        .replace(/<p>\s*<\/p>/g, '')
        .trim();
      if (typeof feat.system?.description === 'object') {
        feat.system.description.value = descriptionValue;
      }
    }
  } else {
    if (actionTypeValue === 'reaction' || actionTypeValue === 'free') {
      console.warn(`[动作类型验证] ⚠️ "${featName}"动作类型是"${actionTypeValue}"，但描述中未找到触发条件`);
    }
  }
}

/**
 * 清理和修复专长数据
 */
export function sanitizeFeatData(feat: any): any {
  const sanitized = JSON.parse(JSON.stringify(feat));

  // 清理特征值
  if (sanitized.system?.traits?.value) {
    const originalTraits = sanitized.system.traits.value;
    sanitized.system.traits.value = originalTraits.filter((trait: string) => {
      if (!trait || typeof trait !== 'string') return false;
      return trait.trim().length > 0;
    });
  }

  // 清理频率值
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

  delete sanitized._id;
  delete sanitized._stats;

  return sanitized;
}

/**
 * 验证专长类别是否有效，无效则映射到有效值
 */
export function validateFeatCategory(category: any): "general" | "skill" | "ancestry" | "class" | "bonus" {
  const validCategories = ["general", "skill", "ancestry", "class", "bonus"];
  if (typeof category === "string" && validCategories.includes(category)) {
    return category as "general" | "skill" | "ancestry" | "class" | "bonus";
  }

  const categoryMap: Record<string, "general" | "skill" | "ancestry" | "class" | "bonus"> = {
    "archetype": "general",
    "combat": "general",
    "feat": "general"
  };

  if (typeof category === "string" && categoryMap[category]) {
    return categoryMap[category];
  }

  return "general";
}

/**
 * 构建标准 PF2e 专长格式
 */
export function buildPF2eFeatFormat(args: any): any {
  const result: any = {
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
      category: validateFeatCategory(args.system?.category),
      onlyLevel1: args.system?.onlyLevel1 || false,
      maxTakable: args.system?.maxTakable || 1,
      actionType: {
        value: args.system?.actionType?.value || args.actionType || "passive"
      },
      actions: {
        value: args.system?.actions?.value ?? args.actions ?? null
      },
      prerequisites: {
        value: normalizePrerequisites(args.system?.prerequisites?.value)
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
    const validFrequencyPers = [
      'turn', 'round', 'minute', 'hour', 'day', 'week', 'month', 'year',
      'PT1M', 'PT10M', 'PT1H', 'P1W', 'P1M'
    ];
    if (result.system.frequency.per && !validFrequencyPers.includes(result.system.frequency.per)) {
      result.system.frequency.per = 'PT10M';
    }
  }

  // 特征清理：只移除无效值
  const originalTraits = result.system.traits.value || [];
  result.system.traits.value = originalTraits.filter((trait: string) => {
    return trait && typeof trait === 'string' && trait.trim().length > 0;
  });

  // 如果 traits 为空，尝试从 args 根级提取
  if (result.system.traits.value.length === 0 && args.traits && Array.isArray(args.traits)) {
    result.system.traits.value = args.traits.filter((t: any) => t && typeof t === 'string' && t.trim().length > 0);
  }

  // 验证动作类型与触发一致性
  validateActionTypeTriggerConsistency(result);

  delete result._id;
  delete result._stats;

  return result;
}

// ============================================================
// 物品数据验证与标准化
// ============================================================

/**
 * 验证并修复物品数据格式
 */
export function validateAndFixEquipmentData(equipment: any): any {
  if (typeof equipment.name !== 'string') {
    equipment.name = String(equipment.name || '未命名物品');
  }

  const validTypes = ['weapon', 'equipment', 'consumable', 'armor', 'treasure'];
  if (!validTypes.includes(equipment.type)) {
    equipment.type = 'equipment';
  }

  if (typeof equipment.img !== 'string' || !equipment.img) {
    equipment.img = getDefaultEquipmentIcon(equipment.type);
  }

  if (!equipment.system || typeof equipment.system !== 'object') {
    equipment.system = {};
  }

  const sys = equipment.system;

  // 描述
  if (!sys.description || typeof sys.description !== 'object') {
    sys.description = {};
  }
  if (typeof sys.description.value !== 'string') {
    sys.description.value = String(sys.description.value || '<p>物品描述</p>');
  }
  if (sys.description.gm && typeof sys.description.gm !== 'string') {
    sys.description.gm = '';
  }

  // 等级
  if (!sys.level || typeof sys.level !== 'object') {
    sys.level = { value: 1 };
  }
  if (typeof sys.level.value !== 'number' || isNaN(sys.level.value)) {
    const parsed = parseInt(String(sys.level.value));
    sys.level.value = isNaN(parsed) ? 1 : Math.max(0, Math.min(20, parsed));
  }

  // 价格
  if (!sys.price || typeof sys.price !== 'object') {
    sys.price = { value: {} };
  }
  if (!sys.price.value || typeof sys.price.value !== 'object') {
    sys.price.value = {};
  }
  ['gp', 'sp', 'cp'].forEach(currency => {
    if (sys.price.value[currency] !== undefined) {
      const val = parseFloat(String(sys.price.value[currency]));
      sys.price.value[currency] = isNaN(val) ? 0 : Math.max(0, val);
    }
  });

  // 重量
  if (!sys.bulk || typeof sys.bulk !== 'object') {
    sys.bulk = { value: 0 };
  }
  if (sys.bulk.value === 'L' || sys.bulk.value === 'l') {
    sys.bulk.value = 'L';
  } else if (sys.bulk.value === '-' || sys.bulk.value === 'negligible') {
    sys.bulk.value = 0;
  } else if (typeof sys.bulk.value === 'string') {
    const parsed = parseFloat(sys.bulk.value);
    sys.bulk.value = isNaN(parsed) ? 0 : parsed;
  } else if (typeof sys.bulk.value !== 'number' || isNaN(sys.bulk.value)) {
    sys.bulk.value = 0;
  }

  // 特征
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

  // 使用方式
  if (!sys.usage || typeof sys.usage !== 'object') {
    sys.usage = { value: 'held-in-one-hand' };
  }
  if (typeof sys.usage.value !== 'string') {
    sys.usage.value = 'held-in-one-hand';
  }

  // 数量
  if (typeof sys.quantity !== 'number' || isNaN(sys.quantity)) {
    sys.quantity = 1;
  }

  // 规则
  if (!Array.isArray(sys.rules)) {
    sys.rules = [];
  }

  // 尺寸
  const validSizes = ['tiny', 'sm', 'med', 'lg', 'huge', 'grg'];
  if (!validSizes.includes(sys.size)) {
    sys.size = 'med';
  }

  // 材质
  if (!sys.material || typeof sys.material !== 'object') {
    sys.material = { grade: null, type: null };
  }

  // 类型特定验证
  validateTypeSpecificEquipmentData(equipment);

  return equipment;
}

/**
 * 验证类型特定的物品数据
 */
export function validateTypeSpecificEquipmentData(equipment: any): void {
  const sys = equipment.system;

  switch (equipment.type) {
    case 'weapon':
      if (sys.damage) {
        if (typeof sys.damage !== 'object') sys.damage = {};
        if (typeof sys.damage.dice !== 'number') {
          sys.damage.dice = Math.max(1, parseInt(String(sys.damage.dice)) || 1);
        }
        if (typeof sys.damage.die !== 'string' || !sys.damage.die.match(/^d\d+$/)) {
          sys.damage.die = 'd6';
        }
        if (typeof sys.damage.damageType !== 'string') {
          sys.damage.damageType = 'bludgeoning';
        }
      }
      if (sys.runes) {
        if (typeof sys.runes !== 'object') sys.runes = {};
        if (typeof sys.runes.potency !== 'number') sys.runes.potency = 0;
        if (typeof sys.runes.striking !== 'number') sys.runes.striking = 0;
        if (!Array.isArray(sys.runes.property)) sys.runes.property = [];
      }
      if (sys.range !== null && sys.range !== undefined && typeof sys.range !== 'number') {
        const parsed = parseInt(String(sys.range));
        sys.range = isNaN(parsed) ? null : parsed;
      }
      break;

    case 'armor':
      if (sys.armor) {
        if (typeof sys.armor !== 'object') sys.armor = { value: 0 };
        if (typeof sys.armor.value !== 'number') sys.armor.value = parseInt(String(sys.armor.value)) || 0;
      }
      if (sys.dex) {
        if (typeof sys.dex !== 'object') sys.dex = { value: 5 };
        if (typeof sys.dex.value !== 'number') sys.dex.value = parseInt(String(sys.dex.value)) || 5;
      }
      if (sys.strength) {
        if (typeof sys.strength !== 'object') sys.strength = { value: 0 };
        if (typeof sys.strength.value !== 'number') sys.strength.value = parseInt(String(sys.strength.value)) || 0;
      }
      if (sys.checkPenalty) {
        if (typeof sys.checkPenalty !== 'object') sys.checkPenalty = { value: 0 };
        if (typeof sys.checkPenalty.value !== 'number') sys.checkPenalty.value = parseInt(String(sys.checkPenalty.value)) || 0;
      }
      if (sys.speedPenalty) {
        if (typeof sys.speedPenalty !== 'object') sys.speedPenalty = { value: 0 };
        if (typeof sys.speedPenalty.value !== 'number') sys.speedPenalty.value = parseInt(String(sys.speedPenalty.value)) || 0;
      }
      break;

    case 'consumable':
      if (sys.consumableType) {
        if (typeof sys.consumableType !== 'object') sys.consumableType = { value: 'other' };
        if (typeof sys.consumableType.value !== 'string') sys.consumableType.value = 'other';
      }
      if (sys.charges) {
        if (typeof sys.charges !== 'object') sys.charges = { max: 1, value: 1 };
        if (typeof sys.charges.max !== 'number') sys.charges.max = Math.max(1, parseInt(String(sys.charges.max)) || 1);
        if (typeof sys.charges.value !== 'number') sys.charges.value = sys.charges.max;
      }
      break;
  }

  // 硬度和 HP
  if (sys.hardness !== undefined && sys.hardness !== null && typeof sys.hardness !== 'number') {
    sys.hardness = Math.max(0, parseInt(String(sys.hardness)) || 0);
  }
  if (sys.hp) {
    if (typeof sys.hp !== 'object') sys.hp = { max: 10, value: 10 };
    if (typeof sys.hp.max !== 'number') sys.hp.max = Math.max(1, parseInt(String(sys.hp.max)) || 10);
    if (typeof sys.hp.value !== 'number') sys.hp.value = Math.min(sys.hp.max, parseInt(String(sys.hp.value)) || sys.hp.max);
  }
}

/**
 * 后处理物品数据：确保必需字段存在
 */
export function postProcessEquipment(equipment: any, type: string, level: number, category?: string): any {
  equipment.type = type;

  if (!equipment.img) {
    equipment.img = getDefaultEquipmentIcon(type);
  }
  if (!equipment.system) {
    equipment.system = {} as any;
  }
  if (!equipment.system.level) {
    equipment.system.level = { value: level };
  }
  if (!equipment.system.price) {
    equipment.system.price = { value: { gp: getDefaultEquipmentPrice(level, type) } };
  }
  if (!equipment.system.bulk) {
    equipment.system.bulk = { value: getDefaultBulk(type) };
  }
  if (!equipment.system.traits) {
    equipment.system.traits = { value: ['magical'], rarity: 'uncommon' };
  }
  if (!equipment.system.usage) {
    equipment.system.usage = { value: getDefaultUsage(type) };
  }

  if (equipment.system.baseItem === undefined) equipment.system.baseItem = null;
  if (equipment.system.containerId === undefined) equipment.system.containerId = null;
  if (!equipment.system.material) equipment.system.material = { grade: null, type: null };
  if (equipment.system.quantity === undefined) equipment.system.quantity = 1;
  if (!equipment.system.rules) equipment.system.rules = [];
  if (!equipment.system.size) equipment.system.size = 'med';

  // 类型特定后处理
  switch (type) {
    case 'weapon':
      if (!equipment.system.damage) {
        equipment.system.damage = { damageType: 'bludgeoning', dice: 1, die: 'd6' };
      }
      if (!equipment.system.category) equipment.system.category = category || 'simple';
      if (!equipment.system.group) equipment.system.group = 'club';
      if (!equipment.system.runes) equipment.system.runes = { potency: 0, property: [], striking: 0 };
      if (equipment.system.range === undefined) equipment.system.range = null;
      break;
    case 'armor':
      if (!equipment.system.armor) equipment.system.armor = { value: 2 };
      if (!equipment.system.dex) equipment.system.dex = { value: 5 };
      if (!equipment.system.strength) equipment.system.strength = { value: 0 };
      if (!equipment.system.checkPenalty) equipment.system.checkPenalty = { value: 0 };
      if (!equipment.system.speedPenalty) equipment.system.speedPenalty = { value: 0 };
      if (equipment.system.hardness === undefined) equipment.system.hardness = 5;
      if (!equipment.system.hp) equipment.system.hp = { max: 20, value: 20 };
      break;
    case 'consumable':
      if (!equipment.system.consumableType) equipment.system.consumableType = { value: 'potion' };
      if (!equipment.system.charges) equipment.system.charges = { max: 1, value: 1 };
      break;
    case 'equipment':
      if (equipment.system.hardness === undefined) equipment.system.hardness = 0;
      if (!equipment.system.hp) equipment.system.hp = { max: 0, value: 0 };
      break;
  }

  return equipment;
}

// ============================================================
// 默认值与常量
// ============================================================

export function getDefaultEquipmentIcon(type: string): string {
  const icons: Record<string, string> = {
    'weapon': 'systems/pf2e/icons/default-icons/weapon.svg',
    'armor': 'systems/pf2e/icons/default-icons/armor.svg',
    'equipment': 'icons/containers/bags/coinpouch-leather-orange.webp',
    'consumable': 'systems/pf2e/icons/default-icons/consumable.svg',
    'treasure': 'systems/pf2e/icons/default-icons/treasure.svg'
  };
  return icons[type] || 'icons/containers/bags/coinpouch-leather-orange.webp';
}

export function getDefaultEquipmentPrice(level: number, type: string): number {
  const basePrices = [0, 10, 35, 70, 140, 260, 400, 600, 850, 1300,
    2000, 2900, 4200, 6500, 10000, 14000, 21000, 30000, 45000, 67500, 100000];
  let price = basePrices[level] || 100;
  if (type === 'consumable') {
    price = Math.floor(price / 2);
  }
  return price;
}

export function getDefaultBulk(type: string): number | string {
  const bulks: Record<string, number | string> = {
    'weapon': 1, 'armor': 2, 'equipment': 'L', 'consumable': 'L', 'treasure': 'L'
  };
  return bulks[type] || 'L';
}

export function getDefaultUsage(type: string): string {
  const usages: Record<string, string> = {
    'weapon': 'held-in-one-hand', 'armor': 'worn', 'equipment': 'worn',
    'consumable': 'held-in-one-hand', 'treasure': 'held-in-one-hand'
  };
  return usages[type] || 'held-in-one-hand';
}

export function getEquipmentTypeName(type: string): string {
  const typeNames: Record<string, string> = {
    'weapon': '武器', 'equipment': '装备', 'consumable': '消耗品', 'armor': '护甲', 'treasure': '宝物'
  };
  return typeNames[type] || type;
}

/**
 * 物品价格参考指导（用于提示词）
 */
export const EQUIPMENT_PRICE_GUIDANCE = `根据等级的参考价格（金币）：
- 1级: 3-20gp | 2级: 20-50gp | 3级: 40-100gp | 4级: 80-200gp
- 5级: 120-400gp | 6级: 200-600gp | 7级: 300-900gp | 8级: 450-1,300gp
- 9级: 600-2,000gp | 10级: 900-3,000gp | 11级: 1,300-4,500gp | 12级: 1,800-6,500gp
- 13级: 2,700-10,000gp | 14级: 4,000-15,000gp | 15级: 6,000-22,000gp | 16级: 9,000-32,000gp
- 17级: 13,000-48,000gp | 18级: 20,000-70,000gp | 19级: 30,000-105,000gp | 20级: 45,000-160,000gp

消耗品价格通常是同等级永久物品的1/4到1/2。`;

/**
 * 物品类型特定生成指导（用于提示词）
 */
export function getEquipmentTypeGuidance(type: string): string {
  switch (type) {
    case 'weapon':
      return `武器必需字段：
- system.damage: { damageType, dice, die } — damageType: bludgeoning/slashing/piercing 等, dice: 骰子数量, die: 骰子面数如 d6/d8/d10/d12
- system.category: 'simple', 'martial', 'advanced', 'unarmed'
- system.group: 武器组（sword, bow, club, axe, polearm, flail, hammer, knife, pick, shield, spear, dart 等）
- system.runes: { potency: 0-3, property: [], striking: 0-3 }
- system.range: 近战武器用null，远程武器用数字（如20, 60等，表示射程增量/尺）
- system.usage.value: 'held-in-one-hand' 或 'held-in-two-hands'
- 特征应包含武器相关特征（finesse, deadly-d8, reach, versatile-p, two-hand-d10, backstabber, forceful, sweep 等）`;

    case 'armor':
      return `护甲必需字段：
- system.armor.value: AC加值（轻甲1-2, 中甲3-4, 重甲5-6）
- system.dex.value: 敏捷上限（轻甲3-5, 中甲1-2, 重甲0-1）
- system.strength.value: 力量需求（0-18）
- system.checkPenalty.value: 检定减值（通常是0到-3）
- system.speedPenalty.value: 速度减值（通常是0或-5/-10）
- system.hardness: 护甲硬度
- system.hp: { max, value }
- system.usage.value: 'worn'
- system.category: 'light', 'medium', 'heavy'`;

    case 'consumable':
      return `消耗品必需字段：
- system.consumableType.value: 'potion', 'scroll', 'talisman', 'elixir', 'oil', 'ammunition', 'other'
- system.charges: { max: 1, value: 1 }
- system.usage.value: 根据类型（potion是'held-in-one-hand'，talisman是'affixed-to-armor'或'affixed-to-weapon'等）
- 特征应包含'consumable'和类型特征（如 magical, potion, healing 等）`;

    case 'equipment':
      return `装备必需字段：
- system.usage.value: 'worn'（大多数饰品）, 'held-in-one-hand', 'held-in-two-hands', 'worn-gloves', 'worn-shoes', 'worn-cloak', 'worn-belt', 'worn-ring', 'worn-circlet', 'worn-mask', 'worn-amulet' 等
- 如果是坚固物品，需要 system.hardness 和 system.hp
- 特征应包含 'magical' 和适当特征（如 'invested' 表示需要灌注）
- 使用 Activate 描述激活能力（见描述格式指导）`;

    case 'treasure':
      return `宝物/奇物必需字段：
- 价格可能很高或使用特殊货币
- 通常是 uncommon/rare/unique 稀有度
- 可能有故事背景和特殊属性
- system.usage.value 根据具体形态`;

    default:
      return '';
  }
}

/**
 * 物品描述格式指导（用于提示词）
 */
export const EQUIPMENT_DESCRIPTION_FORMAT = `**物品描述格式标准（中文环境）**：

物品描述应遵循PF2e中文官方格式，使用HTML标签。**所有结构标签使用中文**：

1. **基础描述**：物品的外观、来源或背景，使用<p>标签
2. **被动效果**：物品持续提供的效果，如加值、感知等
3. **启动能力**（如有）：使用标准的中文启动格式：

\`\`\`
<p><strong>启动</strong> <span class="action-glyph">1</span> 专注，交互</p>
<p><strong>频率</strong> 每天一次</p>
<p><strong>需求</strong> 你持有此物品</p>
<hr />
<p><strong>效果</strong> 效果描述...</p>
\`\`\`

- 动作成本用 action-glyph：1=单动作, 2=双动作, 3=三动作, f=自由动作, R=反应
- 频率、需求、触发 仅在需要时添加
- 使用 <hr /> 分隔启动条件和效果
- 多个启动能力各自命名：<strong>启动—能力名</strong>

**动作组件特征必须翻译为中文**（不要使用英文）：
- concentrate → 专注 | manipulate → 交互 | envision → 想象 | command → 命令
- interact → 交互 | strike → 打击 | move → 移动
- flourish → 华丽 | press → 压制 | attack → 攻击 | open → 开放

**❌ 禁止使用英文标签**：
禁止：Activate, Frequency, Requirements, Effect, Trigger, Special, (concentrate, manipulate)
必须使用中文：启动, 频率, 需求, 效果, 触发, 特殊, 专注, 交互

**UUID引用显示文本使用双语格式**：
- @UUID[...]{恶心 Sickened 1}（中文 + 英文 + 数值）
- @UUID[...]{恐惧 Frightened 2}

**重要**：嵌入式引用 @Damage, @Check, @Template 方括号内容必须使用英文。`;
