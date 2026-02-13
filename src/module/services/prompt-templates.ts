/**
 * 可复用的提示词模板组件
 * 用于保持所有AI服务的提示词一致性和质量
 */

/**
 * Prerequisites（先决条件）使用原则
 * 适用于所有专长和能力生成
 */
export const PREREQUISITES_PRINCIPLE = `
**关于先决条件（Prerequisites）的设计原则**：

先决条件是可选的设计元素，应该谨慎使用。考虑以下指导：

应该添加先决条件的情况：
- 专长需要特定技能熟练度作为基础（如：Expert in Stealth）
- 专长是某个专长链的进阶部分，依赖前置专长的能力
- 专长需要特定职业特性、族裔特质或其他能力作为前提
- 专长的平衡性需要通过先决条件来限制使用范围

可以省略先决条件的情况：
- 通用型能力，任何符合等级的角色都可以学习
- 效果本身已经内置了使用限制（如"持有武器时"、"对不死生物时"）
- 低等级专长，旨在为角色提供基础能力选项
- 专长主题或风格性质，不涉及复杂机制链

**默认原则**：除非有明确的设计理由，否则倾向于不设置先决条件，让玩家有更多的构建自由。
`.trim();

/**
 * 启发性设计引导（专长/能力）
 * 用于替代刻板的"必须/禁止"指令
 */
export const FEAT_DESIGN_GUIDANCE = `
**🚨 动作类型与触发的严格规则（必须遵守）**：

**触发（Trigger）仅用于以下两种情况**：
1. **Reaction（反应动作）** - 必须有触发条件
   - 示例：当敌人攻击你时、当盟友受伤时、当你被击中时
   
2. **Free Action（触发型自由动作）** - 当有明确触发条件时
   - 示例：当你成功命中时、当你进入某区域时

**以下情况绝对不使用触发**：
- ❌ Action（1-3动作）→ 这是玩家主动选择使用的，没有触发条件
- ❌ Passive（被动专长）→ 持续生效，没有触发条件

**典型错误示例**：

错误：
actionType: "action"（单动作/双动作/三动作）
description: "<p><strong>触发</strong> 你选择使用此能力时</p>"
→ 这是错误的！主动动作不需要触发！

正确：
actionType: "action"
description: "<p>你进行一次打击...</p>"
→ 直接描述效果，不需要触发词条

---

**设计思考流程**：

在创作专长前，请思考以下维度（内部思考，不需输出）：

1. **核心概念**：这个专长的核心主题是什么？它体现了什么样的战术选择或角色特质？

2. **使用场景与动作类型选择**：玩家在什么情况下会使用这个专长？
   - 被动响应敌人/盟友行动 → **reaction**（必须写触发）
   - 某个行动成功后自动触发 → **free action**（通常写触发）
   - 玩家主动选择使用 → **action**（1-3个动作，**不写触发**）
   - 持续生效不需激活 → **passive**（**不写触发**）

3. **平衡性考量**：如何让效果强度与使用成本匹配？
   - 强力效果 → 需要更多动作消耗或频次限制
   - 适度效果 → 可以是单动作或每10分钟1次
   - 基础效果 → 可以被动生效或无限制使用

4. **创意价值**：这个专长如何体现独特性？
   - 融入材料的主题和风格元素
   - 创造新颖但符合规则的机制组合
   - 让描述具有叙事吸引力和游戏实用性

**动作类型详细说明**：

- **Reaction**：当特定条件触发时响应（每回合限1次）
  - 适合：反击、防御响应、条件性保护
  - **必须使用触发词条**
  
- **Free Action**：触发时的无成本响应（效果应温和）
  - 适合：标记、小增益、快速响应
  - **通常使用触发词条**（如果有明确触发条件）
  
- **Action (1-3)**：玩家在自己回合主动使用的战术选择
  - 适合：攻击、移动、施法、技能使用
  - **不使用触发词条**（玩家主动选择）
  
- **Passive**：持续生效的能力，不需要激活
  - 适合：属性加值、感知增强、环境适应、持续buff
  - **不使用触发词条**（持续生效）

**频次与强度的平衡**：
- 无限制使用 → 效果应适度
- 每10分钟1次 → 既实用又平衡的选择（推荐）
- 每天1次或更少 → 可以是强力效果
`.trim();

/**
 * 法术设计引导
 * 用于法术生成的启发性指导
 */
export const SPELL_DESIGN_GUIDANCE = `
**施法设计思考**：

在创作法术前，请思考：

1. **施法场景**：这个法术在什么情况下施放？
   - 战斗中快速响应 → 1-3个动作
   - 战斗外准备或仪式 → 1分钟到数小时
   - 被动触发反应 → reaction（较少见）

2. **环级定位**：效果强度应该匹配环级：
   - 0环(戏法)：基础效果，无限施放
   - 1-2环：基础战术选择
   - 3-4环：中等威力，开始有显著影响
   - 5-6环：强大效果，改变战局
   - 7-9环：传奇级别，极其强大
   - 10环：史诗法术，稀有且强大

3. **创意主题**：如何让这个法术独特且记忆深刻？
`.trim();

