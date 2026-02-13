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

## Effect物品与规则元素的配合使用

### 什么时候需要独立的Effect物品？

在PF2e系统中，很多自动化效果并不是直接在专长或道具中实现，而是通过创建独立的Effect物品来实现。

**需要Effect物品的典型场景:**

1. **可开关的效果（Toggle）**
   - 战斗姿态、光环等可以激活/关闭的能力
   - 示例：防御姿态、愤怒狂暴、鼓舞勇气
   - 特点：持续时间为unlimited，配合RollOption的toggleable属性

2. **施加给其他单位的效果（Target Effect）**
   - 给盟友的buff、给敌人的debuff
   - 示例：战术标记、祝福、诅咒
   - 特点：需要将effect拖拽到目标角色身上

3. **有条件触发的效果（Conditional）**
   - 满足特定条件才生效的增益
   - 示例：对特定敌人的伤害加值、在特定地形的速度加成
   - 特点：effect中包含predicate判断条件

4. **多阶段效果（Staged Effect）**
   - 根据成功度不同产生不同效果
   - 示例：Bon Mot（大成功-3，成功-2，大失败-2）
   - 特点：使用ChoiceSet让玩家选择成功度

5. **光环效果（Aura）**
   - 影响周围一定范围内单位的持续效果
   - 效果：当角色进入光环范围时，会自动获得效果
   - 注意光环本身是一个规则元素，需要在主体能力中添加Aura规则元素来创建光环效果
   - 示例：绝望光环、信念光环
   - 特点：范围持续，通常unlimited持续时间

### Effect物品的引用方式

**⚠️ 重要设计原则**:

除了**光环效果(Aura)**外,其他Effect物品应该由玩家手动施加,而不是通过GrantItem自动授予!

**正确的引用方式**:

