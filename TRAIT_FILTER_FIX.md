# 特质过滤修复

## 问题概述

在使用 Roguelike 抽取系统时，添加 `requiredTraits`（必需特质）或 `excludedTraits`（排除特质）参数后，所有物品都被过滤掉，导致"物品池为空"错误。

### 错误示例

```javascript
// 设置火焰特质过滤
game.modules.get('ai-pf2e-assistant').api.roguelike.draw({
  actor: canvas.tokens.controlled[0]?.actor,
  totalDraws: 1,
  itemsPerDraw: 3,
  selectablePerDraw: 1,
  contentTypes: ['feat'],
  requiredTraits: ['fire'],  // ← 导致物品池为空
  levelRange: { min: 1, max: 5 },
});
```

### 控制台错误

```
[RoguelikeDrawService] 处理 feat tab，共 7177 条数据
[RoguelikeDrawService] buildItemPool 完成: {物品池大小: 0, ...}
Uncaught (in promise) Error: 物品池为空
```

## 根本原因

### PF2e v13-dev 的数据结构变更

PF2e v13-dev 改变了 CompendiumBrowser 的 `indexData` 数据结构，将 **traits** 从直接字段改为编码在 `options` Set 中。

#### 旧版本（v12.x 及更早）
```typescript
{
  name: "Flame Wisp",
  uuid: "Compendium.pf2e.feats-srd.Item.xxx",
  level: 1,
  traits: ["fire", "primal"],  // ← 直接字段
  rarity: "common",
  category: "general"
}
```

#### 新版本（v13-dev）
```typescript
{
  name: "Flame Wisp",
  uuid: "Compendium.pf2e.feats-srd.Item.xxx",
  level: 1,
  traits: [],  // ← 空数组！
  rarity: "common",
  options: Set([
    "trait:fire",      // ← traits 在这里！
    "trait:primal",
    "category:general",
    "level:1",
    "rarity:common"
  ])
}
```

### 问题流程

1. 用户在界面输入中文特质"火焰"
2. UI 的 `resolveTraitSlug()` 正确将其转换为英文 "fire"
3. `buildItemPool()` 读取 `entry.traits`，得到空数组 `[]`
4. `matchesFilter()` 检查 `[]` 是否包含 "fire"，结果为 false
5. **所有物品都被过滤掉**，导致物品池为空

## 修复方案

### 1. 新增特质提取函数

添加 `extractTraitsFromOptions()` 方法从 `options` Set 中提取特质：

```typescript
/**
 * 从 indexData 的 options 中提取特质列表。
 * PF2e v13-dev 将 traits 编码在 options Set 中，格式为 "trait:fire"、"trait:healing" 等。
 */
private static extractTraitsFromOptions(options: Set<string> | string[]): string[] {
  const optionsArray = Array.isArray(options) ? options : Array.from(options);
  const traits: string[] = [];
  for (const opt of optionsArray) {
    if (opt.startsWith('trait:')) {
      traits.push(opt.substring(6)); // 去掉 "trait:" 前缀
    }
  }
  return traits;
}
```

### 2. 修改物品池构建逻辑

在 `buildItemPool()` 中使用 fallback 机制获取 traits：

```typescript
// 获取 traits：直接字段 → options 提取 → 空数组
let entryTraits: string[] = entry.traits || [];
if (entryTraits.length === 0 && entry.options) {
  entryTraits = this.extractTraitsFromOptions(entry.options);
}
```

### 3. 改进特质匹配逻辑

将特质匹配改为**不区分大小写**，提高容错性：

```typescript
private static matchesFilter(...): boolean {
  // ...
  
  // 将特质数组转换为小写，用于不区分大小写的匹配
  const traitsLower = traits.map(t => t.toLowerCase());

  for (const t of requiredTraits) {
    const tLower = t.toLowerCase();
    if (!traitsLower.includes(tLower)) {
      return false;
    }
  }
  
  // ...
}
```

### 4. 增强调试日志

添加详细的调试信息，帮助诊断问题：

