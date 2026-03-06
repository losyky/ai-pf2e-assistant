/**
 * 遗名之穹规则修正 - 入口模块
 *
 * 包含两个子系统：
 * 1. 属性伤害异常 (Anomaly Tracker)
 * 2. 更好的属性 (Better Attributes)
 */

import { MODULE_ID } from '../constants';
import { registerAnomalyHooks } from './anomaly-tracker';
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
    registerBetterAttributes();

    console.log(`${MODULE_ID} | Vault Rules system initialized`);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to initialize Vault Rules:`, err);
  }
}

export { registerAnomalyHooks, registerBetterAttributes };
export { DAMAGE_TYPE_LABELS } from './anomaly-tracker';
