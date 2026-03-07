/**
 * 异常值可视化显示系统
 *
 * 在 Token 上绘制紧凑的环形进度条，显示各伤害类型的异常累积百分比。
 * 设计目标：6 个环一行排列，足够小巧不遮挡 token。
 */

import { MODULE_ID } from '../constants';
import { DAMAGE_TYPE_LABELS, hasImmunityEffect } from './anomaly-tracker';
import type { AnomalySlotData, AnomalySlotEntry } from './anomaly-tracker';

declare const game: Game;
declare const Hooks: any;
declare const foundry: any;

const ANOMALY_RING_COLORS: Record<string, number> = {
  bludgeoning: 0x8B7355,
  slashing:    0xC0C0C0,
  piercing:    0xA0A0A0,
  fire:        0xFF4500,
  cold:        0x00BFFF,
  electricity: 0xFFD700,
  acid:        0x7FFF00,
  sonic:       0x9370DB,
  force:       0x6495ED,
  void:        0x800080,
  vitality:    0xFFFF00,
  mental:      0x4169E1,
  poison:      0x32CD32,
  bleed:       0xDC143C,
  spirit:      0x87CEEB,
  untyped:     0x9E9E9E,
};

function getSetting(key: string): any {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch {
    return undefined;
  }
}

/**
 * 从 token document 读取异常槽数据。
 * 读取顺序：token flags → actor prototypeToken.flags → actor.flags（legacy）
 */
function getAnomalySlotsFromToken(tokenDoc: any): AnomalySlotData {
  if (!tokenDoc) return {};

  const tokenData = tokenDoc.flags?.[MODULE_ID]?.anomalySlots;
  if (tokenData && Object.keys(tokenData).length > 0) return tokenData;

  const actor = tokenDoc.actor;
  if (actor) {
    const ptData = actor.prototypeToken?.flags?.[MODULE_ID]?.anomalySlots;
    if (ptData && Object.keys(ptData).length > 0) return ptData;

    const legacyData = actor.flags?.[MODULE_ID]?.anomalySlots;
    if (legacyData) return legacyData;
  }

  return {};
}

/**
 * 过滤出启用类型对应的活跃异常槽。
 */
function filterActiveSlots(
  slots: AnomalySlotData,
  enabledTypes: string[],
  defaultMax: number
): Record<string, AnomalySlotEntry> {
  const result: Record<string, AnomalySlotEntry> = {};
  for (const type of enabledTypes) {
    const slot = slots[type];
    if (slot && slot.max > 0) {
      result[type] = slot;
    }
  }
  return result;
}

const RING_SEGMENTS = 64;

/**
 * 手动绘制平滑弧线，使用高段数避免锯齿。
 */
function drawSmoothArc(
  gfx: any,
  cx: number, cy: number,
  radius: number,
  startAngle: number, endAngle: number
): void {
  const totalAngle = endAngle - startAngle;
  const segments = Math.max(32, Math.ceil(Math.abs(totalAngle) / (Math.PI * 2) * RING_SEGMENTS));
  for (let i = 0; i <= segments; i++) {
    const angle = startAngle + totalAngle * i / segments;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (i === 0) gfx.moveTo(px, py);
    else gfx.lineTo(px, py);
  }
}

/**
 * 在 PIXI.Graphics 上绘制环形进度条（抗锯齿优化，无文字）。
 */
function drawRing(
  gfx: any,
  PIXI: any,
  x: number,
  y: number,
  radius: number,
  thickness: number,
  bgColor: number,
  fgColor: number,
  percentage: number,
  immune: boolean
): void {
  const capStyle = PIXI.LINE_CAP?.ROUND ?? 2;
  const joinStyle = PIXI.LINE_JOIN?.ROUND ?? 2;

  // 背景环
  gfx.lineStyle({ width: thickness, color: bgColor, alpha: 0.2, cap: capStyle, join: joinStyle });
  drawSmoothArc(gfx, x, y, radius, 0, Math.PI * 2);

  // 前景弧
  if (percentage > 0) {
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + Math.PI * 2 * Math.min(percentage, 1);
    gfx.lineStyle({ width: thickness, color: fgColor, alpha: 0.9, cap: capStyle, join: joinStyle });
    drawSmoothArc(gfx, x, y, radius, startAngle, endAngle);
  }

  // 免疫指示：金色 X
  if (immune) {
    gfx.lineStyle({ width: 1.5, color: 0xFFD700, alpha: 0.7, cap: capStyle });
    const half = radius * 0.5;
    gfx.moveTo(x - half, y - half);
    gfx.lineTo(x + half, y + half);
    gfx.moveTo(x + half, y - half);
    gfx.lineTo(x - half, y + half);
  }
}

