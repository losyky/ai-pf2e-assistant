/**
 * 导出 Foundry VTT 全局变量的类型
 * 这些变量在 Foundry VTT 运行时环境中自动可用
 */

// @ts-ignore
export const game = globalThis.game;
// @ts-ignore
export const ui = globalThis.ui;
// @ts-ignore
export const Hooks = globalThis.Hooks;
// @ts-ignore
export const canvas = globalThis.canvas;
// @ts-ignore
export const CONFIG = globalThis.CONFIG; 