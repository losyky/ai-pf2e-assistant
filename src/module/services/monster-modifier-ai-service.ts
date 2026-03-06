import { MonsterModTemplate } from '../ui/monster-mod-template-manager-app';
import { parseFunctionCallResponse } from '../utils/pf2e-data-utils';

const MODULE_ID = 'ai-pf2e-assistant';

declare const game: any;
declare const foundry: any;

const NPC_STRUCTURE_GUIDE = `
## PF2e NPC Actor JSON 结构说明

一个 NPC Actor 包含以下核心结构：

### 顶层字段
- name: 怪物名称
- type: 固定为 "npc"
- img: 肖像图片路径
- items: 能力/攻击/法术数组（必须包含所有原始 item，不要遗漏任何一个）
- system: 完整的系统数据

### system 字段
- abilities: 六项属性修正 (str/dex/con/int/wis/cha，各含 mod 字段)
- attributes: AC (.ac.value), HP (.hp.max/.hp.value), 免疫 (.immunities[]), 抗性 (.resistances[]), 弱点 (.weaknesses[]), 速度 (.speed.value/.speed.otherSpeeds[])
- details: 等级 (.level.value), 语言 (.languages), 描述 (.publicNotes), 出版信息 (.publication)
- perception: 感知修正 (.mod), 感官 (.senses[])
- saves: 强韧 (.fortitude.value), 反射 (.reflex.value), 意志 (.will.value)
- skills: 技能对象，如 athletics: { base: 38 }
- traits: 稀有度 (.rarity), 体型 (.size.value), 特征 (.value[])
- initiative: 先攻来源 (.statistic)

### items 数组中的条目类型
每个 item 必须保留原始的完整字段结构，包括 _id, _stats, sort, system 中的所有子字段。

- **melee**: 近战攻击
  - system.bonus.value: 攻击加值
  - system.damageRolls: { [randomKey]: { damage: "3d10+17", damageType: "bludgeoning" } }
  - system.traits: { rarity, value[] } — 武器特征如 deadly-3d12, magical, reach-15
  - system.attackEffects: { custom, value[] }
  - system.attack.value, system.range, system.description, system.publication, system.rules, system.slug

- **ranged**: 远程攻击（类似 melee，另有 range 字段）

- **action**: 能力/动作
  - system.actionType.value: "passive"|"free"|"reaction"|"action"
  - system.actions.value: null|1|2|3
  - system.category: "defensive"|"offensive"|"interaction"
  - system.description.value: HTML 描述（含完整效果、触发条件、频率等）
  - system.deathNote: boolean（可选）
  - system.rules: 规则元素数组（如 RollOption, Resistance, Immunity 等）
  - system.publication, system.slug, system.traits

- **spell**: 法术（包含完整法术数据）

- **lore**: 知识技能

### 描述中的内联引用格式
- 状态: @UUID[Compendium.pf2e.conditionitems.Item.xxx]{显示文本}
- 法术: @UUID[Compendium.pf2e.spells-srd.Item.xxx]{显示文本}
- 伤害: @Damage[3d6[fire]]
- 检定: @Check[reflex|dc:20|basic]
- 范围: @Template[cone|distance:30]
`.trim();

// ============================================================
// Recipe（规则模板）相关类型
// ============================================================

export interface ModificationRecipe {
  statAdjustments: {
    level?: number;
    hpPercent?: number;
    hpFlat?: number;
    acAdjust?: number;
    attackAdjust?: number;
    saveAdjust?: number;
    perceptionAdjust?: number;
    skillAdjust?: number;
    abilityAdjust?: Record<string, number>;
    speedAdjust?: number;
  };

  addTraits: string[];
  removeTraits: string[];
  newRarity?: string;
  newSize?: string;

  addItems: any[];
  removeItemNames: string[];

  addImmunities?: any[];
  addResistances?: any[];
  addWeaknesses?: any[];
  removeImmunities?: string[];
  removeResistances?: string[];
  removeWeaknesses?: string[];

  addSpeeds?: any[];

  namePrefix?: string;
  nameSuffix?: string;

  descriptionNote?: string;
}

export interface MonsterModificationResult {
  originalMonster: any;
  modifiedMonster: any;
  templateUsed: MonsterModTemplate;
}

// ============================================================
// Recipe 生成 Schema
// ============================================================