/**
 * 在 Token 上渲染环形异常值覆盖层。
 */
function renderAnomalyOverlay(token: any): void {
  const PIXI = (window as any).PIXI;
  if (!PIXI) return;

  if (token._anomalyOverlay) {
    token.removeChild(token._anomalyOverlay);
    token._anomalyOverlay.destroy({ children: true });
    token._anomalyOverlay = null;
  }

  let enabled = false;
  let enabledTypes: string[] = [];
  try {
    enabled = getSetting('vaultAnomalyEnabled') === true;
    enabledTypes = getSetting('vaultAnomalyTypes') || [];
  } catch { return; }

  if (!enabled || enabledTypes.length === 0) return;

  const tokenDoc = token.document;
  if (!tokenDoc) return;

  const slots = getAnomalySlotsFromToken(tokenDoc);
  const actor = tokenDoc.actor || token.actor;
  const hpMax = actor?.system?.attributes?.hp?.max || 100;
  const activeSlots = filterActiveSlots(slots, enabledTypes, hpMax);
  const entries = Object.entries(activeSlots);

  if (entries.length === 0) return;

  const container = new PIXI.Container();
  container.name = 'anomalyOverlay';
  container.eventMode = 'none';
  container.interactiveChildren = false;

  const tokenW = token.w ?? token.hitArea?.width ?? 100;
  const tokenH = token.h ?? token.hitArea?.height ?? 100;

  // 紧凑尺寸：6 个环在 100px token 内一行排列
  const scale = Math.max(0.4, Math.min(1, tokenW / 100));
  const ringRadius = Math.max(4, Math.round(7 * scale));
  const ringThickness = Math.max(2, Math.round(2.5 * scale));
  const spacing = Math.round(ringRadius * 2.6);
  const maxPerRow = Math.max(2, Math.floor((tokenW - 4) / spacing));

  const startX = ringRadius + 3;
  const startY = tokenH - ringRadius - 3;

  for (let i = 0; i < entries.length; i++) {
    const [type, slot] = entries[i];
    const col = i % maxPerRow;
    const row = Math.floor(i / maxPerRow);
    const x = startX + col * spacing;
    const y = startY - row * spacing;
    const pct = slot.max > 0 ? slot.current / slot.max : 0;
    const color = ANOMALY_RING_COLORS[type] ?? 0x9E9E9E;

    const gfx = new PIXI.Graphics();
    // 免疫状态完全由 Effect 控制，不再读取 slot.immune flag
    const isImmune = actor ? hasImmunityEffect(actor, type) : false;
    drawRing(gfx, PIXI, x, y, ringRadius, ringThickness, 0x222222, color, pct, isImmune);
    container.addChild(gfx);
  }

  token._anomalyOverlay = container;
  token.addChild(container);
}

/**
 * 注册异常值显示相关的 Hooks。
 */
export function registerAnomalyDisplay(): void {
  Hooks.on('refreshToken', (token: any) => {
    try {
      renderAnomalyOverlay(token);
    } catch (err) {
      console.error(`${MODULE_ID} | Error updating anomaly overlay:`, err);
    }
  });

  Hooks.on('drawToken', (token: any) => {
    try {
      renderAnomalyOverlay(token);
    } catch (err) {
      console.error(`${MODULE_ID} | Error drawing anomaly overlay:`, err);
    }
  });

  // actor 的 prototypeToken.flags 更新后，刷新关联的 linked token
  Hooks.on('updateActor', (actor: any, changed: any) => {
    try {
      if (foundry.utils.hasProperty(changed, 'prototypeToken')) {
        const tokens = actor.getActiveTokens?.() || [];
        for (const token of tokens) {
          renderAnomalyOverlay(token);
        }
      }
    } catch { /* ignore */ }
  });

  console.log(`${MODULE_ID} | Anomaly display hooks registered`);
}
