/**
 * 神龛点数管理服务
 * 管理玩家的神龛合成点数，限制使用次数
 */
export class ShrinePointService {
  private static readonly POINT_FLAG_KEY = 'ai-pf2e-assistant.shrinePoints';
  private static readonly DEFAULT_POINTS = 0;
  private static readonly SYNTHESIS_COST = 1; // 每次合成消耗1点

  /**
   * 获取角色的神龛点数
   */
  static getActorPoints(actor: any): number {
    try {
      // 如果传入的是actorData对象，尝试获取真正的Actor对象
      const realActor = actor?._actor || actor;
      
      // 如果仍然没有getFlag方法，尝试从game.actors中获取
      if (!realActor?.getFlag && actor?.id) {
        const gameActor = (window as any).game?.actors?.get(actor.id);
        if (gameActor?.getFlag) {
          const points = gameActor.getFlag('ai-pf2e-assistant', 'shrinePoints');
          return typeof points === 'number' ? points : this.DEFAULT_POINTS;
        }
      }
      
      if (realActor?.getFlag) {
        const points = realActor.getFlag('ai-pf2e-assistant', 'shrinePoints');
        return typeof points === 'number' ? points : this.DEFAULT_POINTS;
      }
      
      console.warn('无法获取Actor对象或Actor对象缺少getFlag方法');
      return this.DEFAULT_POINTS;
    } catch (error) {
      console.warn('获取神龛点数失败:', error);
      return this.DEFAULT_POINTS;
    }
  }

  /**
   * 设置角色的神龛点数
   */
  static async setActorPoints(actor: any, points: number): Promise<void> {
    try {
      // 如果传入的是actorData对象，尝试获取真正的Actor对象
      const realActor = actor?._actor || actor;
      
      // 如果仍然没有setFlag方法，尝试从game.actors中获取
      if (!realActor?.setFlag && actor?.id) {
        const gameActor = (window as any).game?.actors?.get(actor.id);
        if (gameActor?.setFlag) {
          const validPoints = Math.max(0, Math.floor(points));
          await gameActor.setFlag('ai-pf2e-assistant', 'shrinePoints', validPoints);
          console.log(`设置角色 "${gameActor.name}" 的神龛点数为: ${validPoints}`);
          return;
        }
      }
      
      if (realActor?.setFlag) {
        const validPoints = Math.max(0, Math.floor(points));
        await realActor.setFlag('ai-pf2e-assistant', 'shrinePoints', validPoints);
        console.log(`设置角色 "${realActor.name}" 的神龛点数为: ${validPoints}`);
        return;
      }
      
      throw new Error('无法获取有效的Actor对象');
    } catch (error) {
      console.error('设置神龛点数失败:', error);
      throw new Error(`设置神龛点数失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 增加角色的神龛点数
   */
  static async addActorPoints(actor: any, points: number): Promise<number> {
    try {
      const currentPoints = this.getActorPoints(actor);
      const newPoints = currentPoints + Math.max(0, Math.floor(points));
      await this.setActorPoints(actor, newPoints);
      return newPoints;
    } catch (error) {
      console.error('增加神龛点数失败:', error);
      throw new Error(`增加神龛点数失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 消耗角色的神龛点数
   */
  static async consumeActorPoints(actor: any, cost: number = this.SYNTHESIS_COST): Promise<boolean> {
    try {
      const currentPoints = this.getActorPoints(actor);
      const requiredPoints = Math.max(0, Math.floor(cost));
      
      if (currentPoints < requiredPoints) {
        return false; // 点数不足
      }

      const newPoints = currentPoints - requiredPoints;
      await this.setActorPoints(actor, newPoints);
      console.log(`角色 "${actor.name}" 消耗 ${requiredPoints} 神龛点数，剩余: ${newPoints}`);
      return true;
    } catch (error) {
      console.error('消耗神龛点数失败:', error);
      return false;
    }
  }

  /**
   * 检查角色是否有足够的神龛点数
   */
  static canAffordSynthesis(actor: any, cost: number = this.SYNTHESIS_COST): boolean {
    const currentPoints = this.getActorPoints(actor);
    return currentPoints >= cost;
  }

  /**
   * 检查用户是否为GM
   */
  static isGM(user?: any): boolean {
    try {
      const currentUser = user || game.user;
      return currentUser?.isGM || false;
    } catch (error) {
      console.warn('检查GM权限失败:', error);
      return false;
    }
  }

  /**
   * 检查用户是否可以使用神龛合成（GM无限制，玩家需要点数）
   */
  static canUseSynthesis(actor: any, user?: any): { canUse: boolean; reason?: string; currentPoints?: number } {
    try {
      // GM用户无限制
      if (this.isGM(user)) {
        return { canUse: true };
      }

      // 检查角色是否存在
      if (!actor) {
        return { canUse: false, reason: '未选择角色' };
      }

      // 检查点数
      const currentPoints = this.getActorPoints(actor);
      const canAfford = this.canAffordSynthesis(actor);

      if (!canAfford) {
        return { 
          canUse: false, 
          reason: `神龛点数不足。当前点数: ${currentPoints}，需要: ${this.SYNTHESIS_COST}`, 
          currentPoints 
        };
      }

      return { canUse: true, currentPoints };
    } catch (error) {
      console.error('检查神龛合成权限失败:', error);
      return { canUse: false, reason: '权限检查失败' };
    }
  }

  /**
   * 获取合成消耗的点数
   */
  static getSynthesisCost(): number {
    return this.SYNTHESIS_COST;
  }

  /**
   * 批量给多个角色发放点数（GM专用）
   */
  static async distributePointsToParty(points: number, user?: any): Promise<{ success: string[]; failed: string[] }> {
    if (!this.isGM(user)) {
      throw new Error('只有GM可以发放神龛点数');
    }

    const success: string[] = [];
    const failed: string[] = [];

    try {
      // 获取所有玩家角色
      const actors = game.actors?.filter((actor: any) => 
        actor.type === 'character' && actor.hasPlayerOwner
      ) || [];

      for (const actor of actors) {
        try {
          await this.addActorPoints(actor, points);
          success.push(actor.name);
        } catch (error) {
          console.error(`给角色 "${actor.name}" 发放点数失败:`, error);
          failed.push(actor.name);
        }
      }

      console.log(`批量发放神龛点数完成: 成功 ${success.length} 个，失败 ${failed.length} 个`);
      return { success, failed };
    } catch (error) {
      console.error('批量发放神龛点数失败:', error);
      throw new Error(`批量发放失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 重置所有角色的神龛点数（GM专用）
   */
  static async resetAllPoints(user?: any): Promise<{ success: string[]; failed: string[] }> {
    if (!this.isGM(user)) {
      throw new Error('只有GM可以重置神龛点数');
    }

    const success: string[] = [];
    const failed: string[] = [];

    try {
      const actors = game.actors?.filter((actor: any) => actor.type === 'character') || [];

      for (const actor of actors) {
        try {
          await this.setActorPoints(actor, 0);
          success.push(actor.name);
        } catch (error) {
          console.error(`重置角色 "${actor.name}" 点数失败:`, error);
          failed.push(actor.name);
        }
      }

      console.log(`重置神龛点数完成: 成功 ${success.length} 个，失败 ${failed.length} 个`);
      return { success, failed };
    } catch (error) {
      console.error('重置神龛点数失败:', error);
      throw new Error(`重置失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
