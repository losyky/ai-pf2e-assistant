/**
 * 属性伤害异常追踪系统
 *
 * 按伤害类型累积异常值，满槽后触发效果并进入免疫。
 * 异常值存储在 prototypeToken.flags 中（linked token / 无放置 token 时），
 * 或 tokenDocument.flags 中（unlinked token 时）。
 * 免疫通过创建 Effect 物品实现。
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
const BAR_BRAWL_MODULE_ID = 'barbrawl';
const ANOMALY_BAR_PREFIX = 'anomaly-';

const ANOMALY_BAR_COLORS: Record<string, { min: string; max: string }> = {
  bludgeoning: { min: '#3d2b1a', max: '#8B7355' },
  slashing:    { min: '#3d3d3d', max: '#C0C0C0' },
  piercing:    { min: '#3d3d3d', max: '#A0A0A0' },
  fire:        { min: '#4a1a00', max: '#FF4500' },
  cold:        { min: '#001a4a', max: '#00BFFF' },
  electricity: { min: '#4a4a00', max: '#FFD700' },
  acid:        { min: '#004a00', max: '#7FFF00' },
  sonic:       { min: '#2a004a', max: '#9370DB' },
  force:       { min: '#00004a', max: '#6495ED' },
  void:        { min: '#1a001a', max: '#800080' },
  vitality:    { min: '#4a4a00', max: '#FFFF00' },
  mental:      { min: '#001a4a', max: '#4169E1' },
  poison:      { min: '#004a1a', max: '#32CD32' },
  bleed:       { min: '#4a0000', max: '#DC143C' },
  spirit:      { min: '#1a2a4a', max: '#87CEEB' },
  untyped:     { min: '#2a2a2a', max: '#9E9E9E' },
};

function getSetting(key: string): any {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch {
    return undefined;
  }
}

function isTokenDocument(doc: any): boolean {
  return doc?.documentName === 'Token' || doc?.collectionName === 'tokens';
}

function resolveTokenDocument(actorOrToken: any): any {
  if (isTokenDocument(actorOrToken)) return actorOrToken;
  if (actorOrToken?.document && isTokenDocument(actorOrToken.document)) return actorOrToken.document;
  const tokens = actorOrToken?.getActiveTokens?.();
  return tokens?.[0]?.document || null;
}

export function resolveActor(actorOrToken: any): any {
  if (isTokenDocument(actorOrToken)) return actorOrToken.actor;
  if (actorOrToken?.document && isTokenDocument(actorOrToken.document)) return actorOrToken.document.actor;
  return actorOrToken;
}

/**
 * 读取异常槽数据。
 * 优先级：unlinked token flags > prototypeToken.flags > legacy actor.flags
 */
function getAnomalySlots(actor: any): AnomalySlotData {
  if (actor?.isToken && actor?.token) {
    const tokenData = actor.token.flags?.[MODULE_ID]?.[ANOMALY_FLAG_KEY];
    if (tokenData && Object.keys(tokenData).length > 0) {
      return foundry.utils.deepClone(tokenData);
    }
  }

  const ptData = actor?.prototypeToken?.flags?.[MODULE_ID]?.[ANOMALY_FLAG_KEY];
  if (ptData && Object.keys(ptData).length > 0) {
    return foundry.utils.deepClone(ptData);
  }

  const legacyData = actor?.getFlag?.(MODULE_ID, ANOMALY_FLAG_KEY);
  if (legacyData) return foundry.utils.deepClone(legacyData);

  return {};
}

/**
 * 写入异常槽数据。
 * unlinked token → tokenDocument.setFlag
 * linked token / 无 token → actor.update prototypeToken.flags（失败时 fallback 到 actor.setFlag）
 */
async function setAnomalySlots(actor: any, data: AnomalySlotData): Promise<void> {
  if (actor?.isToken && actor?.token) {
    await actor.token.setFlag(MODULE_ID, ANOMALY_FLAG_KEY, data);
    console.log(`${MODULE_ID} | Anomaly slots saved to unlinked token flags: ${actor.name}`);
    return;
  }

  try {
    await actor.update({
      [`prototypeToken.flags.${MODULE_ID}.${ANOMALY_FLAG_KEY}`]: data
    });
    console.log(`${MODULE_ID} | Anomaly slots saved to prototypeToken.flags: ${actor.name}`);
  } catch (err) {
    console.warn(`${MODULE_ID} | prototypeToken.flags update failed, falling back to actor.setFlag:`, err);
    await actor.setFlag(MODULE_ID, ANOMALY_FLAG_KEY, data);
  }
}

/**
 * 检查 Bar Brawl 模块是否已安装并激活。
 */
function isBarBrawlActive(): boolean {
  return (game as any).modules?.get(BAR_BRAWL_MODULE_ID)?.active === true;
}