const RECIPE_GENERATION_SCHEMA = {
  name: 'generateRecipe',
  description: '根据改造描述生成一个可复用的怪物改造配方（Recipe），包含数值调整、特征变更和新增能力',
  parameters: {
    type: 'object',
    properties: {
      statAdjustments: {
        type: 'object',
        description: '数值调整（所有值为相对调整量）',
        properties: {
          level: { type: 'number', description: '等级调整（如 +2 或 -1）' },
          hpPercent: { type: 'number', description: 'HP 百分比调整（如 1.5 表示增加 50%，0.8 表示减少 20%）' },
          hpFlat: { type: 'number', description: 'HP 绝对值调整（在百分比调整之后叠加）' },
          acAdjust: { type: 'number', description: 'AC 调整' },
          attackAdjust: { type: 'number', description: '攻击加值调整（应用于所有 melee/ranged 的 bonus.value）' },
          saveAdjust: { type: 'number', description: '豁免调整（应用于 fortitude/reflex/will）' },
          perceptionAdjust: { type: 'number', description: '感知调整' },
          skillAdjust: { type: 'number', description: '技能调整（应用于所有技能）' },
          abilityAdjust: { type: 'object', description: '属性修正调整，如 {"str": 2, "con": -1}' },
          speedAdjust: { type: 'number', description: '速度调整（尺）' },
        },
      },
      addTraits: { type: 'array', items: { type: 'string' }, description: '要添加的特征' },
      removeTraits: { type: 'array', items: { type: 'string' }, description: '要移除的特征' },
      newRarity: { type: 'string', enum: ['common', 'uncommon', 'rare', 'unique'], description: '新稀有度（不变则不填）' },
      newSize: { type: 'string', enum: ['tiny', 'sm', 'med', 'lg', 'huge', 'grg'], description: '新体型（不变则不填）' },
      addItems: {
        type: 'array',
        description: '要新增的能力/攻击/法术（完整的 item JSON 数据，_id 留空）',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['melee', 'ranged', 'action', 'spell', 'lore'] },
            img: { type: 'string' },
            system: { type: 'object', description: '完整的 item system 数据' },
          },
          required: ['name', 'type', 'system'],
        },
      },
      removeItemNames: { type: 'array', items: { type: 'string' }, description: '要移除的能力名称（精确匹配）' },
      addImmunities: { type: 'array', items: { type: 'object' }, description: '要添加的免疫，格式如 { "type": "death-effects" }' },
      addResistances: { type: 'array', items: { type: 'object' }, description: '要添加的抗性，格式如 { "type": "fire", "value": 10 }' },
      addWeaknesses: { type: 'array', items: { type: 'object' }, description: '要添加的弱点，格式如 { "type": "fire", "value": 10 }' },
      removeImmunities: { type: 'array', items: { type: 'string' }, description: '要移除的免疫类型名' },
      removeResistances: { type: 'array', items: { type: 'string' }, description: '要移除的抗性类型名' },
      removeWeaknesses: { type: 'array', items: { type: 'string' }, description: '要移除的弱点类型名' },
      addSpeeds: { type: 'array', items: { type: 'object' }, description: '要添加的移动方式，格式如 { "type": "fly", "value": 30 }' },
      namePrefix: { type: 'string', description: '名称前缀（如 "不死"）' },
      nameSuffix: { type: 'string', description: '名称后缀（如 "(精英)"）' },
      descriptionNote: { type: 'string', description: '附加在怪物描述末尾的说明（HTML 格式）' },
    },
    required: ['statAdjustments', 'addTraits', 'removeTraits', 'addItems', 'removeItemNames'],
  },
};

export class MonsterModifierAIService {

  /**
   * 检测当前 Foundry 游戏环境是否为中文
   */
  static isChineseEnvironment(): boolean {
    try {
      const lang = (game as any).i18n?.lang || (game as any).settings?.get('core', 'language') || 'en';
      return lang === 'cn' || lang === 'zh' || lang === 'zh-CN' || lang === 'zh-TW' || lang.startsWith('zh');
    } catch {
      return false;
    }
  }

  /**
   * 检测文本是否主要为英文（ASCII 字母占比 > 70%）
   */
  static isContentEnglish(monsterData: any): boolean {
    const textsToCheck: string[] = [];
    if (monsterData.name) textsToCheck.push(monsterData.name);

    const items = monsterData.items || [];
    for (const item of items.slice(0, 10)) {
      if (item.name) textsToCheck.push(item.name);
      const desc = item.system?.description?.value || '';
      if (desc) textsToCheck.push(desc.replace(/<[^>]*>/g, '').substring(0, 200));
    }

    const combined = textsToCheck.join(' ');
    if (combined.length === 0) return false;
    const asciiLetters = (combined.match(/[a-zA-Z]/g) || []).length;
    return asciiLetters / combined.length > 0.5;
  }

