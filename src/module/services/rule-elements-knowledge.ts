/**
 * Rule Elements知识库
 * 基于PF2e Wiki的Rule Elements文档整合
 * 来源: https://github.com/foundryvtt/pf2e/wiki/Quickstart-guide-for-rule-elements
 */

export const RULE_ELEMENTS_WIKI_KNOWLEDGE = `
# PF2e Rule Elements 完整指南

Rule Elements是PF2e系统处理自动化的核心机制。规则元素可以添加修正值、调整修正值、改变token图像、修改角色数据、为角色添加toggles、授予专长等。

## 核心概念

### 规则元素的基本结构
每个规则元素都是一个JSON对象，必须包含 "key" 字段来指定规则元素的类型。

### 重要术语
- **String（字符串）**: 用双引号包裹的文本，例如 "agile"
- **Number（数字）**: 数值，例如 2 或 -1
- **Boolean（布尔值）**: true 或 false（不加引号）
- **Array（数组）**: 用方括号 [] 包裹的集合，例如 ["agile", "elf"]
- **Object（对象）**: 用花括号 {} 包裹的键值对集合

### 数据准备和Phase
规则元素按阶段(phase)执行：
- beforeDerived: 在派生数据计算前
- afterDerived: 在派生数据计算后（默认）
- beforeRoll: 在投骰前
- applyActiveEffects: 应用活动效果时

## Selectors（选择器）

选择器指定规则元素影响什么。常见选择器包括：

### 攻击选择器
- "strike-attack-roll" - 所有攻击骰
- "melee-strike-attack-roll" - 近战攻击
- "ranged-strike-attack-roll" - 远程攻击
- "spell-attack-roll" - 法术攻击骰

### 伤害选择器
- "strike-damage" - 所有武器伤害
- "melee-strike-damage" - 近战伤害
- "ranged-strike-damage" - 远程伤害
- "spell-damage" - 法术伤害

### 技能选择器
- "acrobatics" - 杂技
- "athletics" - 运动
- "deception" - 欺诈
- "stealth" - 隐秘
- 等等（所有技能都可以作为选择器）

### AC和豁免选择器
- "ac" - 护甲等级
- "fortitude" - 强韧豁免
- "reflex" - 反射豁免
- "will" - 意志豁免

### 通用选择器
- "all" - 影响所有检定
- "damage" - 所有伤害
- "check" - 所有检定

## Predicates（谓词）

谓词用于条件判断，控制规则元素何时生效。

### 基本谓词格式
\`\`\`json
"predicate": ["condition1", "condition2"]
\`\`\`
数组中的条件是AND关系（都必须满足）。

### 逻辑运算符
- OR条件：
\`\`\`json
"predicate": [{"or": ["condition1", "condition2"]}]
\`\`\`

- NOT条件：
\`\`\`json
"predicate": [{"not": "condition"}]
\`\`\`

- AND条件（默认）：
\`\`\`json
"predicate": ["condition1", "condition2"]
\`\`\`

### 常用谓词
- "self:effect:EFFECT_SLUG" - 检查自己是否有特定效果
- "target:condition:CONDITION" - 检查目标是否有特定状态
- "item:trait:TRAIT" - 检查物品是否有特定特性
- "action:ACTION" - 检查是否在执行特定动作
- "weapon:group:GROUP" - 检查武器组
- "weapon:trait:TRAIT" - 检查武器特性

## 规则元素类型详解

### 1. FlatModifier - 固定修正值
添加固定数值修正到检定、AC、伤害等。

\`\`\`json
{
  "key": "FlatModifier",
  "selector": "strike-attack-roll",
  "value": 2,
  "type": "circumstance",
  "label": "PF2E.SpecificRule.TOOSettings.Flanking"
}
\`\`\`

参数：
- key: "FlatModifier"
- selector: 影响的目标（必需）
- value: 修正值，可以是数字或表达式如 "@actor.level"
- type: 修正类型（circumstance, status, item等）
- label: 显示标签
- predicate: 生效条件（可选）

### 2. DamageDice - 伤害骰
添加额外伤害骰。

\`\`\`json
{
  "key": "DamageDice",
  "selector": "strike-damage",
  "diceNumber": 1,
  "dieSize": "d6",
  "damageType": "fire"
}
\`\`\`

参数：
- key: "DamageDice"
- selector: 伤害选择器
- diceNumber: 骰子数量
- dieSize: 骰子大小（"d4", "d6", "d8", "d10", "d12"）
- damageType: 伤害类型
- predicate: 生效条件（可选）

### 3. AdjustModifier - 调整修正值
修改已存在的修正值。

\`\`\`json
{
  "key": "AdjustModifier",
  "selector": "strike-attack-roll",
  "slug": "rage",
  "mode": "add",
  "value": 1
}
\`\`\`

参数：
- key: "AdjustModifier"
- selector: 选择器
- slug: 要调整的修正值标识
- mode: 调整模式（"add", "subtract", "upgrade", "downgrade", "override"）
- value: 调整值

### 4. GrantItem - 授予物品
给角色添加物品、专长、法术等。

\`\`\`json
{
  "key": "GrantItem",
  "uuid": "Compendium.pf2e.feats-srd.Item.SKRqFJEhHDkSb6Hy"
}
\`\`\`

或创建新物品：
\`\`\`json
{
  "key": "GrantItem",
  "onDeleteActions": {
    "granter": "restrict"
  },
  "item": {
    "type": "feat",
    "name": "Special Feat",
    "system": {
      "description": {
        "value": "A special feat granted by this item"
      }
    }
  }
}
\`\`\`

### 5. RollOption - 添加投骰选项
添加可用于谓词判断的标记。

\`\`\`json
{
  "key": "RollOption",
  "domain": "all",
  "option": "special-ability-active"
}
\`\`\`

参数：
- key: "RollOption"
- domain: 作用域（"all", "attack", "damage", "skill-check"等）
- option: 选项名称
- toggleable: 是否可切换（true/false）
- predicate: 生效条件

### 6. Resistance - 抗性
添加对特定伤害类型的抗性。

\`\`\`json
{
  "key": "Resistance",
  "type": "fire",
  "value": 5
}
\`\`\`

参数：
- key: "Resistance"
- type: 伤害类型
- value: 抗性值

### 7. Weakness - 弱点
添加对特定伤害类型的弱点。

\`\`\`json
{
  "key": "Weakness",
  "type": "cold",
  "value": 5
}
\`\`\`

### 8. Immunity - 免疫
添加免疫。

\`\`\`json
{
  "key": "Immunity",
  "type": "fire"
}
\`\`\`

### 9. ActorTraits - 角色特性
添加或移除角色特性标签。

\`\`\`json
{
  "key": "ActorTraits",
  "add": ["elf", "good"]
}
\`\`\`

或移除：
\`\`\`json
{
  "key": "ActorTraits",
  "remove": ["human"]
}
\`\`\`

### 10. BaseSpeed - 基础速度
修改角色的移动速度。

\`\`\`json
{
  "key": "BaseSpeed",
  "selector": "land",
  "value": 30
}
\`\`\`

参数：
- key: "BaseSpeed"
- selector: 速度类型（"land", "fly", "swim", "burrow", "climb"）
- value: 速度值

### 11. Sense - 感官
添加特殊感官能力。

\`\`\`json
{
  "key": "Sense",
  "selector": "darkvision",
  "range": 60
}
\`\`\`

### 12. TempHP - 临时生命值
给予临时生命值。

\`\`\`json
{
  "key": "TempHP",
  "value": 10
}
\`\`\`

### 13. FastHealing - 快速治疗
添加快速治疗能力。

\`\`\`json
{
  "key": "FastHealing",
  "value": 5
}
\`\`\`

### 14. Regeneration - 再生
添加再生能力。

\`\`\`json
{
  "key": "Regeneration",
  "value": 10,
  "deactivatedBy": ["acid", "fire"]
}
\`\`\`

### 15. AdjustStrike - 调整攻击
修改攻击的属性。

\`\`\`json
{
  "key": "AdjustStrike",
  "mode": "add",
  "property": "weapon-traits",
  "value": "magical"
}
\`\`\`

### 16. Strike - 创建攻击
创建新的攻击选项。

\`\`\`json
{
  "key": "Strike",
  "category": "unarmed",
  "damage": {
    "base": {
      "damageType": "bludgeoning",
      "dice": 1,
      "die": "d6"
    }
  },
  "img": "systems/pf2e/icons/default-icons/melee.svg",
  "label": "PF2E.BattleForm.Attack.Fist",
  "range": null,
  "traits": ["agile", "finesse", "nonlethal"]
}
\`\`\`

### 17. TokenImage - Token图像
更改token的图像。

\`\`\`json
{
  "key": "TokenImage",
  "value": "systems/pf2e/icons/bestiary/boar.webp"
}
\`\`\`

### 18. TokenLight - Token光照
为token添加光照。

\`\`\`json
{
  "key": "TokenLight",
  "value": {
    "bright": 20,
    "dim": 40,
    "color": "#9b7337"
  }
}
\`\`\`

### 19. Aura - 光环
创建光环效果。

\`\`\`json
{
  "key": "Aura",
  "slug": "protective-aura",
  "radius": 10,
  "effects": [
    {
      "uuid": "Compendium.pf2e.feat-effects.Item.effectUUID"
    }
  ]
}
\`\`\`

### 20. ChoiceSet - 选择集
让玩家做出选择。

\`\`\`json
{
  "key": "ChoiceSet",
  "prompt": "PF2E.SpecificRule.Prompt.Skill",
  "choices": [
    {
      "value": "acrobatics",
      "label": "PF2E.SkillAcrobatics"
    },
    {
      "value": "athletics",
      "label": "PF2E.SkillAthletics"
    }
  ]
}
\`\`\`

### 21. ItemAlteration - 物品改变
修改其他物品的属性。

\`\`\`json
{
  "key": "ItemAlteration",
  "mode": "add",
  "property": "other-tags",
  "value": "crossbow-ace"
}
\`\`\`

### 22. CriticalSpecialization - 重击专精
添加武器重击专精效果。

\`\`\`json
{
  "key": "CriticalSpecialization",
  "predicate": ["weapon:group:sword"]
}
\`\`\`

### 23. MultipleAttackPenalty - 多次攻击减值
修改多次攻击减值。

\`\`\`json
{
  "key": "MultipleAttackPenalty",
  "selector": "strike-attack-roll",
  "value": -3
}
\`\`\`

### 24. AdjustDegreeOfSuccess - 调整成功度
改变检定结果的成功度。

\`\`\`json
{
  "key": "AdjustDegreeOfSuccess",
  "selector": "saving-throw",
  "adjustment": {
    "success": "one-degree-better"
  },
  "predicate": ["item:trait:poison"]
}
\`\`\`

### 25. RollTwice - 投骰两次
让检定投两次骰子。

\`\`\`json
{
  "key": "RollTwice",
  "selector": "perception",
  "keep": "higher"
}
\`\`\`

参数：
- keep: "higher" 或 "lower"

### 26. DexterityModifierCap - 敏捷修正上限
设置敏捷修正的上限。

\`\`\`json
{
  "key": "DexterityModifierCap",
  "value": 3
}
\`\`\`

### 27. MartialProficiency - 武术熟练度
修改武器或防具的熟练度。

\`\`\`json
{
  "key": "MartialProficiency",
  "slug": "simple-weapons",
  "definition": {
    "category": "simple"
  },
  "rank": 2
}
\`\`\`

rank值：0=未受训，1=受训，2=专家，3=大师，4=传奇

### 28. CreatureSize - 生物体型
改变生物的体型。

\`\`\`json
{
  "key": "CreatureSize",
  "value": "large"
}
\`\`\`

体型值：tiny, small, medium, large, huge, gargantuan

### 29. Note - 注释
添加显示在检定卡片上的注释。

\`\`\`json
{
  "key": "Note",
  "selector": "strike-attack-roll",
  "title": "Special Note",
  "text": "This attack has special properties"
}
\`\`\`

### 30. EphemeralEffect - 短暂效果
在特定条件下自动应用效果。

\`\`\`json
{
  "key": "EphemeralEffect",
  "affects": "target",
  "uuid": "Compendium.pf2e.conditionitems.Item.Stunned",
  "predicate": ["critical-success"]
}
\`\`\`

## 表达式和引用

可以在value字段中使用表达式：

- "@actor.level" - 角色等级
- "@actor.abilities.str.mod" - 力量修正
- "@actor.abilities.dex.mod" - 敏捷修正
- "@item.level" - 物品等级
- "@item.badge.value" - 物品徽章值

算术运算：
- "@actor.level * 2"
- "@actor.level + 5"
- "max(@actor.level, 10)"

## 常见模式和示例

### 示例1：每级增加的加值
\`\`\`json
{
  "key": "FlatModifier",
  "selector": "strike-damage",
  "value": "@actor.level",
  "type": "status",
  "label": "Level Damage Bonus"
}
\`\`\`

### 示例2：条件性攻击加值
\`\`\`json
{
  "key": "FlatModifier",
  "selector": "strike-attack-roll",
  "value": 2,
  "type": "circumstance",
  "predicate": ["target:condition:flat-footed"],
  "label": "Bonus vs Flat-Footed"
}
\`\`\`

### 示例3：添加武器特性
\`\`\`json
{
  "key": "AdjustStrike",
  "mode": "add",
  "property": "weapon-traits",
  "value": "deadly-d10",
  "predicate": ["weapon:group:sword"]
}
\`\`\`

### 示例4：授予专长并带条件
\`\`\`json
{
  "key": "GrantItem",
  "uuid": "Compendium.pf2e.feats-srd.Item.SomeFeature",
  "predicate": ["class:fighter"]
}
\`\`\`

### 示例5：复合效果（多个规则）
\`\`\`json
[
  {
    "key": "FlatModifier",
    "selector": "ac",
    "value": 2,
    "type": "circumstance"
  },
  {
    "key": "FastHealing",
    "value": 5
  },
  {
    "key": "Resistance",
    "type": "physical",
    "value": 5
  }
]
\`\`\`

## 最佳实践

1. **始终包含label**：让玩家知道修正来自哪里
2. **使用合适的type**：确保修正类型正确（circumstance, status, item等）
3. **谨慎使用表达式**：确保引用的数据路径存在
4. **充分测试谓词**：确保条件判断正确
5. **使用slug标识**：便于其他规则元素引用和调整
6. **注意phase顺序**：某些规则需要在特定阶段执行
7. **提供清晰的文档**：在description中说明规则的作用

## 常见错误避免

1. 不要忘记引号：字符串必须用双引号包裹
2. 注意逗号：对象的最后一个属性后不要加逗号
3. 大小写敏感：key名称必须完全匹配
4. 选择器拼写：确保selector名称正确
5. 预设谓词：使用系统已有的谓词而不是自创
6. 循环引用：避免规则元素相互引用造成死循环

## 调试技巧

1. 打开控制台查看错误信息
2. 使用简单规则测试，逐步增加复杂度
3. 检查系统日志中的规则元素警告
4. 在测试角色上实验，不要直接在重要角色上修改
5. 保存备份数据，以防规则出错
`;

