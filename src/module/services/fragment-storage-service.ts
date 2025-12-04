/**
 * 碎片物品储存箱服务
 * 管理角色的神龛碎片物品储存箱，提供碎片物品的增删查改功能
 * 储存的碎片物品不会被视为角色拥有的物品，其规则元素不会生效
 */
export class FragmentStorageService {
  private static readonly STORAGE_FLAG_KEY = 'ai-pf2e-assistant.fragmentStorage';

  /**
   * 获取角色的储存箱中的所有碎片物品
   */
  static getStoredFragments(actor: any): any[] {
    try {
      // 如果传入的是actorData对象，尝试获取真正的Actor对象
      const realActor = actor?._actor || actor;
      
      // 如果仍然没有getFlag方法，尝试从game.actors中获取
      if (!realActor?.getFlag && actor?.id) {
        const gameActor = (window as any).game?.actors?.get(actor.id);
        if (gameActor?.getFlag) {
          const fragments = gameActor.getFlag('ai-pf2e-assistant', 'fragmentStorage');
          return Array.isArray(fragments) ? this._migrateFragmentsData(fragments) : [];
        }
      }
      
      if (realActor?.getFlag) {
        const fragments = realActor.getFlag('ai-pf2e-assistant', 'fragmentStorage');
        return Array.isArray(fragments) ? this._migrateFragmentsData(fragments) : [];
      }
      
      console.warn('无法获取Actor对象或Actor对象缺少getFlag方法');
      return [];
    } catch (error) {
      console.warn('获取储存箱碎片物品失败:', error);
      return [];
    }
  }

  /**
   * 迁移碎片物品数据，确保所有碎片物品都有confirmed字段
   * @private
   */
  private static _migrateFragmentsData(fragments: any[]): any[] {
    return fragments.map(fragment => ({
      ...fragment,
      confirmed: fragment.confirmed === true ? true : false // 将undefined转为false
    }));
  }

  /**
   * 添加碎片物品到储存箱
   */
  static async addFragment(actor: any, fragmentData: any, confirmed: boolean = false): Promise<void> {
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

      const currentFragments = this.getStoredFragments(targetActor);
      
      // 创建新碎片物品数据,确保confirmed状态正确设置
      const cleanFragmentData = { ...fragmentData };
      delete cleanFragmentData.confirmed; // 删除可能存在的confirmed属性
      
      const newFragment = {
        ...cleanFragmentData,
        _id: fragmentData._id || foundry.utils.randomID(),
        storageTimestamp: Date.now(), // 添加时间戳
        confirmed: confirmed // 明确设置确认标记
      };
      
      const updatedFragments = [...currentFragments, newFragment];
      await targetActor.setFlag('ai-pf2e-assistant', 'fragmentStorage', updatedFragments);
      
      console.log(`碎片物品 "${newFragment.name}" 已添加到储存箱 (confirmed: ${confirmed})`);
    } catch (error) {
      console.error('添加碎片物品到储存箱失败:', error);
      throw new Error(`添加碎片物品到储存箱失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 从储存箱删除碎片物品
   */
  static async removeFragment(actor: any, fragmentId: string): Promise<void> {
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

      const currentFragments = this.getStoredFragments(targetActor);
      const updatedFragments = currentFragments.filter(fragment => fragment._id !== fragmentId);
      
      await targetActor.setFlag('ai-pf2e-assistant', 'fragmentStorage', updatedFragments);
      
      console.log(`碎片物品 ID "${fragmentId}" 已从储存箱移除`);
    } catch (error) {
      console.error('从储存箱删除碎片物品失败:', error);
      throw new Error(`从储存箱删除碎片物品失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取储存箱中指定ID的碎片物品
   */
  static getStoredFragment(actor: any, fragmentId: string): any | null {
    const fragments = this.getStoredFragments(actor);
    return fragments.find(fragment => fragment._id === fragmentId) || null;
  }

  /**
   * 更新储存箱中的碎片物品
   */
  static async updateFragment(actor: any, fragmentId: string, updates: any): Promise<void> {
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

      const currentFragments = this.getStoredFragments(targetActor);
      const updatedFragments = currentFragments.map(fragment => 
        fragment._id === fragmentId ? { ...fragment, ...updates } : fragment
      );
      
      await targetActor.setFlag('ai-pf2e-assistant', 'fragmentStorage', updatedFragments);
      
      console.log(`碎片物品 ID "${fragmentId}" 已更新`);
    } catch (error) {
      console.error('更新储存箱碎片物品失败:', error);
      throw new Error(`更新储存箱碎片物品失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 清空储存箱
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

      await targetActor.setFlag('ai-pf2e-assistant', 'fragmentStorage', []);
      
      console.log('碎片物品储存箱已清空');
    } catch (error) {
      console.error('清空碎片物品储存箱失败:', error);
      throw new Error(`清空碎片物品储存箱失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 清除所有未确认的碎片物品
   */
  static async clearUnconfirmed(actor: any): Promise<void> {
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

      const currentFragments = this.getStoredFragments(targetActor);
      const confirmedFragments = currentFragments.filter(fragment => fragment.confirmed === true);
      
      await targetActor.setFlag('ai-pf2e-assistant', 'fragmentStorage', confirmedFragments);
      
      const removedCount = currentFragments.length - confirmedFragments.length;
      console.log(`已清除 ${removedCount} 个未确认的碎片物品`);
    } catch (error) {
      console.error('清除未确认碎片物品失败:', error);
      throw new Error(`清除未确认碎片物品失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 设置碎片物品的确认状态
   */
  static async setConfirmed(actor: any, fragmentId: string, confirmed: boolean): Promise<void> {
    try {
      await this.updateFragment(actor, fragmentId, { confirmed });
      console.log(`碎片物品 ID "${fragmentId}" 确认状态已设置为 ${confirmed}`);
    } catch (error) {
      console.error('设置碎片物品确认状态失败:', error);
      throw new Error(`设置碎片物品确认状态失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取未确认的碎片物品列表
   */
  static getUnconfirmedFragments(actor: any): any[] {
    const allFragments = this.getStoredFragments(actor);
    // 将 undefined 和 false 都视为未确认
    return allFragments.filter(fragment => fragment.confirmed !== true);
  }

  /**
   * 获取已确认的碎片物品列表
   */
  static getConfirmedFragments(actor: any): any[] {
    const allFragments = this.getStoredFragments(actor);
    return allFragments.filter(fragment => fragment.confirmed === true);
  }

  /**
   * 获取储存箱中碎片物品的数量
   */
  static getStorageCount(actor: any): number {
    return this.getStoredFragments(actor).length;
  }
}