  // ============================================================
  // AI 实时改造（传递完整 JSON）
  // ============================================================

  static async modifyMonster(
    monsterData: any,
    template: MonsterModTemplate,
  ): Promise<MonsterModificationResult> {
    const g = game as any;
    const apiUrl = g.settings?.get(MODULE_ID, 'apiUrl');
    const apiKey = g.settings?.get(MODULE_ID, 'apiKey');
    const model = g.settings?.get(MODULE_ID, 'aiModel') || 'gpt-4o-mini';

    if (!apiUrl || !apiKey) {
      throw new Error('请先在模块设置中配置 API 地址和密钥');
    }

    const isChinese = this.isChineseEnvironment();
    const isEnglishContent = this.isContentEnglish(monsterData);

    const systemPrompt = this.buildSystemPrompt(template, isChinese, isEnglishContent);
    const userPrompt = this.buildUserPrompt(monsterData, template, isChinese, isEnglishContent);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 16000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API 调用失败: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    let parsedResult = parseFunctionCallResponse(data);

    if (!parsedResult) {
      throw new Error('无法解析 AI 响应');
    }

    const modifiedMonster = this.validateAndFixMonsterData(parsedResult, monsterData);

    return {
      originalMonster: monsterData,
      modifiedMonster,
      templateUsed: template,
    };
  }

  private static buildSystemPrompt(
    _template: MonsterModTemplate,
    isChinese: boolean,
    isEnglishContent: boolean,
  ): string {
    let translationRules = '';
    if (isChinese) {
      translationRules = `
8. **语言要求（极其重要）**：
   - 当前游戏环境为中文，所有内容必须以中文为主
   - 怪物名称使用"中文名 English Name"双语格式（如"精金魔像 Adamantine Golem"）
   - 所有能力/攻击的 name 也使用"中文 English"双语格式（如"拳击 Fist"）
   - description.value 中的描述文本必须使用中文
   - 新增能力的描述直接使用中文编写
   - 保留 @UUID[...], @Damage[...], @Check[...] 等引用的原始格式不变
   - @UUID 引用的显示文本（花括号内）使用中文，如 @UUID[...]{迟缓 Slowed 1}`;
      if (isEnglishContent) {
        translationRules += `
   - ⚠️ 原始怪物数据为英文，你必须将所有 name 和 description 翻译为中文
   - 翻译所有 item 的 name（使用"中文 English"格式）
   - 翻译所有 description.value 中的英文描述为中文（保持 HTML 格式和嵌入引用不变）
   - 翻译 system.details.publicNotes 为中文`;
      }
    }

    return `你是一个专业的 Pathfinder 2e 怪物设计师。你需要根据改造指令修改现有怪物的数据。

${NPC_STRUCTURE_GUIDE}

---

## 改造规范

1. **完整性**：你必须返回完整的 NPC JSON 数据（name, type, system, items）
2. **items 数组**：
   - ⚠️ 极其重要：你必须返回原始怪物的【所有 items】，包括未修改的 item
   - 不要遗漏任何一个原始 item，即使它没有被修改
   - 每个 item 必须保留其完整的字段结构（_id, sort, system 下的所有子字段）
   - 可以修改现有 item 的内容，但保留其 _id
   - 新增的 items 的 _id 请留空字符串 ""
   - 新增能力不需要 _stats 字段
3. **结构正确**：严格遵循 PF2e NPC 数据结构
4. **ID 处理**：不要创建顶层 _id 字段
5. **UUID 引用**：保留原有的 @UUID[...] 引用
6. **平衡性**：改造后的怪物应保持合理的数值平衡
7. **描述内容**：能力描述使用 HTML 格式${translationRules}

请直接返回一个完整的 JSON 对象（用 \`\`\`json 代码块包裹），包含改造后的完整 NPC 数据。`;
  }

