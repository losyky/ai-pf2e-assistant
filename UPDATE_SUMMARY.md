# 神龛系统更新 - 新增"无设计"档位

## 概述

为神龛系统的机制复杂度配置新增了 `none`（无设计）档位，允许跳过机制设计流程，直接基于材料描述生成专长效果。

## 快速使用

在神龛物品的GM描述中添加：

```
MECHANISM_COMPLEXITY: none
```

## 四档机制复杂度

| 档位 | 说明 | 适用场景 |
|------|------|----------|
| **none** | 无设计 - 跳过机制设计，直接生成效果 | 简单被动加值、抗性、感官增强 |
| **simple** | 简约直接 - 1-2个核心要素 | 即时触发、持续增强 |
| **moderate** | 平衡适中 - 2-3个核心要素（默认） | 资源池、状态切换 |
| **complex** | 创新互动 - 3+个核心要素 | 多层系统、动态机制 |

## 修改文件

- ✅ `src/module/services/shrine-synthesis-service.ts` - 核心逻辑
- ✅ `src/module/services/shrine-item-service.ts` - 配置解析
- ✅ `docs/SHRINE_CLASS_CONFIG_GUIDE.md` - 配置指南
- ✅ `docs/MECHANISM_COMPLEXITY_NONE_UPDATE.md` - 更新说明
- ✅ `docs/MECHANISM_COMPLEXITY_EXAMPLES.md` - 使用示例

## 重要说明

1. **仅在无神性时生效**：如果合成包含神性材料，此配置无效（神性已提供机制）
2. **向后兼容**：未配置时默认使用 `moderate`
3. **无破坏性变更**：现有配置和行为完全不受影响

## 文档

- **配置指南**：`docs/SHRINE_CLASS_CONFIG_GUIDE.md`
- **详细说明**：`docs/MECHANISM_COMPLEXITY_NONE_UPDATE.md`
- **使用示例**：`docs/MECHANISM_COMPLEXITY_EXAMPLES.md`

## 示例

### 简单被动专长
```
LEVEL: 2
CATEGORY: general
MECHANISM_COMPLEXITY: none

【合成指导】
获得火焰抗性的简单能力。
```

### 复杂战术专长
```
LEVEL: 10
CATEGORY: class
CLASS_NAME: SELF
MECHANISM_COMPLEXITY: complex

【合成指导】
多层互动的高级战术能力。
```





