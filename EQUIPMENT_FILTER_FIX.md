# 装备分类过滤修复说明

## 问题描述

在使用肉鸽系统宏时，添加 `equipmentCategories` 参数后无法找到任何物品，导致"物品池为空"错误：

```javascript
game.modules.get('ai-pf2e-assistant').api.roguelike.draw({
  actor: canvas.tokens.controlled[0]?.actor,
  totalDraws: 3,
  itemsPerDraw: 3,
  selectablePerDraw: 1,
  contentTypes: ['equipment'],
  equipmentCategories: ['weapon', 'armor', 'shield'], // ← 添加此参数后搜不到任何东西
  levelRange: { min: 0, max: 20 },
});
```

**错误信息：**
```
Uncaught (in promise) Error: 物品池为空
```

## 根本原因

### PF2e 系统版本兼容性问题

PF2e CompendiumBrowser 的 `tab.indexData` 数据结构与 Foundry 原始 `pack.getIndex()` 不同：

| 数据来源 | `type` 字段 | 说明 |
|---------|------------|------|
| `pack.getIndex()` | ✅ 始终存在 | Foundry 标准字段，值为 `'weapon'`/`'armor'`/`'shield'` 等 |
| `tab.indexData` (CompendiumBrowser) | ❌ **可能不存在** | PF2e 处理后的索引，仅含 `name, img, uuid, level, traits, rarity, category, ...` |

### 问题流程

1. 代码尝试从 `entry.type` 获取装备类型
2. 在 PF2e v13-dev 等新版本中，`entry.type` 返回 `undefined`
3. `entry.type || ''` 回退为空字符串 `''`
4. `equipmentCategories.has('')` 对 `'weapon'`/`'armor'`/`'shield'` 永远返回 `false`
5. **所有装备都被过滤掉，导致物品池为空**

## 修复方案

### 1. 添加类型映射缓存

新增 `equipmentTypeMap: Map<UUID, type>` 静态字段，在首次使用 equipment tab 时自动构建：

```typescript
private static equipmentTypeMap: Map<string, string> = new Map();
```

### 2. 智能检测与回退

在 `initTabs` 中添加 `buildEquipmentTypeMap()` 方法：

- **优先检测**：先检查 `tab.indexData` 本身是否包含 `type` 字段（兼容不同 PF2e 版本）
- **回退方案**：如果不包含，则从 Foundry 原始 `pack.getIndex()` 加载所有装备的 `type` 字段并缓存

### 3. 过滤时使用 Fallback

修改 `buildItemPool` 中的装备分类过滤逻辑：

```typescript
// 修复前（会导致所有装备被过滤）
const entryType = entry.type || '';

// 修复后（使用多层 fallback）
const entryType = entry.type || this.equipmentTypeMap.get(entry.uuid) || '';
```

### 4. 调试日志

添加诊断日志，当物品池为空时输出详细信息：

- 请求的装备分类
- 被过滤掉的数量
- 类型映射表大小
- 前5个装备条目的实际结构

## 测试方法

### 1. 重新加载模块

在 Foundry VTT 中：
1. 按 F5 刷新页面
2. 或在设置中禁用并重新启用 `ai-pf2e-assistant` 模块

### 2. 运行测试宏

```javascript
// 测试1：仅武器
game.modules.get('ai-pf2e-assistant').api.roguelike.draw({
  actor: canvas.tokens.controlled[0]?.actor,
  totalDraws: 1,
  itemsPerDraw: 3,
  selectablePerDraw: 1,
  contentTypes: ['equipment'],
  equipmentCategories: ['weapon'],
  levelRange: { min: 0, max: 5 },
});

// 测试2：武器+护甲+盾牌
game.modules.get('ai-pf2e-assistant').api.roguelike.draw({
  actor: canvas.tokens.controlled[0]?.actor,
  totalDraws: 1,
  itemsPerDraw: 3,
  selectablePerDraw: 1,
  contentTypes: ['equipment'],
  equipmentCategories: ['weapon', 'armor', 'shield'],
  levelRange: { min: 0, max: 10 },
});

// 测试3：所有装备类型
game.modules.get('ai-pf2e-assistant').api.roguelike.draw({
  actor: canvas.tokens.controlled[0]?.actor,
  totalDraws: 1,
  itemsPerDraw: 5,
  selectablePerDraw: 2,
  contentTypes: ['equipment'],
  equipmentCategories: ['weapon', 'armor', 'shield', 'equipment', 'consumable'],
  levelRange: { min: 0, max: 20 },
});
```

### 3. 检查控制台日志

打开浏览器控制台（F12），查看：

**成功情况：**
```
[RoguelikeDrawService] 从 indexData 构建装备类型映射: 1234 条
```
或
```
[RoguelikeDrawService] indexData 不含 type 字段，从 pack index 构建装备类型映射...
[RoguelikeDrawService] 从 pack index 构建装备类型映射: 1234 条
```

**失败情况（会输出诊断信息）：**
```
[RoguelikeDrawService] 装备物品池为空！诊断信息: {
  请求的分类: ["weapon", "armor", "shield"],
  被过滤掉的数量: 1234,
  类型映射表大小: 0,
  提示: "如果类型映射表为空，说明 indexData 不含 type 字段且 pack index 加载失败"
}
[RoguelikeDrawService] 前5个装备条目的实际结构: [...]
```

## 兼容性

- ✅ PF2e v12.x（旧版本，indexData 可能包含 type）
- ✅ PF2e v13-dev（新版本，indexData 不含 type，使用 pack index fallback）
- ✅ 未来版本（智能检测机制确保兼容性）

## 相关 Issue

- [PF2e #14789](https://github.com/foundryvtt/pf2e/issues/14789): ChoiceSet 中 `types: "weapon"` 无法正确包含具有武器子项的物品
- [PF2e #14735](https://github.com/foundryvtt/pf2e/issues/14735): PF2e 6.0.0-beta1 中无法访问模块的物品/角色合集
- [dogstarrb/pf2e-legacy-content #7](https://github.com/dogstarrb/pf2e-legacy-content/issues/7): 武器、护甲和盾牌不在 Compendium Browser 中显示

## 修改文件

- `src/module/services/roguelike-draw-service.ts`
  - 新增 `equipmentTypeMap` 静态字段
  - 新增 `buildEquipmentTypeMap()` 方法
  - 修改 `initTabs()` 方法，添加类型映射构建
  - 修改 `buildItemPool()` 方法，使用 fallback 机制
  - 添加调试日志

## 构建与部署

```bash
npm run build
```

构建成功后，文件会自动复制到 Foundry VTT 的模块目录。