  private static buildUserPrompt(
    monsterData: any,
    template: MonsterModTemplate,
    isChinese: boolean,
    isEnglishContent: boolean,
  ): string {
    const cleanData = JSON.parse(JSON.stringify(monsterData));
    delete cleanData._id;
    delete cleanData._stats;
    delete cleanData.folder;
    delete cleanData.sort;
    delete cleanData.ownership;
    delete cleanData.flags;

    let prompt = `## 改造模板：${template.name}\n\n`;

    if (template.description) {
      prompt += `模板说明：${template.description}\n\n`;
    }

    prompt += `### 改造指令\n${template.promptInstructions}\n\n`;

    if (template.levelAdjustment && template.levelAdjustment !== 0) {
      prompt += `### 等级调整\n等级变化: ${template.levelAdjustment > 0 ? '+' : ''}${template.levelAdjustment}\n`;
      prompt += `请相应调整 HP、AC、攻击加值、伤害、DC、技能等数值。\n\n`;
    }

    if (template.traitModifications) {
      if (template.traitModifications.add?.length) {
        prompt += `### 必须添加的特征\n${template.traitModifications.add.join(', ')}\n\n`;
      }
      if (template.traitModifications.remove?.length) {
        prompt += `### 必须移除的特征\n${template.traitModifications.remove.join(', ')}\n\n`;
      }
    }

    if (isChinese && isEnglishContent) {
      prompt += `### ⚠️ 翻译要求\n`;
      prompt += `当前数据为英文，游戏环境为中文。你必须：\n`;
      prompt += `1. 将怪物 name 翻译为"中文名 English Name"双语格式\n`;
      prompt += `2. 将所有 item 的 name 翻译为"中文 English"双语格式\n`;
      prompt += `3. 将所有 description.value 中的英文文本翻译为中文（保留 HTML 标签和 @UUID/@Damage/@Check 引用格式）\n`;
      prompt += `4. 翻译 publicNotes 等描述字段\n`;
      prompt += `5. 新增内容直接使用中文\n\n`;
    } else if (isChinese) {
      prompt += `### 语言要求\n所有新增内容使用中文编写，名称使用"中文 English"双语格式。\n\n`;
    }

    prompt += `### 原始怪物完整数据\n以下是原始怪物的完整 JSON 数据，包含 ${Array.isArray(cleanData.items) ? cleanData.items.length : 0} 个 items。`;
    prompt += `你的返回必须包含所有这些 items（可以修改内容但不能遗漏），以及任何新增的 items。\n\n`;
    prompt += `\`\`\`json\n${JSON.stringify(cleanData, null, 2)}\n\`\`\`\n\n`;
    prompt += `请根据以上改造指令修改这个怪物，返回完整的 JSON 数据（用 \`\`\`json 代码块包裹）。`;

    return prompt;
  }

  // ============================================================
  // Recipe 生成
  // ============================================================