```typescript
// 输出配置信息
console.log('[RoguelikeDrawService] buildItemPool 配置:', {
  contentTypes,
  featCategories: featCategories ? Array.from(featCategories) : null,
  equipmentCategories: equipmentCategories ? Array.from(equipmentCategories) : null,
  levelRange: { min: levelMin, max: levelMax },
  requiredTraits,  // ← 显示必需特质
  excludedTraits,  // ← 显示排除特质
  rarityFilter,
  equipmentTypeMapSize: this.equipmentTypeMap.size
});

// 输出被特质过滤掉的物品示例
if (!filterResult && requiredTraits.length > 0 && traitFilteredCount < 5) {
  console.log(`[RoguelikeDrawService] 特质过滤示例 #${traitFilteredCount + 1}:`, {
    name: entry.name,
    entryTraits,
    requiredTraits,
    '是否匹配': requiredTraits.map(t => ({
      required: t,
      found: entryTraits.includes(t)
    }))
  });
}

// 输出最终统计
console.log('[RoguelikeDrawService] buildItemPool 完成:', {
  物品池大小: pool.length,
  总处理数量: totalProcessedCount,
  总装备数量: totalEquipmentCount,
  被装备分类过滤掉: equipmentFilteredCount,
  被特质过滤掉: traitFilteredCount  // ← 显示被特质过滤的数量
});
```

### 5. UI 组件调试增强

在所有 UI 组件的 `resolveTraitSlug()` 方法中添加日志：

```typescript
private resolveTraitSlug(input: string): string {
  const lower = input.toLowerCase();
  
  // 精确匹配 value
  for (const t of this.availableTraits) {
    if (t.value === lower) {
      console.log(`特质转换（精确value）: "${input}" → "${t.value}"`);
      return t.value;
    }
  }
  
  // 精确匹配 label
  for (const t of this.availableTraits) {
    if (t.label.toLowerCase() === lower) {
      console.log(`特质转换（精确label）: "${input}" → "${t.value}" (label: "${t.label}")`);
      return t.value;
    }
  }
  
  // 模糊匹配
  for (const t of this.availableTraits) {
    if (t.label.toLowerCase().includes(lower) || lower.includes(t.label.toLowerCase())) {
      console.log(`特质转换（模糊匹配）: "${input}" → "${t.value}" (label: "${t.label}")`);
      return t.value;
    }
  }
  
  console.warn(`⚠️ 特质转换失败，使用原始输入: "${input}"`);
  return lower;
}
```

## 兼容性

| PF2e 版本 | traits 字段 | options 中的 trait: | 本修复 |
|----------|------------|-------------------|-------|
| v12.x 及更早 | ✅ 有数据 | ❌ 不存在 | ✅ 使用直接字段 |
| v13-dev | ❌ 空数组 | ✅ 存在 | ✅ 从 options 提取 |
| 未来版本 | ？ | ？ | ✅ 多层 fallback 确保兼容 |

## 测试方法

### 1. 重新加载 Foundry VTT
按 **F5** 刷新页面。

### 2. 测试火焰特质过滤

```javascript
// 测试：仅火焰特质的专长
game.modules.get('ai-pf2e-assistant').api.roguelike.draw({
  actor: canvas.tokens.controlled[0]?.actor,
  totalDraws: 1,
  itemsPerDraw: 5,
  selectablePerDraw: 2,
  contentTypes: ['feat'],
  requiredTraits: ['fire'],  // 火焰特质
  levelRange: { min: 1, max: 10 },
});
```

### 3. 测试多特质过滤

```javascript
// 测试：同时包含火焰和攻击特质
game.modules.get('ai-pf2e-assistant').api.roguelike.draw({
  actor: canvas.tokens.controlled[0]?.actor,
  totalDraws: 1,
  itemsPerDraw: 5,
  selectablePerDraw: 2,
  contentTypes: ['feat'],
  requiredTraits: ['fire', 'attack'],
  levelRange: { min: 1, max: 10 },
});
```

### 4. 测试排除特质

```javascript
// 测试：排除火焰特质
game.modules.get('ai-pf2e-assistant').api.roguelike.draw({
  actor: canvas.tokens.controlled[0]?.actor,
  totalDraws: 1,
  itemsPerDraw: 5,
  selectablePerDraw: 2,
  contentTypes: ['feat'],
  excludedTraits: ['fire'],
  levelRange: { min: 1, max: 10 },
});
```

### 5. 检查控制台日志

打开浏览器控制台（F12），应该看到：

```
[RoguelikeDrawService] buildItemPool 配置: {
  contentTypes: ["feat"],
  featCategories: null,
  equipmentCategories: null,
  levelRange: { min: 1, max: 10 },
  requiredTraits: ["fire"],  // ← 显示必需特质
  excludedTraits: [],
  rarityFilter: [],
  equipmentTypeMapSize: 0
}