/**
 * 将异常槽数据同步到 Bar Brawl 资源条。
 * 使用 dot-notation 更新，不会覆盖用户已有的自定义资源条。
 */
async function syncBarBrawlBars(actor: any, slots: AnomalySlotData): Promise<void> {
  if (!isBarBrawlActive()) return;

  const enabledTypes: string[] = getSetting('vaultAnomalyTypes') || [];
  if (enabledTypes.length === 0) return;

  const updateData: Record<string, any> = {};
  const isUnlinked = actor?.isToken && actor?.token;
  const pathPrefix = isUnlinked ? '' : 'prototypeToken.';

  for (let i = 0; i < enabledTypes.length; i++) {
    const type = enabledTypes[i];
    const slot = slots[type];
    const barId = `${ANOMALY_BAR_PREFIX}${type}`;
    const barPath = `${pathPrefix}flags.${BAR_BRAWL_MODULE_ID}.resourceBars.${barId}`;

    if (!slot) continue;

    let existingBar: any = null;
    if (isUnlinked) {
      existingBar = actor.token.flags?.[BAR_BRAWL_MODULE_ID]?.resourceBars?.[barId];
    } else {
      existingBar = actor.prototypeToken?.flags?.[BAR_BRAWL_MODULE_ID]?.resourceBars?.[barId];
    }

    if (existingBar) {
      updateData[`${barPath}.value`] = slot.current;
      updateData[`${barPath}.max`] = slot.max;
    } else {
      const colors = ANOMALY_BAR_COLORS[type] || { min: '#333333', max: '#FF0000' };
      const label = getDamageTypeLabel(type);
      updateData[barPath] = {
        id: barId,
        order: 100 + i,
        attribute: 'custom',
        value: slot.current,
        max: slot.max,
        mincolor: colors.min,
        maxcolor: colors.max,
        position: 'top-outer',
        otherVisibility: 0,
        ownerVisibility: 30,
        gmVisibility: -1,
        hideFull: false,
        hideEmpty: false,
        hideCombat: false,
        hideNoCombat: false,
        hideHud: false,
        indentLeft: null,
        indentRight: null,
        shareHeight: true,
        style: 'user',
        label: `异常: ${label}`,
        ignoreMin: false,
        ignoreMax: false,
        invert: false,
        invertDirection: false,
        subdivisions: null,
        subdivisionsOwner: false,
        fgImage: '',
        bgImage: '',
        opacity: null
      };
    }
  }

  if (Object.keys(updateData).length === 0) return;

  try {
    if (isUnlinked) {
      await actor.token.update(updateData);
    } else {
      await actor.update(updateData);
    }
    console.log(`${MODULE_ID} | Bar Brawl bars synced for: ${actor.name}`);
  } catch (err) {
    console.warn(`${MODULE_ID} | Failed to sync Bar Brawl bars:`, err);
  }
}

/**
 * 将旧的 actor.flags 数据迁移到 prototypeToken.flags。
 */
async function migrateAnomalyStorage(actor: any): Promise<void> {
  if (actor?.isToken) return;

  const oldData = actor?.getFlag?.(MODULE_ID, ANOMALY_FLAG_KEY);
  if (!oldData || Object.keys(oldData).length === 0) return;

  const ptData = actor?.prototypeToken?.flags?.[MODULE_ID]?.[ANOMALY_FLAG_KEY];
  if (ptData && Object.keys(ptData).length > 0) return;

  try {
    await actor.update({
      [`prototypeToken.flags.${MODULE_ID}.${ANOMALY_FLAG_KEY}`]: oldData,
      [`flags.${MODULE_ID}.-=${ANOMALY_FLAG_KEY}`]: null
    });
    console.log(`${MODULE_ID} | Migrated anomaly data to prototypeToken.flags: ${actor.name}`);
  } catch (err) {
    console.error(`${MODULE_ID} | Anomaly data migration failed:`, err);
  }
}

function getSlotMax(actor: any): number {
  return actor.system?.attributes?.hp?.max || 100;
}

/**
 * 根据角色的免疫/弱点/抗力修正各伤害类型的异常累积值。
 * PF2e 计算顺序：免疫 → 弱点（增加）→ 抗力（减少）
 */
