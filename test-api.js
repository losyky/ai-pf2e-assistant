// 在Foundry VTT的浏览器控制台中运行此脚本来测试API

console.log('=== 测试战术动作API ===');

// 1. 检查模块是否加载
const module = game.modules.get('ai-pf2e-assistant');
console.log('模块已加载:', !!module);

// 2. 检查API是否存在
console.log('API对象:', module?.api);

// 3. 检查具体方法是否存在
console.log('openActionSynthesis存在:', typeof module?.api?.openActionSynthesis === 'function');
console.log('openActionStorage存在:', typeof module?.api?.openActionStorage === 'function');

// 4. 列出所有API方法
if (module?.api) {
    console.log('可用的API方法:');
    Object.keys(module.api).forEach(key => {
        if (typeof module.api[key] === 'function') {
            console.log(`  - ${key}`);
        }
    });
}

// 5. 如果有选中的token，尝试调用API
const actor = canvas.tokens.controlled[0]?.actor;
if (actor) {
    console.log('当前选中角色:', actor.name);
    
    // 测试打开储存箱（这个应该可以工作）
    try {
        if (module?.api?.openActionStorage) {
            console.log('尝试打开战术动作储存箱...');
            module.api.openActionStorage(actor);
        } else {
            console.error('openActionStorage方法不存在');
        }
    } catch (error) {
        console.error('调用openActionStorage失败:', error);
    }
} else {
    console.log('请先选中一个token来测试API');
}

console.log('=== 测试完成 ===');

