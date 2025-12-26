/**
 * 战术动作储存箱服务
 * 管理角色的战术动作储存箱，提供动作的增删查改功能
 * 储存的战术动作不会被视为角色拥有的动作，其规则元素不会生效
 */
export class ActionStorageService {
  private static readonly STORAGE_FLAG_KEY = 'ai-pf2e-assistant.actionStorage';

  /**
   * 获取角色的储存箱中的所有战术动作
   */
  static getStoredActions(actor: any): any[] {
    try {
      // 如果传入的是actorData对象，尝试获取真正的Actor对象
      const realActor = actor?._actor || actor;
      
      // 如果仍然没有getFlag方法，尝试从game.actors中获取
      if (!realActor?.getFlag && actor?.id) {
        const gameActor = (window as any).game?.actors?.get(actor.id);
        if (gameActor?.getFlag) {
          const actions = gameActor.getFlag('ai-pf2e-assistant', 'actionStorage');
          return Array.isArray(actions) ? this._migrateActionsData(actions) : [];
        }
      }
      
      if (realActor?.getFlag) {
        const actions = realActor.getFlag('ai-pf2e-assistant', 'actionStorage');
        return Array.isArray(actions) ? this._migrateActionsData(actions) : [];
      }
      
      console.warn('无法获取Actor对象或Actor对象缺少getFlag方法');
      return [];
    } catch (error) {
      console.warn('获取储存箱战术动作失败:', error);
      return [];
    }
  }

  /**
   * 迁移战术动作数据，确保所有动作都有confirmed字段
   * @private
   */
  private static _migrateActionsData(actions: any[]): any[] {
    return actions.map(action => ({
      ...action,
      confirmed: action.confirmed === true ? true : false // 将undefined转为false
    }));
  }

