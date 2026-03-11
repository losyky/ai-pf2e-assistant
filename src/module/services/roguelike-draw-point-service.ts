/**
 * Roguelike 抽取点数管理服务
 * 管理玩家的抽取点数，支持通用点数和特定宏点数两种类型
 * 
 * 数据结构：
 * - 通用点数：actor.flags['ai-pf2e-assistant'].roguelikeDrawPoints (number)
 * - 特定宏点数：actor.flags['ai-pf2e-assistant'].roguelikeMacroPoints (Record<macroUuid, number>)
 */

const MODULE_ID = 'ai-pf2e-assistant';

export interface RoguelikeMacroPointConfig {
  uuid: string;
  name: string;
  img: string;
}

export class RoguelikeDrawPointService {
  private static readonly GENERAL_POINT_KEY = 'roguelikeDrawPoints';
  private static readonly MACRO_POINT_KEY = 'roguelikeMacroPoints';
  private static readonly TRACKED_MACROS_KEY = 'roguelikeTrackedMacros';

  static isEnabled(): boolean {
    try {
      return (game as any).settings?.get(MODULE_ID, 'roguelikeDrawPointEnabled') === true;
    } catch {
      return false;
    }
  }

  static isGM(user?: any): boolean {
    try {
      const currentUser = user || game.user;
      return currentUser?.isGM || false;
    } catch {
      return false;
    }
  }

  // ========== 被追踪的宏管理 ==========

  static getTrackedMacros(): RoguelikeMacroPointConfig[] {
    try {
      return (game as any).settings.get(MODULE_ID, 'roguelikeTrackedMacros') || [];
    } catch {
      return [];
    }
  }

  static async setTrackedMacros(macros: RoguelikeMacroPointConfig[]): Promise<void> {
    await (game as any).settings.set(MODULE_ID, 'roguelikeTrackedMacros', macros);
  }

  static isTrackedMacro(macroUuid: string): boolean {
    const tracked = this.getTrackedMacros();
    return tracked.some(m => m.uuid === macroUuid);
  }

  // ========== 通用点数 ==========

  private static resolveActor(actor: any): any {
    const realActor = actor?._actor || actor;
    if (!realActor?.getFlag && actor?.id) {
      return (window as any).game?.actors?.get(actor.id) || null;
    }
    return realActor?.getFlag ? realActor : null;
  }

  static getGeneralPoints(actor: any): number {
    try {
      const realActor = this.resolveActor(actor);
      if (!realActor) return 0;
      const points = realActor.getFlag(MODULE_ID, this.GENERAL_POINT_KEY);
      return typeof points === 'number' ? points : 0;
    } catch {
      return 0;
    }
  }

  static async setGeneralPoints(actor: any, points: number): Promise<void> {
    const realActor = this.resolveActor(actor);
    if (!realActor) throw new Error('无法获取有效的Actor对象');
    const validPoints = Math.max(0, Math.floor(points));
    await realActor.setFlag(MODULE_ID, this.GENERAL_POINT_KEY, validPoints);
  }

  static async addGeneralPoints(actor: any, points: number): Promise<number> {
    const current = this.getGeneralPoints(actor);
    const newPoints = current + Math.max(0, Math.floor(points));
    await this.setGeneralPoints(actor, newPoints);
    return newPoints;
  }

  // ========== 特定宏点数 ==========

  static getMacroPoints(actor: any, macroUuid: string): number {
    try {
      const realActor = this.resolveActor(actor);
      if (!realActor) return 0;
      const allMacroPoints = realActor.getFlag(MODULE_ID, this.MACRO_POINT_KEY) || {};
      const safeKey = macroUuid.replace(/\./g, '_DOT_');
      const points = allMacroPoints[safeKey];
      return typeof points === 'number' ? points : 0;
    } catch {
      return 0;
    }
  }

  static async setMacroPoints(actor: any, macroUuid: string, points: number): Promise<void> {
    const realActor = this.resolveActor(actor);
    if (!realActor) throw new Error('无法获取有效的Actor对象');
    const validPoints = Math.max(0, Math.floor(points));
    const safeKey = macroUuid.replace(/\./g, '_DOT_');
    const allMacroPoints = realActor.getFlag(MODULE_ID, this.MACRO_POINT_KEY) || {};
    allMacroPoints[safeKey] = validPoints;
    await realActor.setFlag(MODULE_ID, this.MACRO_POINT_KEY, allMacroPoints);
  }

  static async addMacroPoints(actor: any, macroUuid: string, points: number): Promise<number> {
    const current = this.getMacroPoints(actor, macroUuid);
    const newPoints = current + Math.max(0, Math.floor(points));
    await this.setMacroPoints(actor, macroUuid, newPoints);
    return newPoints;
  }

  // ========== 抽取前检查与消耗 ==========

