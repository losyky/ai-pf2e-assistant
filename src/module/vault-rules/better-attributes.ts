/**
 * 更好的属性系统
 *
 * 通过注入 degreeOfSuccessAdjustments 到 actor.synthetics 来修改：
 * - 敏捷：降低武器打击的重击门槛
 * - 智力：降低法术打击的重击门槛
 * - 魅力：降低豁免的大失败几率
 *
 * 这些调整使用 PF2e 原生的成功等级调整管线，
 * 与 AdjustDegreeOfSuccess 规则元素使用完全相同的机制。
 */

import { MODULE_ID } from '../constants';

declare const game: Game & { pf2e?: { Predicate?: any; [key: string]: any } };
declare const CONFIG: any;

const DEGREE_ADJUSTMENT_INCREASE = 1;

function getSetting(key: string): any {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch {
    return undefined;
  }
}

function isVaultBetterAttributesEnabled(): boolean {
  try {
    return (
      getSetting('vaultRulesEnabled') === true &&
      getSetting('vaultBetterAttributesEnabled') === true
    );
  } catch {
    return false;
  }
}

/**
 * 计算属性加值 = Math.max(0, Math.floor(mod / 2))
 */
function calcBonus(mod: number): number {
  return Math.max(0, Math.floor(mod / 2));
}

/**
 * 向 actor.synthetics.degreeOfSuccessAdjustments 中注入自定义调整。
 * 只对 character 类型生效（玩家角色）。
 */
function injectBetterAttributeAdjustments(actor: any): void {
  if (actor.type !== 'character') return;
  if (!actor.synthetics?.degreeOfSuccessAdjustments) return;

  const abilities = actor.system?.abilities;
  if (!abilities) return;

  const dexMod = abilities.dex?.mod ?? 0;
  const intMod = abilities.int?.mod ?? 0;
  const chaMod = abilities.cha?.mod ?? 0;

  const dexBonus = calcBonus(dexMod);
  const intBonus = calcBonus(intMod);
  const chaBonus = calcBonus(chaMod);

  const adjustments = actor.synthetics.degreeOfSuccessAdjustments;

  if (getSetting('vaultBetterDexEnabled') !== false && dexBonus > 0) {
    const threshold = 10 - dexBonus;
    const selector = 'attack-roll';
    if (!adjustments[selector]) adjustments[selector] = [];
    adjustments[selector].push({
      adjustments: {
        success: {
          label: game.i18n?.localize('ai-pf2e-assistant.vaultRules.betterDexLabel') || '遗名之穹·敏捷加值',
          amount: DEGREE_ADJUSTMENT_INCREASE
        }
      },
      predicate: createPredicate([
        { and: [
          { gte: ['check:total:delta', threshold] },
          { not: 'spell-attack-roll' }
        ]}
      ])
    });
  }

  if (getSetting('vaultBetterIntEnabled') !== false && intBonus > 0) {
    const threshold = 10 - intBonus;
    const selector = 'spell-attack-roll';
    if (!adjustments[selector]) adjustments[selector] = [];
    adjustments[selector].push({
      adjustments: {
        success: {
          label: game.i18n?.localize('ai-pf2e-assistant.vaultRules.betterIntLabel') || '遗名之穹·智力加值',
          amount: DEGREE_ADJUSTMENT_INCREASE
        }
      },
      predicate: createPredicate([
        { gte: ['check:total:delta', threshold] }
      ])
    });
  }

  if (getSetting('vaultBetterChaEnabled') !== false && chaBonus > 0) {
    const negThreshold = -(10 + chaBonus);
    const selector = 'saving-throw';
    if (!adjustments[selector]) adjustments[selector] = [];
    adjustments[selector].push({
      adjustments: {
        criticalFailure: {
          label: game.i18n?.localize('ai-pf2e-assistant.vaultRules.betterChaLabel') || '遗名之穹·魅力加值',
          amount: DEGREE_ADJUSTMENT_INCREASE
        }
      },
      predicate: createPredicate([
        { gt: ['check:total:delta', negThreshold] }
      ])
    });
  }
}

/**
 * Create a Predicate instance using game.pf2e.Predicate (set during PF2e init).
 * Falls back to a minimal compatible object if unavailable.
 */
function createPredicate(statements: any[]): any {
  const PredicateClass = game.pf2e?.Predicate;
  if (PredicateClass) {
    return new PredicateClass(statements);
  }
  return {
    isValid: true,
    test(_options: Set<string> | string[]): boolean {
      return true;
    },
    toObject(): any[] {
      return [...statements];
    }
  };
}

/**
 * 注册更好的属性系统。
 * 通过 wrap prepareDerivedData 在 actor 数据准备后注入 synthetics。
 */
export function registerBetterAttributes(): void {
  try {
    const ActorClass = (CONFIG as any).Actor?.documentClass;
    if (!ActorClass?.prototype?.prepareDerivedData) {
      console.warn(`${MODULE_ID} | Cannot find Actor.prepareDerivedData, better attributes unavailable`);
      return;
    }

    const originalPrepare = ActorClass.prototype.prepareDerivedData;
    ActorClass.prototype.prepareDerivedData = function(this: any) {
      originalPrepare.call(this);

      try {
        if (isVaultBetterAttributesEnabled()) {
          injectBetterAttributeAdjustments(this);
        }
      } catch (err) {
        console.error(`${MODULE_ID} | Error injecting better attribute adjustments:`, err);
      }
    };

    console.log(`${MODULE_ID} | Better attributes: prepareDerivedData wrapper registered`);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to register better attributes:`, err);
  }
}
