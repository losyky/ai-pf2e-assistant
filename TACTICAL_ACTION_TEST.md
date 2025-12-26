# 战术动作合成和存储功能测试指南

## ✅ 已修复的问题

之前显示"不可用"的原因是模块API方法没有被正确暴露。现在已经修复：

- ✅ 明确将 `openActionSynthesis` 方法暴露到模块API
- ✅ 明确将 `openActionStorage` 方法暴露到模块API
- ✅ 使用箭头函数确保 `this` 上下文正确绑定
- ✅ 重新编译并部署到Foundry VTT

## 🧪 测试步骤

### 1. 重启Foundry VTT
**重要**: 必须完全重启Foundry VTT以加载新构建的模块

### 2. 检查API是否正确暴露
在浏览器控制台（F12）中运行：

```javascript
// 检查模块和API
const module = game.modules.get('ai-pf2e-assistant');
console.log('模块已加载:', !!module);
console.log('API对象:', module?.api);
console.log('openActionSynthesis:', typeof module?.api?.openActionSynthesis);
console.log('openActionStorage:', typeof module?.api?.openActionStorage);
```

**预期结果**: 
- 模块已加载: `true`
- openActionSynthesis: `function`
- openActionStorage: `function`

### 3. 测试战术动作储存箱
1. 打开一个角色卡
2. 确保角色有战术动作（带 `tactic` 或 `tactical` 特征）
3. 打开战术手册准备界面
4. 点击顶部的 **"储存箱"** 按钮
5. 应该打开物品储存箱并自动切换到战术动作标签页

### 4. 测试战术动作合成
1. 确保在模块设置中启用了"使用神龛系统"
2. 打开战术手册准备界面
3. 点击顶部的 **"合成"** 按钮
4. 应该打开神龛合成界面
5. 拖入神龛、碎片、神性、贡品等材料
6. 点击合成按钮
7. 合成的战术动作会自动存入储存箱

## 🐛 如果仍然显示"不可用"

### 检查清单：
1. ✅ **重启Foundry VTT** - 这是最常见的原因
2. ✅ 检查模块是否启用
3. ✅ 检查是否有JavaScript错误（F12控制台）
4. ✅ 确认模块版本正确（应该有新的构建文件）
5. ✅ 清除浏览器缓存（Ctrl+F5）

### 手动测试API：
在控制台运行：

```javascript
// 使用当前选中的角色测试
const actor = canvas.tokens.controlled[0]?.actor;
if (actor) {
    const module = game.modules.get('ai-pf2e-assistant');
    
    // 测试储存箱
    if (module?.api?.openActionStorage) {
        console.log('尝试打开储存箱...');
        module.api.openActionStorage(actor);
    } else {
        console.error('openActionStorage不存在');
    }
    
    // 测试合成
    if (module?.api?.openActionSynthesis) {
        console.log('尝试打开合成界面...');
        module.api.openActionSynthesis(actor);
    } else {
        console.error('openActionSynthesis不存在');
    }
}
```

## 📋 已完成的文件

### 新增文件：
1. `src/module/services/action-storage-service.ts` - 战术动作存储服务
2. `src/module/services/action-synthesis-service.ts` - 战术动作合成服务

### 修改的文件：
1. `src/module/tactical-manual/preparation-sheet.ts` - 添加按钮和API调用
2. `static/templates/tactical-preparation-sheet.hbs` - 更新模板
3. `src/module/ui/feat-storage-sheet.ts` - 支持战术动作（后端逻辑）
4. `src/module/ui/shrine-synthesis-app.ts` - 支持 'action' 模式
5. `src/module/ai-pf2e-assistant.ts` - **明确暴露API方法**
6. `src/lang/zh-CN.json` 和 `src/lang/en.json` - 国际化

### 部署的文件：
- `C:\Users\hzq51\AppData\Local\FoundryVTT\Data\modules\ai-pf2e-assistant\action-storage-service-B77GiROM.mjs`
- `C:\Users\hzq51\AppData\Local\FoundryVTT\Data\modules\ai-pf2e-assistant\ai-pf2e-assistant-CrvfmrqZ.mjs`
- 所有其他模块文件

## 💡 使用建议

1. **神龛系统必须启用**: 在模块设置中启用"使用神龛系统"
2. **需要材料**: 合成需要神龛、碎片、神性或贡品
3. **消耗点数**: 合成会消耗神龛点数（GM免费）
4. **自动添加特征**: 合成的动作会自动添加 `tactic` 特征
5. **储存箱优先**: 合成后的战术动作会先进入储存箱，需要拖出才能使用

## 🎯 预期行为

- ✅ 点击"合成"按钮 → 打开神龛合成界面（action模式）
- ✅ 点击"储存箱"按钮 → 打开物品储存箱（战术动作页）
- ✅ 不再显示"不可用"错误
- ✅ 可以正常合成和管理战术动作

