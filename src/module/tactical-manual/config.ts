/**
 * 战术手册配置注册
 * Register Tactical Manual Configuration
 */

/**
 * 在 PF2e 系统配置中注册战术手册相关设置
 */
export function registerTacticalConfig(): void {
    // @ts-ignore
    Hooks.once('init', () => {
        // 扩展 PF2e 的 preparationType 配置
        // @ts-ignore
        if (CONFIG?.PF2E?.preparationType) {
            // @ts-ignore
            CONFIG.PF2E.preparationType.tactical = 'AIPF2E.TacticalManual.PreparationType';
        }

        console.log('AI PF2e Assistant | 战术手册配置已注册');
    });
}