  static async generateRecipe(
    description: string,
    sampleMonsterData?: any,
  ): Promise<ModificationRecipe> {
    const g = game as any;
    const apiUrl = g.settings?.get(MODULE_ID, 'apiUrl');
    const apiKey = g.settings?.get(MODULE_ID, 'apiKey');
    const model = g.settings?.get(MODULE_ID, 'aiModel') || 'gpt-4o-mini';

    if (!apiUrl || !apiKey) {
      throw new Error('请先在模块设置中配置 API 地址和密钥');
    }

    let systemPrompt = `你是一个专业的 Pathfinder 2e 怪物设计师。你需要根据用户的改造描述，生成一个可以反复套用到不同怪物上的「改造配方」。

配方是一组结构化的修改规则，包括：
- 数值调整（等级、HP、AC、攻击、豁免等的加减或百分比调整）
- 特征变更（添加/移除特征、改变稀有度/体型）
- 新增能力（完整的 PF2e item JSON，用于添加新的攻击、动作、法术等）
- 移除能力（按名称移除）
- 免疫/抗性/弱点变更
- 名称修饰（前缀/后缀）

${NPC_STRUCTURE_GUIDE}

### 新增能力的格式要求
新增的 item 必须包含完整的 system 字段，格式参考以下示例：

近战攻击示例：
{
  "name": "Necrotic Claw",
  "type": "melee",
  "img": "systems/pf2e/icons/default-icons/melee.svg",
  "system": {
    "bonus": { "value": 0 },
    "damageRolls": { "main": { "damage": "2d8", "damageType": "negative" } },
    "attackEffects": { "custom": "", "value": [] },
    "attack": { "value": "" },
    "traits": { "rarity": "common", "value": ["magical"] },
    "description": { "value": "" },
    "publication": { "license": "OGL", "remaster": false, "title": "" },
    "rules": [], "slug": null, "range": null
  }
}
注意：近战攻击的 bonus.value 填写 0，系统会在应用时根据原怪物的最高攻击加值进行等级调整。

动作/能力示例：
{
  "name": "亡灵凝视 Undead Gaze",
  "type": "action",
  "img": "systems/pf2e/icons/actions/TwoActions.webp",
  "system": {
    "actionType": { "value": "action" },
    "actions": { "value": 2 },
    "category": "offensive",
    "description": { "value": "<p>怪物释放亡灵凝视...</p>" },
    "traits": { "rarity": "common", "value": ["divine", "necromancy", "visual"] },
    "publication": { "license": "OGL", "remaster": false, "title": "" },
    "rules": [], "slug": null
  }
}

请调用 generateRecipe 函数返回结构化的改造配方。`;

    const isChinese = this.isChineseEnvironment();
    if (isChinese) {
      systemPrompt += `\n\n### 语言要求\n- 新增能力的 name 使用"中文 English"双语格式\n- description 内容使用中文\n- namePrefix/nameSuffix 使用中文\n- descriptionNote 使用中文`;
    }

    let userPrompt = `请为以下改造需求生成一个可复用的改造配方：\n\n${description}`;

    if (sampleMonsterData) {
      const cleanSample = JSON.parse(JSON.stringify(sampleMonsterData));
      delete cleanSample._id;
      delete cleanSample._stats;
      delete cleanSample.folder;
      delete cleanSample.sort;
      delete cleanSample.ownership;
      delete cleanSample.flags;
      userPrompt += `\n\n以下是一个示例怪物的数据供参考（配方应该通用，不要局限于这个怪物）：\n\`\`\`json\n${JSON.stringify(cleanSample, null, 2)}\n\`\`\``;
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        tools: [{
          type: 'function',
          function: RECIPE_GENERATION_SCHEMA,
        }],
        tool_choice: { type: 'function', function: { name: 'generateRecipe' } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API 调用失败: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    let recipe = parseFunctionCallResponse(data, 'generateRecipe');

    if (!recipe) {
      const fallbackResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt + '\n\n请返回 JSON 格式的改造配方。' },
          ],
          temperature: 0.5,
        }),
      });
      const fallbackData = await fallbackResponse.json();
      recipe = parseFunctionCallResponse(fallbackData);
      if (!recipe) throw new Error('无法解析 AI 生成的配方');
    }

    return this.validateRecipe(recipe);
  }

  private static validateRecipe(raw: any): ModificationRecipe {
    return {
      statAdjustments: {
        level: raw.statAdjustments?.level ?? 0,
        hpPercent: raw.statAdjustments?.hpPercent ?? 1,
        hpFlat: raw.statAdjustments?.hpFlat ?? 0,
        acAdjust: raw.statAdjustments?.acAdjust ?? 0,
        attackAdjust: raw.statAdjustments?.attackAdjust ?? 0,
        saveAdjust: raw.statAdjustments?.saveAdjust ?? 0,
        perceptionAdjust: raw.statAdjustments?.perceptionAdjust ?? 0,
        skillAdjust: raw.statAdjustments?.skillAdjust ?? 0,
        abilityAdjust: raw.statAdjustments?.abilityAdjust ?? {},
        speedAdjust: raw.statAdjustments?.speedAdjust ?? 0,
      },
      addTraits: Array.isArray(raw.addTraits) ? raw.addTraits : [],
      removeTraits: Array.isArray(raw.removeTraits) ? raw.removeTraits : [],
      newRarity: raw.newRarity || undefined,
      newSize: raw.newSize || undefined,
      addItems: Array.isArray(raw.addItems) ? raw.addItems : [],
      removeItemNames: Array.isArray(raw.removeItemNames) ? raw.removeItemNames : [],
      addImmunities: Array.isArray(raw.addImmunities) ? raw.addImmunities : [],
      addResistances: Array.isArray(raw.addResistances) ? raw.addResistances : [],
      addWeaknesses: Array.isArray(raw.addWeaknesses) ? raw.addWeaknesses : [],
      removeImmunities: Array.isArray(raw.removeImmunities) ? raw.removeImmunities : [],
      removeResistances: Array.isArray(raw.removeResistances) ? raw.removeResistances : [],
      removeWeaknesses: Array.isArray(raw.removeWeaknesses) ? raw.removeWeaknesses : [],
      addSpeeds: Array.isArray(raw.addSpeeds) ? raw.addSpeeds : [],
      namePrefix: raw.namePrefix || undefined,
      nameSuffix: raw.nameSuffix || undefined,
      descriptionNote: raw.descriptionNote || undefined,
    };
  }

  // ============================================================
  // Recipe 机械化应用
  // ============================================================

  static applyRecipe(monsterData: any, recipe: ModificationRecipe): any {
    const monster = JSON.parse(JSON.stringify(monsterData));
    const adj = recipe.statAdjustments;

    delete monster._id;
    delete monster._stats;
    delete monster.folder;
    delete monster.sort;
    delete monster.ownership;

    // --- Name ---
    if (recipe.namePrefix) {
      monster.name = recipe.namePrefix + monster.name;
    }
    if (recipe.nameSuffix) {
      monster.name = monster.name + recipe.nameSuffix;
    }

    monster.type = 'npc';
    if (!monster.system) monster.system = {};

    // --- Level ---
    if (adj.level) {
      if (!monster.system.details) monster.system.details = {};
      if (!monster.system.details.level) monster.system.details.level = { value: 0 };
      monster.system.details.level.value = (monster.system.details.level.value || 0) + adj.level;
    }

    // --- HP ---
    if (monster.system.attributes?.hp) {
      let hp = monster.system.attributes.hp.max || 0;
      if (adj.hpPercent && adj.hpPercent !== 1) {
        hp = Math.round(hp * adj.hpPercent);
      }
      if (adj.hpFlat) {
        hp += adj.hpFlat;
      }
      monster.system.attributes.hp.max = Math.max(1, hp);
      monster.system.attributes.hp.value = monster.system.attributes.hp.max;
    }

    // --- AC ---
    if (adj.acAdjust && monster.system.attributes?.ac) {
      monster.system.attributes.ac.value = (monster.system.attributes.ac.value || 0) + adj.acAdjust;
    }

    // --- Saves ---
    if (adj.saveAdjust && monster.system.saves) {
      for (const save of ['fortitude', 'reflex', 'will'] as const) {
        if (monster.system.saves[save]) {
          monster.system.saves[save].value = (monster.system.saves[save].value || 0) + adj.saveAdjust;
        }
      }
    }

    // --- Perception ---
    if (adj.perceptionAdjust && monster.system.perception) {
      monster.system.perception.mod = (monster.system.perception.mod || 0) + adj.perceptionAdjust;
    }

    // --- Skills ---
    if (adj.skillAdjust && monster.system.skills) {
      for (const key of Object.keys(monster.system.skills)) {
        if (monster.system.skills[key]?.base !== undefined) {
          monster.system.skills[key].base += adj.skillAdjust;
        }
      }
    }

    // --- Abilities ---
    if (adj.abilityAdjust) {
      if (!monster.system.abilities) monster.system.abilities = {};
      for (const [abil, delta] of Object.entries(adj.abilityAdjust)) {
        if (delta && monster.system.abilities[abil]) {
          monster.system.abilities[abil].mod = (monster.system.abilities[abil].mod || 0) + delta;
        }
      }
    }

    // --- Speed ---
    if (adj.speedAdjust && monster.system.attributes?.speed) {
      monster.system.attributes.speed.value = (monster.system.attributes.speed.value || 0) + adj.speedAdjust;
    }

    // --- Traits ---
    if (!monster.system.traits) monster.system.traits = { rarity: 'common', size: { value: 'med' }, value: [] };
    if (!Array.isArray(monster.system.traits.value)) monster.system.traits.value = [];

    for (const trait of recipe.removeTraits) {
      monster.system.traits.value = monster.system.traits.value.filter(
        (t: string) => t.toLowerCase() !== trait.toLowerCase()
      );
    }
    for (const trait of recipe.addTraits) {
      if (!monster.system.traits.value.includes(trait)) {
        monster.system.traits.value.push(trait);
      }
    }

    if (recipe.newRarity) {
      monster.system.traits.rarity = recipe.newRarity;
    }
    if (recipe.newSize) {
      if (!monster.system.traits.size) monster.system.traits.size = {};
      monster.system.traits.size.value = recipe.newSize;
    }

    // --- Immunities / Resistances / Weaknesses ---
    if (!monster.system.attributes) monster.system.attributes = {};
    if (!Array.isArray(monster.system.attributes.immunities)) monster.system.attributes.immunities = [];
    if (!Array.isArray(monster.system.attributes.resistances)) monster.system.attributes.resistances = [];
    if (!Array.isArray(monster.system.attributes.weaknesses)) monster.system.attributes.weaknesses = [];

    if (recipe.removeImmunities?.length) {
      monster.system.attributes.immunities = monster.system.attributes.immunities.filter(
        (i: any) => !recipe.removeImmunities!.includes(i.type)
      );
    }
    if (recipe.addImmunities?.length) {
      monster.system.attributes.immunities.push(...recipe.addImmunities);
    }

    if (recipe.removeResistances?.length) {
      monster.system.attributes.resistances = monster.system.attributes.resistances.filter(
        (r: any) => !recipe.removeResistances!.includes(r.type)
      );
    }
    if (recipe.addResistances?.length) {
      monster.system.attributes.resistances.push(...recipe.addResistances);
    }

    if (recipe.removeWeaknesses?.length) {
      monster.system.attributes.weaknesses = monster.system.attributes.weaknesses.filter(
        (w: any) => !recipe.removeWeaknesses!.includes(w.type)
      );
    }
    if (recipe.addWeaknesses?.length) {
      monster.system.attributes.weaknesses.push(...recipe.addWeaknesses);
    }

    // --- Speeds ---
    if (recipe.addSpeeds?.length) {
      if (!monster.system.attributes.speed) monster.system.attributes.speed = { value: 25, otherSpeeds: [] };
      if (!Array.isArray(monster.system.attributes.speed.otherSpeeds)) {
        monster.system.attributes.speed.otherSpeeds = [];
      }
      for (const speed of recipe.addSpeeds) {
        const existing = monster.system.attributes.speed.otherSpeeds.find((s: any) => s.type === speed.type);
        if (existing) {
          existing.value = speed.value;
        } else {
          monster.system.attributes.speed.otherSpeeds.push(speed);
        }
      }
    }

    // --- Items: attack bonus adjustment ---
    if (Array.isArray(monster.items)) {
      if (adj.attackAdjust) {
        for (const item of monster.items) {
          if ((item.type === 'melee' || item.type === 'ranged') && item.system?.bonus) {
            item.system.bonus.value = (item.system.bonus.value || 0) + adj.attackAdjust;
          }
        }
      }

      // Remove items by name
      if (recipe.removeItemNames?.length) {
        monster.items = monster.items.filter(
          (item: any) => !recipe.removeItemNames.some(
            name => item.name?.toLowerCase() === name.toLowerCase()
          )
        );
      }

      // Add new items
      if (recipe.addItems?.length) {
        const maxAttackBonus = this.getMaxAttackBonus(monster.items);
        for (const newItem of recipe.addItems) {
          const item = JSON.parse(JSON.stringify(newItem));
          item._id = foundry.utils.randomID();
          if (!item.img) {
            item.img = this.getDefaultItemIcon(item.type, item.system?.actionType?.value);
          }
          if (!item.system) item.system = {};
          if (!item.system.description) item.system.description = { value: '' };
          if (!item.system.publication) item.system.publication = { license: 'OGL', remaster: false, title: '' };
          if (!item.system.rules) item.system.rules = [];
          if (!item.system.traits) item.system.traits = { rarity: 'common', value: [] };
          if (!item.system.slug) item.system.slug = null;

          if ((item.type === 'melee' || item.type === 'ranged') && item.system.bonus?.value === 0 && maxAttackBonus > 0) {
            item.system.bonus.value = maxAttackBonus + (adj.attackAdjust || 0);
          }

          monster.items.push(item);
        }
      }
    }

    // --- Description Note ---
    if (recipe.descriptionNote && monster.system.details) {
      const existingNotes = monster.system.details.publicNotes || '';
      monster.system.details.publicNotes = existingNotes +
        (existingNotes ? '\n' : '') +
        `<hr/><p><em>${recipe.descriptionNote}</em></p>`;
    }

    return monster;
  }

  private static getMaxAttackBonus(items: any[]): number {
    let max = 0;
    for (const item of items) {
      if ((item.type === 'melee' || item.type === 'ranged') && item.system?.bonus?.value) {
        max = Math.max(max, item.system.bonus.value);
      }
    }
    return max;
  }

  // ============================================================
  // 校验和修复
  // ============================================================

  static validateAndFixMonsterData(result: any, originalData: any): any {
    const monster = { ...result };

    monster.type = 'npc';
    delete monster._id;
    delete monster._stats;

    if (!monster.name) {
      monster.name = originalData.name + ' (改造)';
    }
    if (!monster.img) {
      monster.img = originalData.img || 'systems/pf2e/icons/default-icons/npc.svg';
    }
    if (!monster.system) {
      monster.system = JSON.parse(JSON.stringify(originalData.system));
    }

    const sys = monster.system;
    const origSys = originalData.system || {};

    if (!sys.abilities) sys.abilities = origSys.abilities || {};
    if (!sys.attributes) sys.attributes = origSys.attributes || {};
    if (!sys.details) sys.details = origSys.details || {};
    if (!sys.perception) sys.perception = origSys.perception || {};
    if (!sys.saves) sys.saves = origSys.saves || {};
    if (!sys.skills) sys.skills = origSys.skills || {};
    if (!sys.traits) sys.traits = origSys.traits || {};
    if (!sys.initiative) sys.initiative = origSys.initiative || {};
    if (sys.resources === undefined) sys.resources = origSys.resources || {};

    if (!sys.details.level) sys.details.level = { value: origSys.details?.level?.value || 0 };
    if (!sys.attributes.hp) sys.attributes.hp = origSys.attributes?.hp || { max: 10, value: 10, temp: 0 };
    if (sys.attributes.hp.value === undefined) sys.attributes.hp.value = sys.attributes.hp.max;
    if (!sys.attributes.ac) sys.attributes.ac = origSys.attributes?.ac || { value: 10 };
    if (!sys.attributes.speed) sys.attributes.speed = origSys.attributes?.speed || { value: 25, otherSpeeds: [] };

    // Merge missing items from original
    if (!Array.isArray(monster.items)) {
      monster.items = JSON.parse(JSON.stringify(originalData.items || []));
    } else {
      const returnedIds = new Set(monster.items.filter((i: any) => i._id).map((i: any) => i._id));
      const originalItems = originalData.items || [];
      for (const origItem of originalItems) {
        if (origItem._id && !returnedIds.has(origItem._id)) {
          console.warn(`[MonsterModifier] AI 遗漏了 item "${origItem.name}" (${origItem._id})，自动补回`);
          monster.items.push(JSON.parse(JSON.stringify(origItem)));
        }
      }
    }

    for (const item of monster.items) {
      if (!item._id || item._id === '') {
        item._id = foundry.utils.randomID();
      }
      if (!item.type) item.type = 'action';
      if (!item.img) item.img = this.getDefaultItemIcon(item.type, item.system?.actionType?.value);
      if (!item.system) item.system = {};
      if (!item.system.description) item.system.description = { value: '' };
      if (!item.system.publication) item.system.publication = { license: 'OGL', remaster: false, title: '' };
      if (!item.system.rules) item.system.rules = [];
      if (!item.system.traits) item.system.traits = { rarity: 'common', value: [] };

      if (item.type === 'action') {
        if (!item.system.actionType) item.system.actionType = { value: 'passive' };
        if (item.system.actions === undefined) item.system.actions = { value: null };
        if (!item.system.category) item.system.category = 'offensive';
      }

      if (item.type === 'melee' || item.type === 'ranged') {
        if (!item.system.bonus) item.system.bonus = { value: 0 };
        if (!item.system.damageRolls) item.system.damageRolls = {};
        if (!item.system.attackEffects) item.system.attackEffects = { custom: '', value: [] };
        if (!item.system.attack) item.system.attack = { value: '' };
        if (item.system.range === undefined) item.system.range = null;
      }

      if (item._stats?.compendiumSource && !this.isValidCompendiumSource(item._stats.compendiumSource)) {
        delete item._stats;
      }
    }

    return monster;
  }

  private static getDefaultItemIcon(type: string, actionType?: string): string {
    switch (type) {
      case 'melee': return 'systems/pf2e/icons/default-icons/melee.svg';
      case 'ranged': return 'systems/pf2e/icons/default-icons/ranged.svg';
      case 'spell': return 'systems/pf2e/icons/default-icons/spell.svg';
      case 'action':
        if (actionType === 'action') return 'systems/pf2e/icons/actions/OneAction.webp';
        if (actionType === 'reaction') return 'systems/pf2e/icons/actions/Reaction.webp';
        if (actionType === 'free') return 'systems/pf2e/icons/actions/FreeAction.webp';
        return 'systems/pf2e/icons/actions/Passive.webp';
      default: return 'systems/pf2e/icons/default-icons/npc.svg';
    }
  }

  private static isValidCompendiumSource(source: string): boolean {
    return source.startsWith('Compendium.pf2e.');
  }
}