/**
 * 技术格式要求（通用）
 * 放在提示词后半部分作为参考
 */
export const TECHNICAL_REQUIREMENTS = `
---

## 技术格式参考

以下是数据格式的技术要求，请在生成时参考：

**中文标签规范**：
- 使用：<strong>需求</strong>、<strong>触发</strong>、<strong>频率</strong>、<strong>特殊</strong>
- 示例：<p><strong>需求</strong> 你持有一件武器</p>

**中文术语标准**：
- 动作：打击、协助、移动、快步、行走（直接使用中文，不要加UUID）
- 状态：隐蔽、藏匿、倒地、困乏、恶心、震慑
- 加值：环境加值、状态加值、物品加值
- 伤害：火焰、寒冷、电击、酸液、音波、钝击、挥砍、穿刺
- 距离：使用"尺"（5尺、10尺、30尺）
- 时间：轮、分钟、小时、天

**描述格式**：
- 使用<p>标签分段
- 重要规则用<strong>加粗
- 使用HTML格式，确保清晰易读

**嵌入式引用**（可选使用）：
- 区域：@Template[type:burst|distance:20]
- 伤害：@Damage[1d6[fire]] （注意：方括号内必须使用英文，如fire、cold、electricity等）
- 治疗：@Damage[1d8[healing]] （治疗使用healing作为伤害类型）
  - 示例：@Damage[(2d8+@actor.level)[healing]] - 2d8加等级的治疗
  - 示例：@Damage[(@actor.level)d6[healing]] - 等级个d6的治疗
- 检定：@Check[type:fortitude|dc:20|basic:true]
- 职业DC检定：@Check[type:fortitude|dc:resolve(@actor.abilities.classDC.value)|basic:true]
  （使用 @actor.abilities.classDC.value 引用角色的职业DC，不要使用具体职业名称）
- **内联骰子**（反制检定等）：[[/r 1d20+6 #Counteract]]{+6} - 注意括号必须正确配对
  - [[/r 骰子公式 #标签]]后接{显示文本}
  - 示例：[[/r 1d20+9 #Counteract]]{+9} 表示+9的反制检定
  - **重要**：确保所有括号正确配对，不要写成 {(1d20+6}} 这样的错误格式
- 注意：方括号[]内的所有内容必须使用英文，不要使用中文
- 注意：不要编造无效的UUID引用，不确定时使用中文描述

**等级缩放公式**（重要！大多数数值应随等级增长）：
- 临时HP：@actor.level（弱），@actor.level * 2（中），@actor.level * 3（强）
- 伤害加值：floor(@actor.level / 4)（持续），@actor.level（一次性）
- 伤害骰数：(1+floor(@actor.level/4))d6，max(1, floor(@actor.level/2))d6
- 治疗：@actor.level（小），@actor.level * 2（中），@actor.level * 3（强）
- 持续伤害：1d4（固定），max(1, floor(@actor.level / 4))d6（缩放）
- 距离：10 + floor(@actor.level / 2) * 5
- 数学函数：floor()向下取整，max()最大值，min()最小值（避免使用ceil，PF2e默认向下取整）
- 示例：@Damage[(@actor.level)d6[fire]]，@Damage[1d8+floor(@actor.level/4)[piercing]]
- 治疗示例：@Damage[(@actor.level)d6[healing]]，@Damage[(2d8+@actor.level)[healing]]

**状态UUID**（仅在需要时使用，这些是经过验证的PF2e官方状态）：
- 目盲Blinded: @UUID[Compendium.pf2e.conditionitems.Item.XgEqL1kFApUbl5Z2]
- 破损Broken: @UUID[Compendium.pf2e.conditionitems.Item.6dNUvdb1dhToNDj3]
- 笨拙Clumsy: @UUID[Compendium.pf2e.conditionitems.Item.i3OJZU2nk64Df3xm]
- 隐蔽Concealed: @UUID[Compendium.pf2e.conditionitems.Item.DmAIPqOBomZ7H95W]
- 混乱Confused: @UUID[Compendium.pf2e.conditionitems.Item.yblD8fOR1J8rDwEQ]
- 受控Controlled: @UUID[Compendium.pf2e.conditionitems.Item.9qGBRpbX9NEwtAAr]
- 诅咒缠身Cursebound: @UUID[Compendium.pf2e.conditionitems.Item.zXZjC8HLaRoLR17U]
- 目眩Dazzled: @UUID[Compendium.pf2e.conditionitems.Item.TkIyaNPgTZFBCCuh]
- 耳聋Deafened: @UUID[Compendium.pf2e.conditionitems.Item.9PR9y0bi4JPKnHPR]
- 末日Doomed: @UUID[Compendium.pf2e.conditionitems.Item.3uh1r86TzbQvosxv]
- 衰弱Drained: @UUID[Compendium.pf2e.conditionitems.Item.4D2KBtexWXa6oUMR]
- 濒死Dying: @UUID[Compendium.pf2e.conditionitems.Item.yZRUzMqrMmfLu0V1]
- 负重Encumbered: @UUID[Compendium.pf2e.conditionitems.Item.D5mg6Tc7Jzrj6ro7]
- 虚弱Enfeebled: @UUID[Compendium.pf2e.conditionitems.Item.MIRkyAjyBeXivMa7]
- 着迷Fascinated: @UUID[Compendium.pf2e.conditionitems.Item.AdPVz7rbaVSRxHFg]
- 困乏Fatigued: @UUID[Compendium.pf2e.conditionitems.Item.HL2l2VRSaQHu9lUw]
- 逃跑Fleeing: @UUID[Compendium.pf2e.conditionitems.Item.sDPxOjQ9kx2RZE8D]
- 友善Friendly: @UUID[Compendium.pf2e.conditionitems.Item.v66R7FdOf11l94im]
- 恐惧Frightened: @UUID[Compendium.pf2e.conditionitems.Item.TBSHQspnbcqxsmjL]
- 擒抱Grabbed: @UUID[Compendium.pf2e.conditionitems.Item.kWc1fhmv9LBiTuei]
- 乐于协助Helpful: @UUID[Compendium.pf2e.conditionitems.Item.v44P3WUcU1j0115l]
- 藏匿Hidden: @UUID[Compendium.pf2e.conditionitems.Item.iU0fEDdBp3rXpTMC]
- 敌对Hostile: @UUID[Compendium.pf2e.conditionitems.Item.ud7gTLwPeklzYSXG]
- 定身Immobilized: @UUID[Compendium.pf2e.conditionitems.Item.eIcWbB5o3pP6OIMe]
- 冷漠Indifferent: @UUID[Compendium.pf2e.conditionitems.Item.fuG8dgthlDWfWjIA]
- 隐形Invisible: @UUID[Compendium.pf2e.conditionitems.Item.zJxUflt9np0q4yML]
- 被观察Observed: @UUID[Compendium.pf2e.conditionitems.Item.1wQY3JYyhMYeeV2G]
- 措手不及Off-Guard: @UUID[Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg]
- 麻痹Paralyzed: @UUID[Compendium.pf2e.conditionitems.Item.6uEgoh53GbXuHpTF]
- 持续伤害Persistent-Damage: @UUID[Compendium.pf2e.conditionitems.Item.lDVqvLKA6eF3Df60]
- 石化Petrified: @UUID[Compendium.pf2e.conditionitems.Item.dTwPJuKgBQCMxixg]
- 倒地Prone: @UUID[Compendium.pf2e.conditionitems.Item.j91X7x0XSomq8d60]
- 加速Quickened: @UUID[Compendium.pf2e.conditionitems.Item.nlCjDvLMf2EkV2dl]
- 束缚Restrained: @UUID[Compendium.pf2e.conditionitems.Item.VcDeM8A5oI6VqhbM]
- 恶心Sickened: @UUID[Compendium.pf2e.conditionitems.Item.fesd1n5eVhpCSS18]
- 减速Slowed: @UUID[Compendium.pf2e.conditionitems.Item.xYTAsEpcJE1Ccni3]
- 震慑Stunned: @UUID[Compendium.pf2e.conditionitems.Item.dfCMdR4wnpbYNTix]
- 愚钝Stupefied: @UUID[Compendium.pf2e.conditionitems.Item.e1XGnhKNSQIm5IXg]
- 失去意识Unconscious: @UUID[Compendium.pf2e.conditionitems.Item.fBnFDH2MTzgFijKf]
- 未被察觉Undetected: @UUID[Compendium.pf2e.conditionitems.Item.VRSef5y1LmL2Hkjf]
- 不友善Unfriendly: @UUID[Compendium.pf2e.conditionitems.Item.I1ffBVISxLr2gC4u]
- 未被注意Unnoticed: @UUID[Compendium.pf2e.conditionitems.Item.9evPzg9E6muFcoSk]
- 受伤Wounded: @UUID[Compendium.pf2e.conditionitems.Item.Yl48xTdMh3aeQYL2]

**频次值格式**：
- 推荐ISO 8601格式：PT10M（10分钟）、PT1H（1小时）、P1W（1周）
- 简单格式：turn, round, day, week

**重要提醒**：
- description.value字段是核心内容，必须完整详细
- 只写游戏规则，不要包含"设计理念"等元信息
- rules数组可以简化，description才是关键
`.trim();

