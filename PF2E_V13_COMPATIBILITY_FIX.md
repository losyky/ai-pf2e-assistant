# PF2e v13-dev 兼容性修复

## 问题概述

在 PF2e 系统升级到 v13-dev 后，肉鸽系统的**专长子分类过滤**和**装备子分类过滤**功能失效，导致"物品池为空"错误。

### 受影响的功能

1. **装备分类过滤** (`equipmentCategories`)
   - `weapon`（武器）
   - `armor`（护甲）
   - `shield`（盾牌）
   - `equipment`（装备）
   - `consumable`（消耗品）
   - 等等

2. **专长分类过滤** (`featCategories`)
   - `general`（通用专长）
   - `skill`（技能专长）
   - `class`（职业专长）
   - `ancestry`（族裔专长）
   - 等等

## 根本原因

### PF2e v13-dev 的重大变更

PF2e v13-dev 改变了 CompendiumBrowser 的 `indexData` 数据结构：

#### 旧版本（v12.x 及更早）
```typescript
// indexData 直接包含字段
{
  name: "Longsword",
  uuid: "Compendium.pf2e.equipment-srd.Item.xxx",
  type: "weapon",        // ← 直接字段
  category: "martial",   // ← 直接字段（对专长而言）
  level: 1,
  rarity: "common",
  // ...
}
```

#### 新版本（v13-dev）
```typescript
// type 和 category 被编码在 options Set 中
{
  name: "Longsword",
  uuid: "Compendium.pf2e.equipment-srd.Item.xxx",
  level: 1,
  rarity: "common",
  options: Set([
    "type:weapon",           // ← type 在这里！
    "type:category:martial",
    "type:group:sword",
    "trait:versatile-p",
    "level:1",
    "rarity:common"
  ])
}

// 专长的 category 也在 options 中
{
  name: "Toughness",
  uuid: "Compendium.pf2e.feats-srd.Item.xxx",
  level: 1,
  rarity: "common",
  options: Set([
    "category:general",      // ← category 在这里！
    "trait:general",
    "level:1",
    "rarity:common"
  ])
}
```

### 源码证据

#### Equipment Tab (equipment.ts:96)
```typescript
const options: string[] = [
  ...traits.map((t) => `trait:${t.replace(/^hb_/, "")}`),
  `price:${coinValue}`,
  `level:${itemData.system.level?.value ?? 0}`,
  `type:category:${itemData.system.category ?? "none"}`,
  `type:group:${itemData.system.group ?? "none"}`,
  `rarity:${itemData.system.traits.rarity}`,
  `type:${itemData.type}`,  // ← type 被编码在这里
  // ...
];
```

#### Feat Tab (feat.ts:95)
```typescript
const options: string[] = [
  ...traits.map((t: string) => `trait:${t.replace(/^hb_/, "")}`),
  ...skills.map((s) => `skill:${s}`),
  `category:${category}`,  // ← category 被编码在这里
  `type:${type}`,
  `level:${system.level.value}`,
  `rarity:${system.traits.rarity}`,
  // ...
];
```

## 修复方案

### 1. 新增提取函数

添加两个辅助函数从 `options` Set 中提取信息：

```typescript
/**
 * 从 indexData 的 options 中提取装备类型。
 */
private static extractTypeFromOptions(options: Set<string> | string[]): string | null {
  const optionsArray = Array.isArray(options) ? options : Array.from(options);
  for (const opt of optionsArray) {
    if (opt.startsWith('type:') && !opt.includes(':category:') && !opt.includes(':group:')) {
      const type = opt.substring(5); // 去掉 "type:" 前缀
      if (EQUIPMENT_TYPE_SET.has(type)) {
        return type;
      }
    }
  }
  return null;
}

/**
 * 从 indexData 的 options 中提取专长分类。
 */
private static extractCategoryFromOptions(options: Set<string> | string[]): string | null {
  const optionsArray = Array.isArray(options) ? options : Array.from(options);
  for (const opt of optionsArray) {
    if (opt.startsWith('category:')) {
      return opt.substring(9); // 去掉 "category:" 前缀
    }
  }
  return null;
}
```

### 2. 修改过滤逻辑

#### 装备类型过滤（多层 Fallback）

```typescript
// equipment 子分类过滤（按 item type）
if (tabName === 'equipment' && equipmentCategories !== null) {
  // 多层 fallback：直接字段 → options 提取 → 映射表 → 空字符串
  let entryType = entry.type || '';
  
  if (!entryType && entry.options) {
    entryType = this.extractTypeFromOptions(entry.options) || '';
  }
  
  if (!entryType) {
    entryType = this.equipmentTypeMap.get(entry.uuid) || '';
  }
  
  if (!equipmentCategories.has(entryType)) {
    continue;
  }
}
```