/**
 * Rule Elements知识库服务
 */
export class RuleElementsKnowledgeService {
  private static instance: RuleElementsKnowledgeService;

  private constructor() {}

  public static getInstance(): RuleElementsKnowledgeService {
    if (!RuleElementsKnowledgeService.instance) {
      RuleElementsKnowledgeService.instance = new RuleElementsKnowledgeService();
    }
    return RuleElementsKnowledgeService.instance;
  }

  /**
   * 获取完整的Rule Elements知识库
   */
  public getFullKnowledge(): string {
    return RULE_ELEMENTS_WIKI_KNOWLEDGE;
  }

  /**
   * 获取特定规则元素类型的知识
   */
  public getRuleElementTypeKnowledge(type: string): string {
    const lines = RULE_ELEMENTS_WIKI_KNOWLEDGE.split('\n');
    let capturing = false;
    let result: string[] = [];
    let sectionLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 检查是否是目标规则元素的章节标题
      if (line.includes(`### `) && line.toLowerCase().includes(type.toLowerCase())) {
        capturing = true;
        sectionLevel = 3;
        result.push(line);
        continue;
      }

      if (capturing) {
        // 如果遇到同级或更高级别的标题，停止捕获
        if (line.startsWith('###') && sectionLevel === 3) {
          break;
        }
        result.push(line);
      }
    }