/**
 * 内容描述原则
 * 确保生成的描述只包含游戏规则
 */
export const DESCRIPTION_PRINCIPLE = `
**描述内容原则**：

description字段应该只包含玩家需要知道的游戏规则和效果：
- ✓ 触发条件、使用方式、效果描述
- ✓ 持续时间、作用范围、数值效果
- ✓ 限制条件、特殊说明

不要包含元信息：
- ✗ "设计理念"、"设计指导"、"设计原则"
- ✗ "本专长体现了..."、"本专长融合了..."
- ✗ 从材料中复制的设计说明

专注于清晰、准确、实用的游戏规则描述。
`.trim();

/**
 * PF2e格式标准提醒
 */
export const PF2E_FORMAT_STANDARD = `
**PF2e格式标准**：
- 使用标准的PF2e术语和表述方式
- 条件和状态使用官方标准名称
- 数值表述符合PF2e惯例（如"+1状态加值"、"1d6伤害"）
- 描述风格符合PF2e官方出版物的语调
`.trim();

/**
 * PF2e专长知识库 - 统一格式指南
 * 这是完整的专长格式填写指南，用于指导AI生成符合PF2e标准的专长内容
 */
export const FEAT_KNOWLEDGE_UNIFIED_GUIDE = `
## 1. JSON字段填写指南

### 基础字段
- **name**: 专长的名称应与官方书籍中的名称一致，首字母大写。
- **level**: 使用整数表示专长的等级。
- **category**: 根据专长的类型选择合适的类别，例如"class"、"skill"、"general"、"ancestry"等。
- **traits**: 使用数组格式列出专长的特征标签，确保与官方书籍中的标签一致。
- **rarity**: 使用字符串表示稀有度，通常为"common"、"uncommon"、"rare"。

### 动作字段
- **actionType**: 使用字符串表示动作类型，如"passive"、"action"、"reaction"、"free"。
- **actions**: 对于被动专长，使用null；对于动作专长，使用整数表示动作数量（1、2、3）。
- **frequency**: 如果有频率限制，使用字符串描述频率，例如"once per day"。

### 先决条件
- **prerequisites.value**: 使用对象数组格式，每项格式为 {value: "先决条件文字"}。
  - ✅ 正确格式：[{value: "专家级运动"}, {value: "力量 14"}]
  - ❌ 错误格式：["专家级运动"]（不要用字符串数组！）
  - 无先决条件时使用空数组 []
- **注意区分**：prerequisites（选择专长的前置条件）≠ 需求（使用专长的临时条件）

### 描述字段
- **description.value**: 使用HTML格式撰写专长的详细描述，确保包含所有必要的信息和格式。

## 2. HTML格式规范

### 标签使用
- **p**: 用于普通段落。
- **h5**: 用于小标题或子标题。
- **strong**: 用于强调重要信息，如【需求】、【触发】、【特殊】、【频率】。
- **em**: 用于轻微强调或术语。
- **hr**: 用于分隔不同部分，如触发条件和效果。
- **ul/ol**: 用于列出项目或步骤。

### 特殊格式使用原则

**🎯 核心原则：只写必需的元素，不要套用固定模板！**

以下特殊格式标签应该**按需使用**，而不是每个专长都必须包含！

- **需求（Requirements）**：仅当专长有特定使用条件时添加
  
  **✅ 使用场景**（必须满足特定条件才能使用专长）：
  - 持用特定武器或装备（你持用盾牌、你持用双手武器）
  - 处于特定姿态或状态（你处于防御姿态、你已潜行）
  - 处于特定位置或环境（你与盟友相邻、你在水中）
  
  **❌ 不需要场景**（约占70%的专长）：
  - 简单被动效果（你在检定中获得加值）
  - 无条件动作（你进行一次打击）
  - 通用技能增益（你在交涉中更有说服力）
  - 环境适应（你在黑暗中视觉正常）
  
  格式：<p><strong>需求</strong> 具体要求内容</p>
  
  **⚠️ 重要**：如果没有特殊使用条件，不要写这一条！

- **触发（Trigger）**：仅用于反应动作（reaction）和触发型自由动作（free action）
  
  **✅ 必须使用触发的场景**：
  - **Reaction（反应动作）**：当敌人攻击你时、当盟友受伤时、当你被击中时
  - **Free Action（触发型）**：当你成功命中时、当你移动进入区域时
  
  **❌ 绝对不能使用触发的场景**：
  - **Action（1-3动作）**：玩家主动选择使用的动作 - **不要写触发！**
  - **Passive（被动专长）**：持续生效的能力 - **不要写触发！**
  
  格式：<p><strong>触发</strong> 触发条件描述</p>
  
  **⚠️ 严格规则**：
  - 如果actionType是"action"（或single/double/triple），**绝对不要**添加触发词条
  - 如果actionType是"passive"，**绝对不要**添加触发词条
  - 只有actionType是"reaction"时，**必须**添加触发词条
  - 只有actionType是"free"且有明确触发条件时，才添加触发词条
  
  **典型错误案例**：
  
  错误（Action不应有触发）：
  actionType: "action"
  <p><strong>触发</strong> 你选择使用此能力</p>
  
  正确（Action直接描述效果）：
  actionType: "action"  
  <p>你进行一次打击，如果命中...</p>

- **频率（Frequency）**：仅当专长有使用次数限制时添加
  
  **✅ 使用场景**：
  - 每天1次、每小时1次、每10分钟1次
  - 每轮1次、每回合1次
  
  **❌ 不需要场景**：
  - 无限制使用的能力
  - 持续生效的被动效果
  
  格式：<p><strong>频率</strong> 使用频率限制</p>
  
  **⚠️ 重要**：如果没有频率限制，不要写这一条！

- **效果（Effect）**：这是专长的核心内容，描述专长的实际规则和效果
  
  **注意**：
  - 通常**不使用粗体标签效果**，直接书写效果内容
  - 位于所有前置条件（需求、触发、频率）之后
  - 位于特殊说明之前
  - 这是**必须包含**的部分，描述专长如何工作、产生什么结果
  - 应该清晰描述数值、条件、持续时间等具体规则
  
  格式：<p>专长的实际效果描述...</p>

- **特殊（Special）**：仅当有特殊说明或额外规则时添加
  
  **✅ 使用场景**：
  - 可以多次选择此专长（每次选择不同目标）
  - 与其他专长的交互说明
  - 特殊的叠加规则或限制
  
  **❌ 不需要场景**：
  - 没有额外说明的常规专长
  
  格式：<p><strong>特殊</strong> 特殊说明内容</p>
  
  **⚠️ 重要**：如果没有特殊说明，不要写这一条！

### 描述结构建议

**可选元素的使用时机**（按出现顺序）：

1. **需求** - 仅当有特定使用条件
2. **触发** - 仅用于 reaction/free action
3. **频率** - 仅当有使用次数限制
4. **效果** - 核心内容，永远需要！
5. **特殊** - 仅当有额外说明

---

不要因为看到标准顺序（需求→触发→频率→效果→特殊）就认为每个专长都要包含所有元素。

这个顺序是指【如果需要这些元素，应该按这个顺序排列】，而不是【每个专长都必须有这些元素】。

## 3. 引用格式规范

### 伤害引用
- **@Damage[...]**: 使用格式@Damage[(伤害表达式)]，例如@Damage[(1d6+3)[fire]]，注意使用英文字符。
- **治疗按钮**: 使用 healing 作为伤害类型，例如@Damage[1d8[healing]]、@Damage[(2d8+@actor.level)[healing]]

### 检定引用
- **@Check[...]**: 使用格式@Check[type:fortitude|dc:20|basic:true]
  - type: 检定类型（fortitude/reflex/will/perception等）
  - dc: 难度等级，可以是数字或使用 resolve() 引用
  - basic: 是否为基础豁免（true/false）
- **职业DC引用**: @Check[type:will|dc:resolve(@actor.abilities.classDC.value)]
  - 使用 @actor.abilities.classDC.value 引用角色的职业DC
  - 不要使用特定职业名称（如 eldamon.dc）

### 模板引用
- **@Template[...]**: 使用格式@Template[type](范围)，例如@Template[burst](20-foot)，注意使用英文字符。

### UUID引用
- **@UUID[...]**: 使用格式@UUID[Compendium.pf2e.conditionitems.Item.XgEqL1kFApUbl5Z2]
- 注意：方括号内的路径必须使用英文，不要使用中文

### 嵌入式引用格式要求（重要！）
**所有嵌入式引用中，方括号[]内的内容必须使用英文**：
- ✅ 正确：@Damage[2d6[fire]]
- ❌ 错误：@Damage[2d6[火焰]]
- ✅ 正确：@Damage[1d8[healing]]（治疗）
- ❌ 错误：@Damage[1d8[治疗]]
- ✅ 正确：@Check[type:fortitude|dc:20]
- ❌ 错误：@Check[type:强韧|dc:20]
- ✅ 正确：@Template[type:burst|distance:20]
- ❌ 错误：@Template[type:爆发|distance:20]

**职业DC的正确引用方式**：
- ✅ 正确：@Check[type:will|dc:resolve(@actor.abilities.classDC.value)]
- ❌ 错误：@Check[type:will|dc:resolve(@actor.system.proficiencies.classDCs.wizard.dc)]
- ❌ 错误：使用特定职业名称的路径
- 说明：@actor.abilities.classDC.value 会自动获取角色的职业DC，无需指定具体职业

常见伤害类型英文：
- 火焰=fire, 寒冷=cold, 闪电=electricity, 强酸=acid
- 音波=sonic, 钝击=bludgeoning, 挥砍=slashing, 穿刺=piercing
- 力场=force, 负能量=negative, 正能量=positive, 毒素=poison
- 心灵=mental, 流血=bleed

常见检定类型英文：
- 强韧=fortitude, 反射=reflex, 意志=will
- 察觉=perception, 攻击=attack

## 4. 术语使用规范

### 使用中文术语
专长描述应该使用标准的中文术语，包括但不限于：

**动作相关**：
- 动作（action）、反应（reaction）、自由动作（free action）
- 单动作、双动作、三动作
- 回合（turn）、轮（round）

**检定相关**：
- 攻击检定、豁免检定、技能检定
- AC（护甲等级）、DC（难度等级）

**加值类型**：
- 环境加值（circumstance bonus）
- 状态加值（status bonus）
- 物品加值（item bonus）

**状态和条件**：
- 倒地、恐慌、迟缓、虚弱等
- 使用@UUID引用它们

### 动作和技能
- 使用@UUID引用标准动作和技能检定，确保准确性。

## 5. 写作风格规范

### 语言风格
- 使用正式且简洁的中文。
- 使用第二人称（你...）直接与读者交流。
- 避免过于冗长的描述，力求简洁明了。

### 句式结构
- 以陈述句为主，确保信息清晰。
- 条件句应明确条件和结果之间的关系。
- 使用标准的PF2e术语和表述方式。

### 内容组织
- 按照效果-机制-限制的顺序组织内容。
- 使用段落和分隔线（<hr />）清晰地分隔不同的内容部分。
- 先写主要效果，再写特殊情况和限制。

### 简洁性原则

**核心理念：如果一个元素的内容是【无】、【不限】、【无限制】，那就说明这个元素不应该出现！**

保持专长描述简洁，只写必要的信息。玩家更喜欢快速理解专长效果，而不是阅读大量的格式标记。

### 注意事项

⚠️ **常见错误及正确做法**：

**错误 1：滥用需求（最常见问题）**
- ❌ 为简单被动专长添加需求 → 只有复杂条件才需要
- ❌ 为无条件动作添加【需求：无】 → 没条件就不要写
- ✅ 大约70%的专长不需要需求条目
- ✅ 只有在专长说明【你必须满足X条件才能使用】时才添加需求

**错误 2：混淆需求和先决条件**
- ❌ 把prerequisites（选择专长的前置条件）误写成需求
- ✅ **需求** = 使用专长时的临时条件（如【你持用武器】、【你处于防御姿态】）
- ✅ **先决条件** = 选择专长时的永久要求（如【力量14】、【专家级杂技】）
- 📝 说明：先决条件在JSON的prerequisites.value字段中（格式为[{value:"文字"}]），不写在description.value里

**错误 3：为所有动作都写触发（极其常见且严重的错误）**
- ❌ Action（1-3动作）写【触发】 → **这是最常见的错误！**主动动作不需要触发
- ❌ Passive写【触发】 → 被动持续生效，无需触发
- ❌ 写【触发：你选择使用此能力】 → 这不是触发，这是主动使用
- ❌ 写【触发：在你的回合】 → 主动动作不需要这种描述
- ✅ 触发**仅用于** Reaction（必须有）和 Free Action（可选）
- ✅ 主动动作（Action）是玩家主动选择使用，**绝不写触发**
- ✅ 被动专长（Passive）持续生效，**绝不写触发**

**典型错误对比**：

错误示例1（Action不应有触发）：
{
  "actionType": "action",
  "actions": 2,
  "description": "<p><strong>触发</strong> 你选择使用此能力</p><p>你进行一次攻击...</p>"
}

正确示例1（Action直接描述）：
{
  "actionType": "action",
  "actions": 2,
  "description": "<p>你进行一次强力攻击...</p>"
}

错误示例2（Passive不应有触发）：
{
  "actionType": "passive",
  "description": "<p><strong>触发</strong> 当战斗开始时</p><p>你获得+2加值...</p>"
}

正确示例2（Passive直接描述）：
{
  "actionType": "passive",
  "description": "<p>你在先攻检定中获得+2环境加值。</p>"
}

正确示例3（Reaction必须有触发）：
{
  "actionType": "reaction",
  "description": "<p><strong>触发</strong> 一名敌人攻击你</p><hr /><p>你进行一次反击...</p>"
}

**错误 4：写频率却没有限制**
- ❌ 写【频率：无限制】 → 没限制就不要写
- ✅ 仅在有使用限制时写频率
- ✅ 如果专长可以无限使用，就不要写频率条目

**错误 5：写特殊却没有内容**
- ❌ 为了完整而添加空的特殊条目 → 没必要
- ✅ 仅在有特殊规则时添加

**错误 6：套用完整模板**
- ❌ 认为每个专长都应该有：需求+触发+频率+效果+特殊
- ✅ 标准顺序是指【如果需要，按这个顺序】，不是【必须全部包含】
- ✅ 大部分专长只需要1-2个元素（通常只有效果）

**错误 7：使用英文术语**
- ❌ 使用Requirements、Trigger、Frequency → 必须使用中文
- ✅ 使用中文术语（需求、触发、频率）
- ✅ 即使在Function Calling返回JSON时，HTML内容也必须全部中文

**错误 8：过度冗长**
- ❌ 写大段的背景故事或设计理念 → description只写游戏规则
- ✅ 专注于玩家需要知道的效果、数值、持续时间
- ✅ 一个简单专长可能只需要一句话

---

**📊 元素使用统计参考**（基于PF2e官方专长分析）：

| 元素 | 使用比例 | 说明 |
|------|---------|------|
| 效果 | 100% | 永远需要 |
| 需求 | ~25% | 仅当有使用条件 |
| 触发 | ~15% | 仅用于reaction/free |
| 频率 | ~30% | 仅当有限制 |
| 特殊 | ~20% | 仅当有额外说明 |

**结论**：大约70%的专长只需要写效果部分，不要过度使用格式标签！
`.trim();