function applyActorIWR(actor: any, damageByType: Record<string, number>): Record<string, number> {
  const attrs = actor?.system?.attributes;
  if (!attrs) return damageByType;

  const immunities: any[] = Array.from(attrs.immunities || []);
  const resistances: any[] = Array.from(attrs.resistances || []);
  const weaknesses: any[] = Array.from(attrs.weaknesses || []);

  if (immunities.length === 0 && resistances.length === 0 && weaknesses.length === 0) {
    return damageByType;
  }

  const adjusted: Record<string, number> = {};

  for (const [type, rawDamage] of Object.entries(damageByType)) {
    if (rawDamage <= 0) continue;

    if (immunities.some((i: any) => i.type === type)) continue;

    let damage = rawDamage;

    const weakness = weaknesses.find((w: any) => w.type === type);
    if (weakness?.value) {
      damage += weakness.value;
    }

    const resistance = resistances.find((r: any) => r.type === type);
    if (resistance?.value) {
      damage = Math.max(0, damage - resistance.value);
    }

    if (damage > 0) {
      adjusted[type] = damage;
    }
  }

  return adjusted;
}

export function hasImmunityEffect(actor: any, damageType: string): boolean {
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

async function executeMacro(macroIdentifier: string, actor: any, damageType: string): Promise<void> {
  if (!macroIdentifier) return;

  let macro: any = null;

  if (macroIdentifier.includes('.')) {
    try {
      macro = await (globalThis as any).fromUuid(macroIdentifier);
    } catch { /* fallback to name */ }
  }

  if (!macro) {
    macro = game.macros?.find((m: any) => m.name === macroIdentifier);
  }

  if (!macro) {
    console.warn(`${MODULE_ID} | Anomaly macro not found: ${macroIdentifier}`);
    return;
  }

  try {
    const speaker = ChatMessage.getSpeaker({ actor });
    await macro.execute({ actor, token: actor.getActiveTokens()?.[0], speaker, damageType });
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to execute anomaly macro "${macroIdentifier}":`, err);
  }
}

/**
 * 防止 processAnomalyDamage 重入的锁。
 * 以 actor 唯一标识为 key，避免结算宏触发的 applyDamage 再次进入异常处理。
 */
const _processingActors = new Set<string>();

function getActorKey(actor: any): string {
  if (actor?.isToken && actor?.token?.id) return `token:${actor.token.id}`;
  return `actor:${actor?.id || 'unknown'}`;
}

/**
 * 处理伤害并累积异常值。
 * 由 applyDamage wrapper 或 chat message hook 调用。
 *
 * 执行顺序（防止循环迭代）：
 *   1. 累积异常值，标记满槽类型
 *   2. 保存异常槽数据到 flags
 *   3. 为满槽类型创建免疫 Effect（免疫完全由 Effect 控制，避免 flag 锁死）
 *   4. 最后执行结算宏（此时免疫 Effect + 重入锁保护，宏造成的伤害不会再触发异常）
 *
 * @param actor 受伤的 actor（可能是 synthetic actor）
 * @param damageByType 按伤害类型分类的伤害值
 * @param tokenDoc 可选的 token document，用于 unlinked token 场景
 */
export async function processAnomalyDamage(
  actor: any,
  damageByType: Record<string, number>,
  tokenDoc?: any
): Promise<void> {
  if (!getSetting('vaultAnomalyEnabled')) {
    console.log(`${MODULE_ID} | processAnomalyDamage: vaultAnomalyEnabled is off, skipping`);
    return;
  }

  // 重入保护：如果该 actor 正在处理异常结算，跳过
  const actorKey = getActorKey(actor);
  if (_processingActors.has(actorKey)) {
    console.log(`${MODULE_ID} | processAnomalyDamage: skipping re-entrant call for ${actor.name}`);
    return;
  }

  const enabledTypes: string[] = getSetting('vaultAnomalyTypes') || [];
  if (enabledTypes.length === 0) {
    console.log(`${MODULE_ID} | processAnomalyDamage: vaultAnomalyTypes is empty, skipping`);
    return;
  }

  const adjustedDamage = applyActorIWR(actor, damageByType);
  console.log(`${MODULE_ID} | processAnomalyDamage: processing for ${actor.name}, enabledTypes=[${enabledTypes}], raw=[${Object.entries(damageByType).map(([t,v]) => `${t}:${v}`)}], afterIWR=[${Object.entries(adjustedDamage).map(([t,v]) => `${t}:${v}`)}]`);

  if (Object.keys(adjustedDamage).length === 0) return;

  _processingActors.add(actorKey);
  try {
    const multipliers: Record<string, number> = getSetting('vaultAnomalyMultipliers') || {};
    const macros: Record<string, string> = getSetting('vaultAnomalyMacros') || {};
    const maxValue = getSlotMax(actor);

    const slots = getAnomalySlots(actor);
    let changed = false;
    const triggeredTypes: string[] = [];

    // ── 第一阶段：累积异常值，标记满槽类型 ──
    for (const [type, rawDamage] of Object.entries(adjustedDamage)) {
      if (!enabledTypes.includes(type)) continue;
      if (rawDamage <= 0) continue;

      if (!slots[type]) {
        slots[type] = { current: 0, max: maxValue };
      }

      slots[type].max = maxValue;

      // 免疫状态完全由 Effect 存在与否决定，避免 flag 锁死
      if (hasImmunityEffect(actor, type)) {
        continue;
      }

      const typeMultiplier = multipliers[type] ?? 4;
      const addedValue = Math.floor(rawDamage * typeMultiplier);
      slots[type].current += addedValue;
      changed = true;

      if (slots[type].current >= slots[type].max) {
        slots[type].current = 0;
        triggeredTypes.push(type);
      }
    }

    // ── 第二阶段：先持久化异常槽数据 ──
    if (changed) {
      await setAnomalySlots(actor, slots);
      await syncBarBrawlBars(actor, slots);
    }

    // ── 第三阶段：为满槽类型创建免疫 Effect ──
    // 免疫状态完全由此 Effect 控制，删除 Effect 即恢复累积
    for (const type of triggeredTypes) {
      await createImmunityEffect(actor, type);
    }

    // ── 第四阶段：最后执行结算宏 ──
    // 此时免疫 Effect 已生效 + 重入锁保护，
    // 宏中调用 applyDamage 造成的伤害不会再触发该类型的异常累积。
    for (const type of triggeredTypes) {
      const label = getDamageTypeLabel(type);
      if (ui?.notifications) {
        ui.notifications.info(`${actor.name} 的 ${label} 异常值已满，触发异常效果！`);
      }
      await executeMacro(macros[type] || '', actor, type);
    }
  } finally {
    _processingActors.delete(actorKey);
  }
}

/**
 * 当免疫 Effect 被删除时，刷新显示。
 * 免疫状态完全由 Effect 存在与否决定，无需修改 flags。
 * 删除 Effect 后，下次受到该类型伤害时会自动恢复累积。
 */
function onDeleteImmunityEffect(item: any): void {
  if (item.type !== 'effect') return;
  const slug = item.slug || '';
  if (!slug.startsWith(IMMUNITY_EFFECT_PREFIX)) return;

  const damageType = slug.replace(IMMUNITY_EFFECT_PREFIX, '');
  const actor = item.parent;
  if (!actor) return;

  console.log(`${MODULE_ID} | Immunity effect removed for ${actor.name}, type=${damageType}. Anomaly accumulation will resume.`);

  // 仅刷新 BarBrawl 显示（如有），无需修改 flags
  const slots = getAnomalySlots(actor);
  syncBarBrawlBars(actor, slots).catch(() => {});
}

/**
 * 尝试从 applyDamage 的上下文中解析分类型伤害。
 * Wraps ActorPF2e.prototype.applyDamage 以拦截伤害明细。
 * 异常数据写入 prototypeToken.flags（linked）或 tokenDocument.flags（unlinked）。
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
        const anomalyEnabled = getSetting('vaultAnomalyEnabled');
        const anomalyTypes: string[] = getSetting('vaultAnomalyTypes') || [];
        console.log(`${MODULE_ID} | applyDamage intercepted for ${this.name}, anomalyEnabled=${anomalyEnabled}, types=[${anomalyTypes}]`);

        if (!anomalyEnabled) return result;

        const tokenDoc = params?.token || resolveTokenDocument(this);
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

        console.log(`${MODULE_ID} | Parsed damage types:`, damageByType);

        if (Object.keys(damageByType).length > 0) {
          await processAnomalyDamage(this, damageByType, tokenDoc);
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

  Hooks.on('renderActorSheet', (app: any) => {
    try {
      const actor = app?.actor;
      if (actor && !actor.isToken) {
        migrateAnomalyStorage(actor).catch(() => {});
      }
    } catch { /* ignore */ }
  });
}

/**
 * Fallback: use preUpdateActor to detect HP changes (no per-type breakdown).
 */
function registerFallbackHooks(): void {
  console.log(`${MODULE_ID} | Anomaly tracker: using fallback preUpdateActor hook`);

  Hooks.on('preUpdateActor', (actor: any, changed: any, _options: any) => {
    try {
      if (!getSetting('vaultAnomalyEnabled')) return;

      const hpChange = foundry.utils.getProperty(changed, 'system.attributes.hp.value');
      if (hpChange === undefined) return;

      const currentHp = actor.system?.attributes?.hp?.value;
      if (currentHp === undefined) return;

      const damageTaken = currentHp - hpChange;
      if (damageTaken <= 0) return;

      const tokenDoc = resolveTokenDocument(actor);
      const damageByType: Record<string, number> = { untyped: damageTaken };
      processAnomalyDamage(actor, damageByType, tokenDoc).catch(err => {
        console.error(`${MODULE_ID} | Fallback anomaly processing error:`, err);
      });
    } catch (err) {
      console.error(`${MODULE_ID} | Fallback preUpdateActor error:`, err);
    }
  });
}