  /**
   * 检查是否可以执行抽取
   * @param actor 角色
   * @param macroUuid 触发抽取的宏UUID（如有）
   * @returns { canDraw, reason, pointType, currentPoints }
   */
  static canDraw(actor: any, macroUuid?: string): { canDraw: boolean; reason?: string; pointType?: 'general' | 'macro' | 'unlimited'; currentPoints?: number } {
    if (!this.isEnabled()) {
      return { canDraw: true, pointType: 'unlimited' };
    }

    if (this.isGM()) {
      return { canDraw: true, pointType: 'unlimited' };
    }

    if (!actor) {
      return { canDraw: false, reason: '未选择角色' };
    }

    // 如果提供了宏UUID，且该宏被追踪，检查特定宏点数
    if (macroUuid && this.isTrackedMacro(macroUuid)) {
      const macroPoints = this.getMacroPoints(actor, macroUuid);
      if (macroPoints < 1) {
        const trackedMacros = this.getTrackedMacros();
        const macroConfig = trackedMacros.find(m => m.uuid === macroUuid);
        const macroName = macroConfig?.name || macroUuid;
        return {
          canDraw: false,
          reason: `宏「${macroName}」的抽取点数不足。当前: ${macroPoints}，需要: 1`,
          pointType: 'macro',
          currentPoints: macroPoints
        };
      }
      return { canDraw: true, pointType: 'macro', currentPoints: macroPoints };
    }

    // 如果宏未被追踪，检查通用点数
    if (macroUuid && !this.isTrackedMacro(macroUuid)) {
      const generalPoints = this.getGeneralPoints(actor);
      if (generalPoints < 1) {
        return {
          canDraw: false,
          reason: `通用抽取点数不足。当前: ${generalPoints}，需要: 1`,
          pointType: 'general',
          currentPoints: generalPoints
        };
      }
      return { canDraw: true, pointType: 'general', currentPoints: generalPoints };
    }

    // 无宏UUID时使用通用点数
    const generalPoints = this.getGeneralPoints(actor);
    if (generalPoints < 1) {
      return {
        canDraw: false,
        reason: `通用抽取点数不足。当前: ${generalPoints}，需要: 1`,
        pointType: 'general',
        currentPoints: generalPoints
      };
    }
    return { canDraw: true, pointType: 'general', currentPoints: generalPoints };
  }

  /**
   * 消耗抽取点数
   */
  static async consumeDrawPoint(actor: any, macroUuid?: string): Promise<boolean> {
    if (!this.isEnabled() || this.isGM()) return true;

    try {
      if (macroUuid && this.isTrackedMacro(macroUuid)) {
        const current = this.getMacroPoints(actor, macroUuid);
        if (current < 1) return false;
        await this.setMacroPoints(actor, macroUuid, current - 1);
        return true;
      }

      const current = this.getGeneralPoints(actor);
      if (current < 1) return false;
      await this.setGeneralPoints(actor, current - 1);
      return true;
    } catch (error) {
      console.error('消耗抽取点数失败:', error);
      return false;
    }
  }

  // ========== 批量操作（GM专用） ==========

  static async distributeGeneralPoints(points: number): Promise<{ success: string[]; failed: string[] }> {
    if (!this.isGM()) throw new Error('只有GM可以发放抽取点数');

    const success: string[] = [];
    const failed: string[] = [];
    const actors = game.actors?.filter((a: any) => a.type === 'character' && a.hasPlayerOwner) || [];

    for (const actor of actors) {
      try {
        await this.addGeneralPoints(actor, points);
        success.push(actor.name);
      } catch {
        failed.push(actor.name);
      }
    }
    return { success, failed };
  }

  static async distributeMacroPoints(macroUuid: string, points: number): Promise<{ success: string[]; failed: string[] }> {
    if (!this.isGM()) throw new Error('只有GM可以发放抽取点数');

    const success: string[] = [];
    const failed: string[] = [];
    const actors = game.actors?.filter((a: any) => a.type === 'character' && a.hasPlayerOwner) || [];

    for (const actor of actors) {
      try {
        await this.addMacroPoints(actor, macroUuid, points);
        success.push(actor.name);
      } catch {
        failed.push(actor.name);
      }
    }
    return { success, failed };
  }

  static async resetAllGeneralPoints(): Promise<{ success: string[]; failed: string[] }> {
    if (!this.isGM()) throw new Error('只有GM可以重置抽取点数');

    const success: string[] = [];
    const failed: string[] = [];
    const actors = game.actors?.filter((a: any) => a.type === 'character') || [];

    for (const actor of actors) {
      try {
        await this.setGeneralPoints(actor, 0);
        success.push(actor.name);
      } catch {
        failed.push(actor.name);
      }
    }
    return { success, failed };
  }

  static async resetAllMacroPoints(macroUuid: string): Promise<{ success: string[]; failed: string[] }> {
    if (!this.isGM()) throw new Error('只有GM可以重置抽取点数');

    const success: string[] = [];
    const failed: string[] = [];
    const actors = game.actors?.filter((a: any) => a.type === 'character') || [];

    for (const actor of actors) {
      try {
        await this.setMacroPoints(actor, macroUuid, 0);
        success.push(actor.name);
      } catch {
        failed.push(actor.name);
      }
    }
    return { success, failed };
  }

  // ========== 辅助方法 ==========

  static getAllActorsWithPoints(): { id: string; name: string; img: string; generalPoints: number; macroPoints: Record<string, number> }[] {
    try {
      const actors = game.actors?.filter((a: any) => a.type === 'character') || [];
      const trackedMacros = this.getTrackedMacros();

      return actors.map((actor: any) => {
        const macroPoints: Record<string, number> = {};
        for (const m of trackedMacros) {
          macroPoints[m.uuid] = this.getMacroPoints(actor, m.uuid);
        }
        return {
          id: actor.id,
          name: actor.name,
          img: actor.img || 'icons/svg/mystery-man.svg',
          generalPoints: this.getGeneralPoints(actor),
          macroPoints
        };
      }).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }
}