/**
 * 机制描述框架指南
 * 用于指导AI在无神性材料时设计机制
 */
export const MECHANISM_DESCRIPTION_GUIDE = {
  /**
   * 核心框架（所有复杂度通用）
   */
  coreFramework: `
### 📝 机制描述框架

请使用以下三段式结构描述机制：

**【构件定义】**
定义机制的核心概念（如：层数、姿态、区域、状态等）

**【交互逻辑】**
说明如何触发、如何积累、如何消耗、如何切换

**【效果说明】**
描述最终产生的游戏效果
`.trim(),

  /**
   * Simple 复杂度的机制模式（1-2个核心要素）
   */
  simplePatterns: `
适合简约直接的机制模式（1-2个核心要素）：

**1. 即时触发（Instant Trigger）**
核心：单一条件 → 立即效果
示例："当你攻击命中时，造成额外火焰伤害"
特点：无需记录状态，简单直接

**2. 持续增强（Persistent Buff）**
核心：激活后持续生效的加值
示例："你的火焰法术伤害骰增加，效果持续1分钟"
特点：一次激活，持续受益

**3. 反应能力（Reactive Ability）**
核心：特定事件发生时的反应
示例："当敌人攻击你时，你可以进行反击（每轮一次）"
特点：被动等待触发，反击或防御

**仅供参考，具体机制需要根据实际情况调整**
`.trim(),

  /**
   * Moderate 复杂度的机制模式（2-3个核心要素）
   */
  moderatePatterns: `
适合平衡适中的机制模式（2-3个核心要素）：

**1. 简单资源池（Simple Resource Pool）**
核心：积累资源，按需消耗
示例："获得3点专注点。消耗1点获得检定加值，消耗所有点数进行强力攻击"
特点：灵活的资源分配，小额或大额消耗

**2. 双态切换（Binary Switch）**
核心：在两种状态间切换
示例："切换进攻/防御姿态（自由动作）。进攻：攻击+2/AC-1，防御：AC+2/攻击-1"
特点：简单的优劣权衡，战术灵活

**3. 条件连锁（Conditional Chain）**
核心：满足条件A后，动作B获得增强
示例："使用【火】特征动作后，本回合下一个攻击获得火焰伤害加成"
特点：鼓励特定的动作序列

**4. 阶梯强化（Stacking Enhancement）**
核心：效果随次数逐级提升
示例："每次命中同一目标，伤害提升一级（1级+1d6，2级+2d6，3级+3d6，最高3级）。切换目标重置"
特点：持续输出奖励，但有上限

**5. 充能与爆发（Charge & Burst）**
核心：通过特定方式充能，满充时触发特殊效果
示例："每次闪避攻击获得1层充能（最多3层）。达到3层时，下次攻击自动暴击并清空充能"
特点：目标明确，有爆发时刻

**6. 标记与引爆（Mark & Detonate）**
核心：对目标施加标记，后续引爆获得额外效果
示例："你的攻击为目标叠加印记。使用特定动作引爆所有印记，造成范围伤害"
特点：两阶段执行，有准备和收获

**7. 位置依赖（Position Dependent）**
核心：效果根据位置关系变化
示例："与敌人距离越近，伤害越高但防御越低。5尺内+3伤害-2AC，10尺内+2伤害-1AC，15尺内+1伤害"
特点：鼓励位置调整和走位

**8. 消耗转化（Consume & Convert）**
核心：消耗某种资源转化为另一种效果
示例："消耗法术位获得对应环级的临时生命值和攻击加值。消耗越高环的法术位，收益越大"
特点：资源转化，灵活调配

**仅供参考，具体机制需要根据实际情况调整**
`.trim(),

  /**
   * Complex 复杂度的机制模式（3+个核心要素，多层决策）
   */
  complexPatterns: `
适合创新互动的机制模式（3+个核心要素，多层决策）：

**1. 多层资源系统（Multi-Resource System）**
核心：多种资源相互转化或组合
示例："累积火、冰、雷三种元素能量，不同组合产生不同融合效果。达到3层同种元素解锁该元素的终极技能"
特点：复杂的资源管理，多条发展路线

**2. 动态状态机（Dynamic State Machine）**
核心：在多个状态间流转，每个状态有独特效果和转换条件
示例："三种战斗形态：平衡、狂暴、专注。满足特定条件自动切换，每个形态有不同能力和限制"
特点：状态之间有转换逻辑，不是简单切换

**3. 递归增强链（Recursive Chain）**
核心：效果可以叠加自身，形成滚雪球
示例："首次命中获得1层印记。有印记时命中额外获得印记数量的层数。消耗所有印记造成爆发伤害"
特点：指数级增长潜力，需要时机把握

**4. 风险对赌系统（Risk Gambling）**
核心：在多个风险等级中选择，风险越高收益越大
示例："选择承受1/2/3倍伤害，分别使下次攻击获得等比例的加成。失败则损失更多"
特点：玩家主动选择风险级别

**5. 场域控制系统（Field Control）**
核心：创建持续性区域，在区域内触发特殊规则
示例："创建元素领域。在领域内，你的元素法术触发连锁反应，每个法术会在随机位置生成次级效果"
特点：改变局部战场规则，位置策略重要

**6. 时序依赖机制（Timing Dependency）**
核心：效果依赖于特定的时间窗口或动作顺序
示例："使用3个不同类型的动作（移动、攻击、技能）后，下一个动作获得三重加成。顺序打断则重置"
特点：考验节奏把握和规划能力

**7. 镜像/回溯系统（Echo/Rewind）**
核心：记录过去的动作/状态，在未来重现或回溯
示例："记录你上一个伤害动作的效果。在本回合结束时，对另一个目标重复该效果的一部分"
特点：时间概念的机制，战术深度高

**8. 共生/寄生系统（Symbiosis/Parasitism）**
核心：效果与盟友或敌人的状态绑定
示例："标记一个盟友。你的攻击为盟友充能，盟友的攻击为你充能。任一方消耗充能时，双方都获得效果"
特点：强调配合与互动

**仅供参考，具体机制需要根据实际情况调整**
`.trim(),

  /**
   * 描述要点（所有复杂度通用）
   */
  descriptionGuidelines: `
**描述要点**：
- 使用清晰的因果关系（"当X时，Y发生"）
- 明确应用场景（"回合开始时"、"打击命中时"、"施放法术时"）
- 说明交互逻辑（如何获得、如何消耗、如何转换）
- 避免具体数值（由生成阶段决定）
- 强调机制的独特性和可玩性
- 区分"触发(Trigger)"和"应用场景"：触发仅用于反应/自由动作，其他情况使用更宽泛的场景描述

**⚠️ 效果应用场景必须规则有效**：
使用PF2e规则中明确可判定的场景，避免抽象或无效的条件。

注意："触发(Trigger)"是PF2e中的专门术语，仅用于反应动作和自由动作。这里讨论的是更广泛的"效果应用场景"。

✅ **有效的应用场景示例**：
- 动作使用时："当你进行打击时"、"当你施放法术时"、"当你使用跨步动作时"
- 反应触发："当你被敌人攻击时"、"当你受到伤害时"（这些是反应动作的触发条件）
- 回合节点："在你的回合开始时"、"在你的回合结束时"
- 状态条件："当你处于战栗状态时"、"当你倒地时"
- 成功度相关："当你的攻击大成功时"、"当你豁免失败时"
- 特定目标："对抗不死生物时"、"对抗具有邪恶特征的敌人时"
- 持续效果："在姿态持续期间"、"在法术持续时间内"

❌ **避免使用的抽象场景**：
- "当周围人群陷入愤怒时"（无法在规则上明确判定）
- "当月圆之夜"（不是常规游戏机制）
- "当你感到绝望时"（主观情感，无法量化）
- "当命运眷顾你时"（过于抽象）
`.trim(),

  /**
   * 根据复杂度获取完整的机制描述指南
   */
  getGuide(complexity: 'simple' | 'moderate' | 'complex'): string {
    let guide = this.coreFramework + '\n\n';
    guide += '### 🎮 可参考的机制模式\n\n';
    
    switch (complexity) {
      case 'simple':
        guide += this.simplePatterns;
        break;
      case 'moderate':
        guide += this.moderatePatterns;
        break;
      case 'complex':
        guide += this.complexPatterns;
        break;
    }
    
    guide += '\n\n' + this.descriptionGuidelines;
    
    return guide;
  }
};