[RoguelikeDrawService] 处理 feat tab，共 7177 条数据

[RoguelikeDrawService] 特质过滤示例 #1: {
  name: "某个专长",
  entryTraits: ["fire", "evocation"],  // ← 现在应该有数据了！
  requiredTraits: ["fire"],
  是否匹配: [{ required: "fire", found: true }]
}

[RoguelikeDrawService] buildItemPool 完成: {
  物品池大小: 42,  // ← 应该大于 0
  总处理数量: 7177,
  总装备数量: 0,
  被装备分类过滤掉: 0,
  被特质过滤掉: 7135
}
```

## 修改文件

- `src/module/services/roguelike-draw-service.ts`
  - 新增 `extractTraitsFromOptions()` 方法
  - 修改 `buildItemPool()` 方法，使用 fallback 机制获取 traits
  - 修改 `matchesFilter()` 方法，使用不区分大小写的匹配
  - 添加详细的调试日志

- `src/module/ui/roguelike-macro-generator-app.ts`
  - 改进 `resolveTraitSlug()` 方法，添加调试日志
  - 改进 `loadTraitsForSelectedTypes()` 方法，添加调试日志

- `src/module/ui/merchant-config-app.ts`
  - 改进 `resolveTraitSlug()` 方法，添加调试日志

- `src/module/ui/merchant-generator-app.ts`
  - 改进 `resolveTraitSlug()` 方法，添加调试日志

- `src/module/ui/monster-draw-config-app.ts`
  - 改进 `resolveTraitSlug()` 方法，添加调试日志

## 参考资料

- PF2e v13-dev 源码：`src/module/apps/compendium-browser/tabs/feat.ts`
- PF2e v13-dev 源码：`src/module/apps/compendium-browser/tabs/equipment.ts`
- PF2e v13-dev 源码：`src/module/apps/compendium-browser/tabs/spell.ts`
- 相关修复：`PF2E_V13_COMPATIBILITY_FIX.md`（category 和 type 的类似问题）
- 相关修复：`EQUIPMENT_FILTER_FIX.md`（装备类型过滤的类似问题）

## 技术细节

### options Set 中的编码格式

PF2e v13-dev 在 `options` Set 中使用以下格式编码各种属性：

| 属性类型 | 格式 | 示例 |
|---------|------|------|
| 特质 | `trait:{value}` | `trait:fire`, `trait:healing`, `trait:mental` |
| 分类 | `category:{value}` | `category:general`, `category:skill` |
| 类型 | `type:{value}` | `type:weapon`, `type:armor` |
| 等级 | `level:{value}` | `level:1`, `level:10` |
| 稀有度 | `rarity:{value}` | `rarity:common`, `rarity:rare` |

### Fallback 策略

代码使用多层 fallback 确保兼容性：

```typescript
// 1. 尝试直接字段（旧版本）
let entryTraits: string[] = entry.traits || [];

// 2. 如果为空，从 options 提取（新版本）
if (entryTraits.length === 0 && entry.options) {
  entryTraits = this.extractTraitsFromOptions(entry.options);
}

// 3. 如果还是空，使用空数组（无特质）
```

这确保了代码在不同版本的 PF2e 系统中都能正常工作。

## 构建与部署

```bash
npm run build
```

构建成功后，文件会自动复制到 Foundry VTT 的模块目录。刷新 Foundry 页面即可使用修复后的版本。
