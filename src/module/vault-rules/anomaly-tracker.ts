/**
 * 属性伤害异常追踪系统
 *
 * 按伤害类型累积异常值，满槽后触发效果并进入免疫。
 * 异常值存储在 actor flags 中，免疫通过创建 Effect 物品实现。
 */

import { MODULE_ID } from '../constants';

declare const game: Game;
declare const ui: any;
declare const Hooks: any;
declare const ChatMessage: any;
declare const foundry: any;
declare const CONFIG: any;

/**
 * 硬编码中文标签，作为 fallback 当 CONFIG.PF2E.damageTypes 不可用时使用。
 * 运行时标签优先从 PF2e 系统动态获取（含自定义伤害类型）。
 */
export const DAMAGE_TYPE_LABELS: Record<string, string> = {
  bludgeoning: '钝击',
  slashing: '挥砍',
  piercing: '穿刺',
  acid: '强酸',
  cold: '寒冷',
  electricity: '闪电',
  fire: '火焰',
  sonic: '音波',
  force: '力场',
  void: '虚空',
  vitality: '正能量',
  mental: '心灵',
  poison: '毒素',
  bleed: '流血',
  spirit: '灵魂',
  untyped: '无类型'
};

export interface AnomalySlotEntry {
  current: number;
  max: number;
  immune: boolean;
}

export interface AnomalySlotData {
  [damageType: string]: AnomalySlotEntry;
}

function getDamageTypeLabel(slug: string): string {
  const i18nKey = CONFIG?.PF2E?.damageTypes?.[slug];
  if (i18nKey && game.i18n) {
    const localized = game.i18n.localize(i18nKey);
    if (localized !== i18nKey) return localized;
  }
  return DAMAGE_TYPE_LABELS[slug] || slug;
}

const ANOMALY_FLAG_KEY = 'anomalySlots';
const IMMUNITY_EFFECT_PREFIX = 'vault-anomaly-immunity-';

function getSetting(key: string): any {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch {
    return undefined;
  }
}

function getAnomalySlots(actor: any): AnomalySlotData {
  return actor.getFlag(MODULE_ID, ANOMALY_FLAG_KEY) || {};
}

async function setAnomalySlots(actor: any, data: AnomalySlotData): Promise<void> {
  await actor.setFlag(MODULE_ID, ANOMALY_FLAG_KEY, data);
}

function getSlotMax(actor: any): number {
  const override = getSetting('vaultAnomalyMaxOverride') || 0;
  if (override > 0) return override;
  return actor.system?.attributes?.hp?.max || 100;
}

function hasImmunityEffect(actor: any, damageType: string): boolean {
  const effectSlug = `${IMMUNITY_EFFECT_PREFIX}${damageType}`;
  return actor.items?.some((item: any) =>
    item.type === 'effect' && item.slug === effectSlug
  ) ?? false;
}

async function createImmunityEffect(actor: any, damageType: string): Promise<void> {
  const label = getDamageTypeLabel(damageType);
  const effectSlug = `${IMMUNITY_EFFECT_PREFIX}${damageType}`;

  const effectData = {
    name: `异常免疫：${label}`,
    type: 'effect',
    img: 'icons/svg/aura.svg',
    system: {
      slug: effectSlug,
      description: {
        value: `<p>该角色刚刚触发了${label}类型的异常效果，在此效果持续期间，${label}异常值不会累积。</p><p>此效果可手动取消。</p>`
      },
      duration: {
        value: 1,
        unit: 'rounds',
        sustained: false,
        expiry: 'turn-start'
      },
      level: { value: 1 },
      rules: [],
      start: {
        initiative: null,
        value: 0
      },
      tokenIcon: { show: true },
      traits: {
        rarity: 'common',
        value: []
      }
    }
  };

  try {
    await actor.createEmbeddedDocuments('Item', [effectData]);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to create immunity effect for ${damageType}:`, err);
  }
}

async function executeMacro(macroName: string, actor: any, damageType: string): Promise<void> {
  if (!macroName) return;

  const macro = game.macros?.find((m: any) => m.name === macroName);
  if (!macro) {
    console.warn(`${MODULE_ID} | Anomaly macro not found: ${macroName}`);
    return;
  }

  try {
    const speaker = ChatMessage.getSpeaker({ actor });
    await macro.execute({ actor, token: actor.getActiveTokens()?.[0], speaker, damageType });
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to execute anomaly macro "${macroName}":`, err);
  }
}

/**
 * 处理伤害并累积异常值。
 * 由 applyDamage wrapper 或 chat message hook 调用。
 */
