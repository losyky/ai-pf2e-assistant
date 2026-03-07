/**
 * 遗名之穹规则修正 - 入口模块
 *
 * 包含三个子系统：
 * 1. 属性伤害异常 (Anomaly Tracker) - 核心追踪逻辑
 * 2. 异常值显示 (Anomaly Display) - PIXI 环形进度条
 * 3. 更好的属性 (Better Attributes) - 暂停
 */

import { MODULE_ID } from '../constants';
import { registerAnomalyHooks } from './anomaly-tracker';
import { registerAnomalyDisplay } from './anomaly-display';
import { registerBetterAttributes } from './better-attributes';

declare const game: Game;

export function initVaultRules(): void {
  try {
    const enabled = game.settings.get(MODULE_ID, 'vaultRulesEnabled');
    if (!enabled) {
      console.log(`${MODULE_ID} | Vault rules system disabled`);
      return;
    }

    console.log(`${MODULE_ID} | Initializing Vault Rules system...`);

    registerAnomalyHooks();
    registerAnomalyDisplay();

    // Better Attributes temporarily disabled to prevent known bugs
    // registerBetterAttributes();

    console.log(`${MODULE_ID} | Vault Rules system initialized`);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to initialize Vault Rules:`, err);
  }
}

export { registerAnomalyHooks, registerAnomalyDisplay, registerBetterAttributes };
export { DAMAGE_TYPE_LABELS, processAnomalyDamage } from './anomaly-tracker';
export type { AnomalySlotData, AnomalySlotEntry } from './anomaly-tracker';
