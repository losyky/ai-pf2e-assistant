/**
 * 物品储存箱服务
 * 管理角色的神龛物品储存箱，提供物品的增删查改功能
 * 储存的物品不会被视为角色拥有的物品，其规则元素不会生效
 */
export class EquipmentStorageService {
  private static readonly STORAGE_FLAG_KEY = 'ai-pf2e-assistant.equipmentStorage';

  /**
   * 获取角色的储存箱中的所有物品
   */
  static getStoredEquipment(actor: any): any[] {
    try {
      // 如果传入的是actorData对象，尝试获取真正的Actor对象
      const realActor = actor?._actor || actor;
      
      // 如果仍然没有getFlag方法，尝试从game.actors中获取
      if (!realActor?.getFlag && actor?.id) {
        const gameActor = (window as any).game?.actors?.get(actor.id);
        if (gameActor?.getFlag) {
          const equipment = gameActor.getFlag('ai-pf2e-assistant', 'equipmentStorage');
          return Array.isArray(equipment) ? this._migrateEquipmentData(equipment) : [];
        }
      }
      
      if (realActor?.getFlag) {
        const equipment = realActor.getFlag('ai-pf2e-assistant', 'equipmentStorage');
        return Array.isArray(equipment) ? this._migrateEquipmentData(equipment) : [];
      }
      
      console.warn('无法获取Actor对象或Actor对象缺少getFlag方法');
      return [];
    } catch (error) {
      console.warn('获取储存箱物品失败:', error);
      return [];
    }
  }

  /**
   * 迁移物品数据，确保所有物品都有confirmed字段
   * @private
   */
  private static _migrateEquipmentData(equipment: any[]): any[] {
    return equipment.map(item => ({
      ...item,
      confirmed: item.confirmed === true ? true : false // 将undefined转为false
    }));
  }

  /**
   * 添加物品到储存箱
   */
  static async addEquipment(actor: any, equipmentData: any, confirmed: boolean = false): Promise<void> {
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

      const currentEquipment = this.getStoredEquipment(targetActor);
      
      // 创建新物品数据,确保confirmed状态正确设置
      const cleanEquipmentData = { ...equipmentData };
      delete cleanEquipmentData.confirmed; // 删除可能存在的confirmed属性
      
      const newEquipment = {
        ...cleanEquipmentData,
        _id: equipmentData._id || foundry.utils.randomID(),
        storageTimestamp: Date.now(), // 添加时间戳
        confirmed: confirmed // 明确设置确认标记
      };
      
      const updatedEquipment = [...currentEquipment, newEquipment];
      await targetActor.setFlag('ai-pf2e-assistant', 'equipmentStorage', updatedEquipment);
      
      console.log(`物品 "${newEquipment.name}" 已添加到储存箱 (confirmed: ${confirmed})`);
    } catch (error) {
      console.error('添加物品到储存箱失败:', error);
      throw new Error(`添加物品到储存箱失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 从储存箱删除物品
   */
  static async removeEquipment(actor: any, equipmentId: string): Promise<void> {
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

      const currentEquipment = this.getStoredEquipment(targetActor);
      const updatedEquipment = currentEquipment.filter(item => item._id !== equipmentId);
      
      await targetActor.setFlag('ai-pf2e-assistant', 'equipmentStorage', updatedEquipment);
      
      console.log(`物品 ID "${equipmentId}" 已从储存箱移除`);
    } catch (error) {
      console.error('从储存箱删除物品失败:', error);
      throw new Error(`从储存箱删除物品失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取储存箱中指定ID的物品
   */
  static getStoredEquipmentItem(actor: any, equipmentId: string): any | null {
    const equipment = this.getStoredEquipment(actor);
    return equipment.find(item => item._id === equipmentId) || null;
  }

  /**
   * 更新储存箱中的物品
   */
  static async updateEquipment(actor: any, equipmentId: string, updates: any): Promise<void> {
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

      const currentEquipment = this.getStoredEquipment(targetActor);
      const updatedEquipment = currentEquipment.map(item => 
        item._id === equipmentId ? { ...item, ...updates } : item
      );
      
      await targetActor.setFlag('ai-pf2e-assistant', 'equipmentStorage', updatedEquipment);
      
      console.log(`物品 ID "${equipmentId}" 已更新`);
    } catch (error) {
      console.error('更新储存箱物品失败:', error);
      throw new Error(`更新储存箱物品失败: ${error instanceof Error ? error.message : String(error)}`);
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

      await targetActor.setFlag('ai-pf2e-assistant', 'equipmentStorage', []);
      
      console.log('储存箱已清空');
    } catch (error) {
      console.error('清空储存箱失败:', error);
      throw new Error(`清空储存箱失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 清除所有未确认的物品
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

      const currentEquipment = this.getStoredEquipment(targetActor);
      const confirmedEquipment = currentEquipment.filter(item => item.confirmed === true);
      
      await targetActor.setFlag('ai-pf2e-assistant', 'equipmentStorage', confirmedEquipment);
      
      const removedCount = currentEquipment.length - confirmedEquipment.length;
      console.log(`已清除 ${removedCount} 个未确认的物品`);
    } catch (error) {
      console.error('清除未确认物品失败:', error);
      throw new Error(`清除未确认物品失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 设置物品的确认状态
   */
  static async setConfirmed(actor: any, equipmentId: string, confirmed: boolean): Promise<void> {
    try {
      await this.updateEquipment(actor, equipmentId, { confirmed });
      console.log(`物品 ID "${equipmentId}" 确认状态已设置为 ${confirmed}`);
    } catch (error) {
      console.error('设置物品确认状态失败:', error);
      throw new Error(`设置物品确认状态失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取未确认的物品列表
   */
  static getUnconfirmedEquipment(actor: any): any[] {
    const allEquipment = this.getStoredEquipment(actor);
    // 将 undefined 和 false 都视为未确认
    return allEquipment.filter(item => item.confirmed !== true);
  }

  /**
   * 获取已确认的物品列表
   */
  static getConfirmedEquipment(actor: any): any[] {
    const allEquipment = this.getStoredEquipment(actor);
    return allEquipment.filter(item => item.confirmed === true);
  }

  /**
   * 获取储存箱中物品的数量
   */
  static getStorageCount(actor: any): number {
    return this.getStoredEquipment(actor).length;
  }
}