**方式1: 描述中内联引用** (推荐)
在专长/道具的description.value中添加Effect的UUID链接:
\`\`\`html
<p>你选择一把武器,在1分钟内获得增益。</p>
<p><strong>效果</strong>: @UUID[Item.abc123xyz]{刀刃导师的恩赐效果}</p>
<p>点击上方链接可将effect添加到角色身上。</p>
\`\`\`

**方式2: 使用Note规则元素**
\`\`\`json
{
  "key": "Note",
  "selector": "self",
  "title": "使用说明",
  "text": "使用此能力后,将 @UUID[Item.abc123xyz]{效果} 添加到角色身上"
}
\`\`\`

**方式3: 仅限光环 - 使用Aura规则元素**
\`\`\`json
{
  "key": "Aura",
  "slug": "aura-of-despair",
  "radius": 15,
  "effects": [
    {
      "uuid": "Item.abc123xyz",
      "affects": "enemies"
    }
  ]
}
\`\`\`

**❌ 错误方式 - 不要直接GrantItem** (除非是光环):
\`\`\`json
{
  "key": "GrantItem",
  "uuid": "Item.abc123xyz",
  "predicate": ["self:effect:some-toggle"]
}
\`\`\`
这种方式会自动授予effect,剥夺了玩家的控制权!

**方式4: 使用GrantItem + 内联创建** (仅用于简单effect)
\`\`\`json
{
  "key": "GrantItem",
  "onDeleteActions": {
    "granter": "restrict"
  },
  "item": {
    "type": "effect",
    "name": "Effect: Defensive Stance",
    "img": "icons/svg/aura.svg",
    "system": {
      "description": {
        "value": "<p>由防御姿态授予</p>"
      },
      "duration": {
        "expiry": null,
        "sustained": false,
        "unit": "unlimited",
        "value": -1
      },
      "rules": [
        {
          "key": "FlatModifier",
          "selector": "ac",
          "value": 2,
          "type": "circumstance"
        }
      ]
    }
  }
}
\`\`\`
- 直接在规则中定义effect
- 不需要预先创建effect物品
- 适合简单的、不需要复用的effect

### Effect物品与Toggle的配合

**典型模式: RollOption + GrantItem**

主物品（专长/道具）:
\`\`\`json
{
  "rules": [
    {
      "key": "RollOption",
      "domain": "all",
      "option": "defensive-stance",
      "toggleable": true,
      "label": "防御姿态"
    },
    {
      "key": "GrantItem",
      "uuid": "Item.defensiveStanceEffect",
      "predicate": ["self:effect:defensive-stance"]
    }
  ]
}
\`\`\`

Effect物品:
\`\`\`json
{
  "name": "Effect: Defensive Stance",
  "type": "effect",
  "system": {
    "duration": {
      "unit": "unlimited",
      "value": -1
    },
    "rules": [
      {
        "key": "FlatModifier",
        "selector": "ac",
        "value": 2,
        "type": "circumstance"
      }
    ]
  }
}
\`\`\`

**工作流程:**
1. 玩家在角色卡上切换"防御姿态"开关
2. RollOption创建self:effect:defensive-stance标记
3. GrantItem的predicate检测到标记，授予effect
4. Effect物品应用其内部的规则元素（AC+2）
5. 玩家关闭开关时，effect自动移除

### 仅使用开关的简化方案（无需Effect）

当效果只影响自身且不需要独立Effect物品时，可以直接用RollOption开关控制主物品内的规则元素：
\`\`\`json
[
  {
    "key": "RollOption",
    "domain": "all",
    "option": "defensive-stance",
    "toggleable": true,
    "label": "防御姿态"
  },
  {
    "key": "FlatModifier",
    "selector": "ac",
    "value": 2,
    "type": "circumstance",
    "predicate": ["defensive-stance"]
  }
]
\`\`\`
- 适合仅作用于自身、无需拖拽/引用的临时增益
- 不适合光环或需要施加给他人的效果

### Effect物品的文件夹管理

**最佳实践:**
- 为每个专长/道具创建独立的effect文件夹
- 文件夹命名: "[专长名] - Effects"
- 便于管理和清理相关的effect物品
- 示例: "防御姿态 - Effects"文件夹包含"Effect: Defensive Stance"

### 效果划分指南 - 什么应该写在哪里?

**核心原则**: 
- **主物品(专长/道具)**: 包含触发条件、使用说明、频率限制等"元信息"
- **Effect物品**: 只包含实际的游戏效果rules

**主物品中应该包含:**

1. ✅ **使用条件和限制**
   - 频率限制 (Frequency)
   - 需求 (Requirements)
   - 触发条件 (Trigger)
   - 动作消耗 (Actions)

2. ✅ **被动永久效果**
   - 技能熟练度提升
   - 永久属性加值
   - 感官能力 (如黑暗视觉)
   - 速度修改

3. ✅ **选择和配置**
   - ChoiceSet (选择技能、专长等)
   - 前置条件判断

4. ✅ **Effect的引用说明**
   - 描述中的UUID链接
   - Note规则元素说明如何使用

**Effect物品中应该包含:**

1. ✅ **临时战术增益**
   - 攻击检定加值
   - 伤害加值
   - AC加值
   - 豁免加值

2. ✅ **状态效果**
   - 减值和惩罚
   - 条件免疫
   - 抗性/弱点

3. ✅ **持续时间效果**
   - 有明确结束时间的buff/debuff
   - 需要玩家手动添加的效果

4. ✅ **多目标效果**
   - 施加给敌人的debuff
   - 给予盟友的buff

**实例对比**:

**错误示例** - 都写在主物品里:
\`\`\`json
{
  "name": "刀刃导师的恩赐",
  "system": {
    "rules": [
      {"key": "FlatModifier", "selector": "strike-attack-roll", "value": 1},
      {"key": "DamageDice", "selector": "strike-damage", "diceNumber": 1},
      {"key": "AdjustStrike", "property": "range-increment", "value": 30}
    ]
  }
}
\`\`\`
❌ 问题: 这些临时效果混在主物品里,无法控制何时生效

**正确示例** - 分离主物品和Effect:

主物品:
\`\`\`json
{
  "name": "刀刃导师的恩赐",
  "system": {
    "description": {
      "value": "<p><strong>频率</strong> 每天次数等于你的魅力调整值(最少1次)</p><p><strong>需求</strong> 你必须持握一把武器</p><p>选择你持握的武器,在1分钟内获得增益。</p><p>@UUID[Item.xyz]{点击此处添加效果}</p>"
    },
    "frequency": {"max": 1, "per": "day"},
    "rules": []  // 主物品只包含说明,不包含临时效果
  }
}
\`\`\`

Effect物品:
\`\`\`json
{
  "name": "Effect: 刀刃导师的恩赐",
  "type": "effect",
  "system": {
    "duration": {"unit": "minutes", "value": 1},
    "rules": [
      {"key": "FlatModifier", "selector": "strike-attack-roll", "type": "status", "value": 1},
      {"key": "DamageDice", "selector": "strike-damage", "diceNumber": 1, "dieSize": "d6"},
      {"key": "AdjustStrike", "mode": "add", "property": "range-increment", "value": 30}
    ]
  }
}
\`\`\`
✅ 好处: 玩家使用能力后手动添加effect,可以控制持续时间和目标

**设计建议**

**何时使用独立Effect:**
- ✅ 需要玩家手动施加的临时效果
- ✅ 需要施加给其他单位的效果
- ✅ 有明确持续时间的效果
- ✅ 需要被其他能力引用的效果
- ✅ 官方示例中使用了effect的类似能力

**何时直接写在主物品:**
- ✅ 简单的被动永久增益（如技能加值）
- ✅ 永久性的属性修改
- ✅ 不需要开关的持续效果
- ✅ 选择和配置类规则 (ChoiceSet)

**光环效果的特殊处理:**
光环是唯一应该使用Aura规则元素自动授予Effect的场景:
\`\`\`json
{
  "key": "Aura",
  "slug": "protective-aura",
  "radius": 10,
  "effects": [
    {"uuid": "Item.effectUUID", "affects": "allies"}
  ]
}
\`\`\`

**命名规范:**
- Effect物品名称格式: "Effect: [能力名]"
- 例如: "Effect: Bon Mot", "Effect: Aura of Despair"
- 保持与官方effect的命名风格一致

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

### 常用谓词格式总结

PF2e系统中的谓词（predicate）使用冒号分隔的格式来描述游戏状态和条件。

**基本格式**: [主体]:[类别]:[具体值]

#### 主体（Subject）前缀
- self: 检查施术者/持有者自身
- target: 检查目标
- origin: 检查效果的来源
- item: 检查物品属性
- weapon: 检查武器属性
- action: 检查正在执行的动作
- class: 检查职业
- feature: 检查特性
- skill: 检查技能
- defense: 检查防御

#### 常用谓词模式

**效果和状态检查**:
- self:effect:EFFECT_SLUG - 检查自己是否有特定效果
  示例: self:effect:stance:defensive, self:effect:rage
- target:condition:CONDITION - 检查目标是否有特定状态
  示例: target:condition:off-guard, target:condition:frightened
- self:condition:CONDITION - 检查自己是否有特定状态
  示例: self:condition:prone, self:condition:dying

**特性和标签检查**:
- item:trait:TRAIT - 检查物品/法术是否有特定特性
  示例: item:trait:fear, item:trait:fire, item:trait:emotion
- target:trait:TRAIT - 检查目标是否有特定特性
  示例: target:trait:undead, target:trait:unholy
- self:trait:TRAIT - 检查自己是否有特定特性
  示例: self:trait:elf, self:trait:dwarf

**武器相关**:
- weapon:group:GROUP - 检查武器组
  示例: weapon:group:sword, weapon:group:bow
- weapon:trait:TRAIT - 检查武器特性
  示例: weapon:trait:agile, weapon:trait:finesse
- item:category:CATEGORY - 检查物品类别
  示例: item:category:unarmed, item:category:simple

**动作和技能**:
- action:ACTION - 检查是否在执行特定动作
  示例: action:perform, action:attack, action:maneuver-in-flight
- skill:SKILL:rank - 检查技能等级
  示例: skill:acrobatics:rank, skill:athletics:rank

**物品相关**:
- item:damage:category:TYPE - 检查伤害类别
  示例: item:damage:category:energy
- item:tag:TAG - 检查物品标签
  示例: item:tag:apparition-spell, item:tag:minor-spirit-power
- item:ranged - 检查是否为远程物品
- item:melee - 检查是否为近战物品

**类型和等级**:
- self:type:TYPE - 检查生物类型
  示例: self:type:npc, self:type:pc
- defense:ARMOR:rank:RANK - 检查防具熟练度
  示例: defense:light:rank:0

**标记和自定义选项**:
- RollOption创建的自定义标记（不使用冒号前缀）
  示例: channelers-stance, arc-of-destruction
- origin:mark:MARK_NAME - 检查来源标记
  示例: origin:mark:memories-of-failure

#### 比较运算符

在谓词中可以使用比较运算:
\`\`\`json
{
  "gte": ["skill:acrobatics:rank", 1]  // 大于等于
}
{
  "lte": ["@actor.level", 10]  // 小于等于
}
{
  "gt": ["@actor.hp", 50]  // 大于
}
{
  "lt": ["@actor.level", 5]  // 小于
}
\`\`\`

#### 复杂谓词组合示例

\`\`\`json
"predicate": [
  "channelers-stance",
  "item:damage:category:energy",
  {
    "or": [
      "item:tag:apparition-spell",
      {
        "and": [
          "item:trait:animist",
          "item:trait:focus"
        ]
      }
    ]
  }
]
\`\`\`

**重要提示**:
- 数组顶层的多个条件是AND关系（全部满足）
- 使用 {"or": [...]} 表示OR关系（满足任一）
- 使用 {"not": "..."} 表示NOT关系（不满足）
- 使用 {"and": [...]} 在嵌套中明确AND关系
- 冒号后的值通常使用 kebab-case (如 off-guard, maneuver-in-flight)

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
- dieSize: 骰子大小 **（必须是 "d4", "d6", "d8", "d10", "d12", "d20" 之一）**
- damageType: 伤害类型
- predicate: 生效条件（可选）

**常见错误**:
- ❌ "dieSize": "1d6" → 错误！应该是 "d6"
- ❌ "dieSize": "d7" → 错误！没有d7这种骰子
- ❌ "dieSize": null → 如果要使用null，必须配合其他规则，通常不需要
- ✅ "dieSize": "d6" → 正确！

**错误提示**: "Die size must be a recognized damage die size, null, or omitted"
- 原因：dieSize的值不是有效的骰子大小
- 解决：使用 "d4", "d6", "d8", "d10", "d12", "d20" 之一

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
- label: 可选显示名称（建议设置，用于角色卡开关标签）

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

**重要警告**:
1. ❌ 不要使用AdjustStrike来修改伤害骰!应该使用DamageDice或StrikingRune。
2. ❌ 不要给近战武器添加range-increment!只能给已有射程的远程武器调整射程。
   - 错误示例：给剑添加30尺射程 → "A weapon that meets the definition lacks a range increment"
   - 如果要让近战武器能远程攻击，应该创建临时投掷武器，而不是调整Strike

**有效的property值**:
- "weapon-traits": 添加或修改武器特性
- "materials": 修改武器材质
- "property-runes": 添加属性符文
- "range-increment": 修改射程增量（仅用于已有射程的武器！）

**示例 - 添加武器特性**:
\`\`\`json
{
  "key": "AdjustStrike",
  "mode": "add",
  "property": "weapon-traits",
  "value": "magical",
  "predicate": ["item:melee"]  // 可选：限定只影响近战武器
}
\`\`\`

**示例 - 修改射程（仅用于远程武器）**:
\`\`\`json
{
  "key": "AdjustStrike",
  "mode": "add",
  "property": "range-increment",
  "value": 30,
  "predicate": ["item:ranged"]  // 必须：确保只影响远程武器
}
\`\`\`

**错误示例** (不要这样做):
\`\`\`json
{
  "key": "AdjustStrike",
  "mode": "upgrade",
  "property": "damage-die",  // ❌ 错误!
  "value": "one-step"
}
\`\`\`

**正确做法 - 提升伤害骰**:
使用StrikingRune或直接修改weapon的damage属性，而不是用AdjustStrike。

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
让玩家做出选择，并将选择结果保存到flag中供其他规则引用。

**基础示例**:
\`\`\`json
{
  "key": "ChoiceSet",
  "flag": "damage-type",
  "prompt": "选择伤害类型",
  "choices": [
    {
      "value": "fire",
      "label": "火焰"
    },
    {
      "value": "cold",
      "label": "寒冷"
    }
  ]
}
\`\`\`

**引用ChoiceSet的选择结果**:

ChoiceSet通过 flag 参数设置flag名称，之后可以通过以下方式引用:

\`\`\`json
{
  "key": "DamageDice",
  "selector": "strike-damage",
  "damageType": "@item.flags.pf2e.rulesSelections.damage-type",
  "diceNumber": 1,
  "dieSize": "d6"
}
\`\`\`

**引用格式**: @item.flags.pf2e.rulesSelections.{flag名称}

**实际示例 - Bon Mot**:
\`\`\`json
[
  {
    "key": "ChoiceSet",
    "flag": "penalty",
    "prompt": "PF2E.SpecificRule.Prompt.DegreeOfSuccess",
    "choices": [
      {
        "label": "PF2E.Check.Result.Degree.Check.criticalSuccess",
        "value": -3
      },
      {
        "label": "PF2E.Check.Result.Degree.Check.success",
        "value": -2
      }
    ]
  },
  {
    "key": "FlatModifier",
    "selector": ["perception", "will"],
    "type": "status",
    "value": "@item.flags.pf2e.rulesSelections.penalty"
  }
]
\`\`\`

**嵌套flag** (复杂场景):

对于更复杂的flag结构，可以使用嵌套:
\`\`\`json
{
  "key": "ChoiceSet",
  "flag": "bosunsCommand.modifier",
  "choices": [...]
}
\`\`\`

引用: @item.flags.pf2e.rulesSelections.bosunsCommand.modifier

**重要提醒**:
- flag名称使用kebab-case (如 damage-type, wave-command-damage-type)
- 引用时完整路径: @item.flags.pf2e.rulesSelections.{flag名}
- 可以在description中引用: @Damage[2d6[@item.flags.pf2e.rulesSelections.damage-type]]

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

**重要提醒**:
- Note不是自动化效果，不要用它替代数值加值或状态应用
- 仅在需要提示说明时使用，且不要以此替代规则元素的实际效果

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

### 31. ActiveEffectLike - 直接修改角色数据
用于修改actor数据字段，类似Foundry的Active Effect，但更适配PF2e系统。

\`\`\`json
{
  "key": "ActiveEffectLike",
  "mode": "add",
  "path": "system.skills.acrobatics.rank",
  "value": 1
}
\`\`\`

参数：
- key: "ActiveEffectLike"
- mode: 修改模式（"add", "subtract", "override", "upgrade", "downgrade"）
- path: 目标数据路径（必须是有效的actor路径）
- value: 修改值（数值或表达式）
- priority: 可选优先级
- predicate: 可选生效条件

## 表达式和引用

### 常用引用路径

**角色数据引用**:
- @actor.level - 角色等级
- @actor.abilities.str.mod - 力量修正
- @actor.abilities.dex.mod - 敏捷修正
- @actor.abilities.classDC.value - 职业DC

**物品数据引用**:
- @item.level - 物品等级
- @item.badge.value - 物品徽章值
- @item.flags.pf2e.rulesSelections.{flag名} - ChoiceSet设置的flag值

**Flag引用格式** (重要!):

当ChoiceSet使用 flag 参数设置选择时:
\`\`\`json
{
  "key": "ChoiceSet",
  "flag": "damage-type",
  "choices": [...]
}
\`\`\`

引用该选择的正确格式:
- 在rules中: @item.flags.pf2e.rulesSelections.damage-type
- 在description中: @Damage[2d6[@item.flags.pf2e.rulesSelections.damage-type]]

**嵌套flag引用**:
- flag设置: "flag": "wave-command.damage-type"
- 引用: @item.flags.pf2e.rulesSelections.wave-command.damage-type

**算术运算**:
- @actor.level * 2
- @actor.level + 5
- max(@actor.level, 10)
- floor(@actor.level / 2)
- (@actor.level + 3) * 2

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

### 示例4：ChoiceSet选择伤害类型 + 引用
\`\`\`json
[
  {
    "key": "ChoiceSet",
    "flag": "elemental-damage",
    "prompt": "选择元素伤害类型",
    "choices": [
      {"value": "fire", "label": "火焰"},
      {"value": "cold", "label": "寒冷"},
      {"value": "electricity", "label": "闪电"},
      {"value": "acid", "label": "强酸"}
    ]
  },
  {
    "key": "DamageDice",
    "selector": "strike-damage",
    "damageType": "@item.flags.pf2e.rulesSelections.elemental-damage",
    "diceNumber": 1,
    "dieSize": "d6"
  }
]
\`\`\`

### 示例5：ChoiceSet选择成功度 + 引用 (Bon Mot模式)
\`\`\`json
[
  {
    "key": "ChoiceSet",
    "flag": "penalty",
    "prompt": "PF2E.SpecificRule.Prompt.DegreeOfSuccess",
    "choices": [
      {
        "label": "PF2E.Check.Result.Degree.Check.criticalSuccess",
        "value": -3
      },
      {
        "label": "PF2E.Check.Result.Degree.Check.success",
        "value": -2
      },
      {
        "label": "PF2E.Check.Result.Degree.Check.criticalFailure",
        "value": -2
      }
    ]
  },
  {
    "key": "FlatModifier",
    "selector": ["perception", "will"],
    "type": "status",
    "value": "@item.flags.pf2e.rulesSelections.penalty"
  }
]
\`\`\`

### 示例6：在描述中引用flag
\`\`\`json
{
  "description": {
    "value": "<p>你造成 @Damage[2d6[@item.flags.pf2e.rulesSelections.damage-type]] 伤害。</p>"
  }
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
      'ActiveEffectLike',
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