  /**
   * 添加战术动作到储存箱
   */
  static async addAction(actor: any, actionData: any, confirmed: boolean = false): Promise<void> {
    try {
      // 如果传入的是actorData对象，尝试获取真正的Actor对象
      const realActor = actor?._actor || actor;
      
      // 如果仍然没有setFlag方法，尝试从game.actors中获取
      let targetActor = realActor;
      if (!realActor?.setFlag && actor?.id) {
        const gameActor = (window as any).game?.actors?.get(actor.id);
        if (gameActor?.setFlag) {
          targetActor = gameActor;
        }
      }
      
      if (!targetActor?.setFlag) {
        throw new Error('无法获取有效的Actor对象');
      }

      const currentActions = this.getStoredActions(targetActor);
      
      // 创建新战术动作数据,确保confirmed状态正确设置
      const cleanActionData = { ...actionData };
      delete cleanActionData.confirmed; // 删除可能存在的confirmed属性
      
      const newAction = {
        ...cleanActionData,
        _id: actionData._id || foundry.utils.randomID(),
        storageTimestamp: Date.now(), // 添加时间戳
        confirmed: confirmed // 明确设置确认标记
      };
      
      const updatedActions = [...currentActions, newAction];
      await targetActor.setFlag('ai-pf2e-assistant', 'actionStorage', updatedActions);
      
      console.log(`战术动作 "${newAction.name}" 已添加到储存箱 (confirmed: ${confirmed})`);
    } catch (error) {
      console.error('添加战术动作到储存箱失败:', error);
      throw new Error(`添加战术动作到储存箱失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 从储存箱删除战术动作
   */
  static async removeAction(actor: any, actionId: string): Promise<void> {
    try {
      // 如果传入的是actorData对象，尝试获取真正的Actor对象
      const realActor = actor?._actor || actor;
      
      // 如果仍然没有setFlag方法，尝试从game.actors中获取
      let targetActor = realActor;
      if (!realActor?.setFlag && actor?.id) {
        const gameActor = (window as any).game?.actors?.get(actor.id);
        if (gameActor?.setFlag) {
          targetActor = gameActor;
        }
      }
      
      if (!targetActor?.setFlag) {
        throw new Error('无法获取有效的Actor对象');
      }

      const currentActions = this.getStoredActions(targetActor);
      const updatedActions = currentActions.filter(action => action._id !== actionId);
      
      await targetActor.setFlag('ai-pf2e-assistant', 'actionStorage', updatedActions);
      
      console.log(`战术动作 ID "${actionId}" 已从储存箱移除`);
    } catch (error) {
      console.error('从储存箱删除战术动作失败:', error);
      throw new Error(`从储存箱删除战术动作失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取储存箱中指定ID的战术动作
   */
  static getStoredAction(actor: any, actionId: string): any | null {
    const actions = this.getStoredActions(actor);
    return actions.find(action => action._id === actionId) || null;
  }

  /**
   * 更新储存箱中的战术动作
   */
  static async updateAction(actor: any, actionId: string, updates: any): Promise<void> {
    try {
      // 如果传入的是actorData对象，尝试获取真正的Actor对象
      const realActor = actor?._actor || actor;
      
      // 如果仍然没有setFlag方法，尝试从game.actors中获取
      let targetActor = realActor;
      if (!realActor?.setFlag && actor?.id) {
        const gameActor = (window as any).game?.actors?.get(actor.id);
        if (gameActor?.setFlag) {
          targetActor = gameActor;
        }
      }
      
      if (!targetActor?.setFlag) {
        throw new Error('无法获取有效的Actor对象');
      }

      const currentActions = this.getStoredActions(targetActor);
      const updatedActions = currentActions.map(action => 
        action._id === actionId ? { ...action, ...updates } : action
      );
      
      await targetActor.setFlag('ai-pf2e-assistant', 'actionStorage', updatedActions);
      
      console.log(`战术动作 ID "${actionId}" 已更新`);
    } catch (error) {
      console.error('更新储存箱战术动作失败:', error);
      throw new Error(`更新储存箱战术动作失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 设置战术动作的确认状态
   */
  static async setConfirmed(actor: any, actionId: string, confirmed: boolean): Promise<void> {
    await this.updateAction(actor, actionId, { 
      'flags.ai-pf2e-assistant.confirmed': confirmed 
    });
  }

  /**
   * 清空储存箱中所有战术动作
   */
  static async clearStorage(actor: any): Promise<void> {
    try {
      // 如果传入的是actorData对象，尝试获取真正的Actor对象
      const realActor = actor?._actor || actor;
      
      // 如果仍然没有setFlag方法，尝试从game.actors中获取
      let targetActor = realActor;
      if (!realActor?.setFlag && actor?.id) {
        const gameActor = (window as any).game?.actors?.get(actor.id);
        if (gameActor?.setFlag) {
          targetActor = gameActor;
        }
      }
      
      if (!targetActor?.setFlag) {
        throw new Error('无法获取有效的Actor对象');
      }

      await targetActor.setFlag('ai-pf2e-assistant', 'actionStorage', []);
      
      console.log('储存箱已清空');
    } catch (error) {
      console.error('清空储存箱失败:', error);
      throw new Error(`清空储存箱失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 清除储存箱中所有未确认的战术动作
   */
  static async clearUnconfirmed(actor: any): Promise<void> {
    try {
      const realActor = actor?._actor || actor;
      let targetActor = realActor;
      
      if (!realActor?.setFlag && actor?.id) {
        const gameActor = (window as any).game?.actors?.get(actor.id);
        if (gameActor?.setFlag) {
          targetActor = gameActor;
        }
      }
      
      if (!targetActor?.setFlag) {
        throw new Error('无法获取有效的Actor对象');
      }

      const currentActions = this.getStoredActions(targetActor);
      const confirmedActions = currentActions.filter(action => action.confirmed === true);
      
      await targetActor.setFlag('ai-pf2e-assistant', 'actionStorage', confirmedActions);
      
      const removedCount = currentActions.length - confirmedActions.length;
      console.log(`已清除 ${removedCount} 个未确认的战术动作`);
    } catch (error) {
      console.error('清除未确认战术动作失败:', error);
      throw new Error(`清除未确认战术动作失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取储存箱中战术动作的统计信息
   */
  static getStorageStats(actor: any): { total: number; confirmed: number; unconfirmed: number } {
    const actions = this.getStoredActions(actor);
    const confirmed = actions.filter(action => action.confirmed === true).length;
    
    return {
      total: actions.length,
      confirmed: confirmed,
      unconfirmed: actions.length - confirmed
    };
  }

  /**
   * 将储存箱中的战术动作添加到角色
   */
  static async addActionToActor(actor: any, actionId: string): Promise<void> {
    try {
      const realActor = actor?._actor || actor;
      let targetActor = realActor;
      
      if (!realActor?.createEmbeddedDocuments && actor?.id) {
        const gameActor = (window as any).game?.actors?.get(actor.id);
        if (gameActor?.createEmbeddedDocuments) {
          targetActor = gameActor;
        }
      }
      
      if (!targetActor?.createEmbeddedDocuments) {
        throw new Error('无法获取有效的Actor对象');
      }

      const action = this.getStoredAction(targetActor, actionId);
      if (!action) {
        throw new Error(`找不到ID为 ${actionId} 的战术动作`);
      }

      // 创建战术动作副本到角色
      const actionData = { ...action };
      delete actionData._id; // 删除旧ID，让系统生成新ID
      delete actionData.storageTimestamp;
      delete actionData.confirmed;
      
      // 确保有 tactic 特征
      if (!actionData.system?.traits?.value) {
        actionData.system = actionData.system || {};
        actionData.system.traits = actionData.system.traits || {};
        actionData.system.traits.value = [];
      }
      if (!actionData.system.traits.value.includes('tactic')) {
        actionData.system.traits.value.push('tactic');
      }

      await targetActor.createEmbeddedDocuments('Item', [actionData]);
      
      console.log(`战术动作 "${action.name}" 已添加到角色`);
    } catch (error) {
      console.error('添加战术动作到角色失败:', error);
      throw new Error(`添加战术动作到角色失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