    return result.join('\n');
  }

  /**
   * 获取常用规则元素类型列表
   */
  public getCommonRuleElementTypes(): string[] {
    return [
      'FlatModifier',
      'DamageDice',
      'AdjustModifier',
      'GrantItem',
      'RollOption',
      'Resistance',
      'Weakness',
      'Immunity',
      'ActorTraits',
      'BaseSpeed',
      'Sense',
      'TempHP',
      'FastHealing',
      'Regeneration',
      'AdjustStrike',
      'Strike',
      'TokenImage',
      'TokenLight',
      'Aura',
      'ChoiceSet',
      'ItemAlteration',
      'CriticalSpecialization',
      'MultipleAttackPenalty',
      'AdjustDegreeOfSuccess',
      'RollTwice',
      'DexterityModifierCap',
      'MartialProficiency',
      'CreatureSize',
      'Note',
      'EphemeralEffect'
    ];
  }

  /**
   * 获取Selector相关知识
   */
  public getSelectorKnowledge(): string {
    const lines = RULE_ELEMENTS_WIKI_KNOWLEDGE.split('\n');
    let capturing = false;
    let result: string[] = [];

    for (const line of lines) {
      if (line.includes('## Selectors')) {
        capturing = true;
      } else if (capturing && line.startsWith('## ') && !line.includes('Selectors')) {
        break;
      }

      if (capturing) {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  /**
   * 获取Predicate相关知识
   */
  public getPredicateKnowledge(): string {
    const lines = RULE_ELEMENTS_WIKI_KNOWLEDGE.split('\n');
    let capturing = false;
    let result: string[] = [];

    for (const line of lines) {
      if (line.includes('## Predicates')) {
        capturing = true;
      } else if (capturing && line.startsWith('## ') && !line.includes('Predicates')) {
        break;
      }

      if (capturing) {
        result.push(line);
      }
    }

    return result.join('\n');
  }
}