export async function processAnomalyDamage(
  actor: any,
  damageByType: Record<string, number>
): Promise<void> {
  if (!getSetting('vaultAnomalyEnabled')) return;

  const enabledTypes: string[] = getSetting('vaultAnomalyTypes') || [];
  if (enabledTypes.length === 0) return;

  const multiplier = getSetting('vaultAnomalyMultiplier') ?? 4;
  const macros: Record<string, string> = getSetting('vaultAnomalyMacros') || {};
  const maxValue = getSlotMax(actor);

  const slots = getAnomalySlots(actor);
  let changed = false;

  for (const [type, rawDamage] of Object.entries(damageByType)) {
    if (!enabledTypes.includes(type)) continue;
    if (rawDamage <= 0) continue;

    if (!slots[type]) {
      slots[type] = { current: 0, max: maxValue, immune: false };
    }

    slots[type].max = maxValue;

    if (slots[type].immune || hasImmunityEffect(actor, type)) {
      slots[type].immune = true;
      continue;
    }

    const addedValue = Math.floor(rawDamage * multiplier);
    slots[type].current += addedValue;
    changed = true;

    if (slots[type].current >= slots[type].max) {
      slots[type].current = 0;
      slots[type].immune = true;

      await executeMacro(macros[type] || '', actor, type);
      await createImmunityEffect(actor, type);

      const label = getDamageTypeLabel(type);
      if (ui?.notifications) {
        ui.notifications.info(`${actor.name} 的 ${label} 异常值已满，触发异常效果！`);
      }
    }
  }

  if (changed) {
    await setAnomalySlots(actor, slots);
  }
}

/**
 * 当免疫 Effect 被删除时，重置对应类型的 immune 标记
 */
function onDeleteImmunityEffect(item: any): void {
  if (item.type !== 'effect') return;
  const slug = item.slug || '';
  if (!slug.startsWith(IMMUNITY_EFFECT_PREFIX)) return;

  const damageType = slug.replace(IMMUNITY_EFFECT_PREFIX, '');
  const actor = item.parent;
  if (!actor) return;

  const slots = getAnomalySlots(actor);
  if (slots[damageType]) {
    slots[damageType].immune = false;
    setAnomalySlots(actor, slots).catch(err => {
      console.error(`${MODULE_ID} | Failed to reset immunity flag:`, err);
    });
  }
}

/**
 * 尝试从 applyDamage 的上下文中解析分类型伤害。
 * Wraps ActorPF2e.prototype.applyDamage 以拦截伤害明细。
 */
export function registerAnomalyHooks(): void {
  try {
    const ActorClass = (CONFIG as any).Actor.documentClass;
    if (!ActorClass?.prototype?.applyDamage) {
      console.warn(`${MODULE_ID} | Cannot find ActorPF2e.applyDamage, anomaly tracking via applyDamage wrapper unavailable`);
      registerFallbackHooks();
      return;
    }

    const originalApplyDamage = ActorClass.prototype.applyDamage;
    ActorClass.prototype.applyDamage = async function(params: any) {
      const result = await originalApplyDamage.call(this, params);

      try {
        if (!getSetting('vaultAnomalyEnabled')) return result;

        const damage = params.damage;
        const damageByType: Record<string, number> = {};

        if (damage && typeof damage !== 'number' && damage.instances) {
          for (const instance of damage.instances) {
            const type = instance.type || 'untyped';
            const total = instance.total || 0;
            if (total > 0) {
              damageByType[type] = (damageByType[type] || 0) + total;
            }
          }
        } else if (typeof damage === 'number' && damage > 0) {
          damageByType['untyped'] = damage;
        }

        if (Object.keys(damageByType).length > 0) {
          await processAnomalyDamage(this, damageByType);
        }
      } catch (err) {
        console.error(`${MODULE_ID} | Error in anomaly damage processing:`, err);
      }

      return result;
    };

    console.log(`${MODULE_ID} | Anomaly tracker: applyDamage wrapper registered`);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to wrap applyDamage:`, err);
    registerFallbackHooks();
  }

  Hooks.on('deleteItem', (item: any) => {
    try {
      onDeleteImmunityEffect(item);
    } catch (err) {
      console.error(`${MODULE_ID} | Error handling immunity effect deletion:`, err);
    }
  });
}

/**
 * Fallback: use preUpdateActor to detect HP changes (no per-type breakdown).
 */
function registerFallbackHooks(): void {
  console.log(`${MODULE_ID} | Anomaly tracker: using fallback preUpdateActor hook`);

  Hooks.on('preUpdateActor', (actor: any, changed: any, options: any) => {
    try {
      if (!getSetting('vaultAnomalyEnabled')) return;

      const hpChange = foundry.utils.getProperty(changed, 'system.attributes.hp.value');
      if (hpChange === undefined) return;

      const currentHp = actor.system?.attributes?.hp?.value;
      if (currentHp === undefined) return;

      const damageTaken = currentHp - hpChange;
      if (damageTaken <= 0) return;

      const damageByType: Record<string, number> = { untyped: damageTaken };
      processAnomalyDamage(actor, damageByType).catch(err => {
        console.error(`${MODULE_ID} | Fallback anomaly processing error:`, err);
      });
    } catch (err) {
      console.error(`${MODULE_ID} | Fallback preUpdateActor error:`, err);
    }
  });
}