#### 专长分类过滤

```typescript
// 获取 category：直接字段 → options 提取 → 空字符串
let entryCategory: string = entry.category || '';
if (!entryCategory && entry.options) {
  entryCategory = this.extractCategoryFromOptions(entry.options) || '';
}

// feat 子分类过滤
if (tabName === 'feat' && featCategories !== null) {
  if (!featCategories.has(entryCategory)) continue;
}
```

### 3. 增强的类型映射构建

`buildEquipmentTypeMap()` 现在支持三种策略：

1. **策略1**：从 `indexData.type` 直接读取（旧版本 PF2e）
2. **策略2**：从 `indexData.options` 提取（新版本 PF2e v13-dev）✨ **新增**
3. **策略3**：从 Foundry 原始 `pack.getIndex()` 回退（最后手段）

## 兼容性

| PF2e 版本 | 专长分类 | 装备分类 | 说明 |
|----------|---------|---------|------|
| v12.x 及更早 | ✅ | ✅ | 使用直接字段 `entry.category` / `entry.type` |
| v13-dev | ✅ | ✅ | 从 `entry.options` 提取 |
| 未来版本 | ✅ | ✅ | 多层 fallback 确保兼容性 |

## 测试方法

### 1. 重新加载 Foundry VTT
按 **F5** 刷新页面。

### 2. 测试专长分类过滤

```javascript
// 测试：仅通用专长
game.modules.get('ai-pf2e-assistant').api.roguelike.draw({
  actor: canvas.tokens.controlled[0]?.actor,
  totalDraws: 1,
  itemsPerDraw: 3,
  selectablePerDraw: 1,
  contentTypes: ['feat'],
  featCategories: ['general'],
  levelRange: { min: 1, max: 5 },
});

// 测试：技能专长
game.modules.get('ai-pf2e-assistant').api.roguelike.draw({
  actor: canvas.tokens.controlled[0]?.actor,
  totalDraws: 1,
  itemsPerDraw: 3,
  selectablePerDraw: 1,
  contentTypes: ['feat'],
  featCategories: ['skill'],
  levelRange: { min: 1, max: 10 },
});
```

### 3. 测试装备分类过滤

```javascript
// 测试：仅武器
game.modules.get('ai-pf2e-assistant').api.roguelike.draw({
  actor: canvas.tokens.controlled[0]?.actor,
  totalDraws: 1,
  itemsPerDraw: 3,
  selectablePerDraw: 1,
  contentTypes: ['equipment'],
  equipmentCategories: ['weapon'],
  levelRange: { min: 0, max: 5 },
});

// 测试：武器+护甲+盾牌
game.modules.get('ai-pf2e-assistant').api.roguelike.draw({
  actor: canvas.tokens.controlled[0]?.actor,
  totalDraws: 1,
  itemsPerDraw: 3,
  selectablePerDraw: 1,
  contentTypes: ['equipment'],
  equipmentCategories: ['weapon', 'armor', 'shield'],
  levelRange: { min: 0, max: 10 },
});
```

### 4. 检查控制台日志

打开浏览器控制台（F12），应该看到：

```
[RoguelikeDrawService] 开始构建装备类型映射...
[RoguelikeDrawService] ✓ 从 indexData.options 提取装备类型映射: 1234 条

[RoguelikeDrawService] buildItemPool 配置: {
  contentTypes: ["feat"],
  equipmentCategories: null,
  levelRange: { min: 1, max: 5 },
  equipmentTypeMapSize: 1234
}

[RoguelikeDrawService] 处理 feat tab，共 XXXX 条数据

[RoguelikeDrawService] buildItemPool 完成: {
  物品池大小: XX,
  总装备数量: 0,
  被装备分类过滤掉: 0
}
```

## 调试信息

如果仍然遇到问题，代码会输出详细的调试信息：

- 前5个条目的实际结构
- `entry.type` / `entry.category` 的值
- 从 `options` 提取的值
- 最终使用的值
- 是否匹配过滤条件

## 修改文件

- `src/module/services/roguelike-draw-service.ts`
  - 新增 `extractTypeFromOptions()` 方法
  - 新增 `extractCategoryFromOptions()` 方法
  - 修改 `buildEquipmentTypeMap()` 方法，支持从 options 提取
  - 修改 `buildItemPool()` 方法，使用多层 fallback
  - 添加详细的调试日志

## 参考资料

- PF2e v13-dev 源码：`src/module/apps/compendium-browser/tabs/equipment.ts`
- PF2e v13-dev 源码：`src/module/apps/compendium-browser/tabs/feat.ts`
- Foundry VTT API: CompendiumCollection

## 构建与部署

```bash
npm run build
```

构建成功后，文件会自动复制到 Foundry VTT 的模块目录。


