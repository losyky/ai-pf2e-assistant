/**
 * 专长储存箱服务
 * 管理角色的神龛专长储存箱，提供专长的增删查改功能
 * 储存的专长不会被视为角色拥有的专长，其规则元素不会生效
 */
export class FeatStorageService {
  private static readonly STORAGE_FLAG_KEY = 'ai-pf2e-assistant.featStorage';

  /**
   * 获取角色的储存箱中的所有专长
   */
  static getStoredFeats(actor: any): any[] {
    try {
      // 如果传入的是actorData对象，尝试获取真正的Actor对象
      const realActor = actor?._actor || actor;
      
      // 如果仍然没有getFlag方法，尝试从game.actors中获取
      if (!realActor?.getFlag && actor?.id) {
        const gameActor = (window as any).game?.actors?.get(actor.id);
        if (gameActor?.getFlag) {
          const feats = gameActor.getFlag('ai-pf2e-assistant', 'featStorage');
          return Array.isArray(feats) ? feats : [];
        }
      }
      
      if (realActor?.getFlag) {
        const feats = realActor.getFlag('ai-pf2e-assistant', 'featStorage');
        return Array.isArray(feats) ? feats : [];
      }
      
      console.warn('无法获取Actor对象或Actor对象缺少getFlag方法');
      return [];
    } catch (error) {
      console.warn('获取储存箱专长失败:', error);
      return [];
    }
  }

  /**
   * 添加专长到储存箱
   */
  static async addFeat(actor: any, featData: any, confirmed: boolean = false): Promise<void> {
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

      const currentFeats = this.getStoredFeats(targetActor);
      
      // 生成唯一ID（如果没有的话）
      const newFeat = {
        ...featData,
        _id: featData._id || foundry.utils.randomID(),
        storageTimestamp: Date.now(), // 添加时间戳
        confirmed: confirmed // 添加确认标记
      };
      
      const updatedFeats = [...currentFeats, newFeat];
      await targetActor.setFlag('ai-pf2e-assistant', 'featStorage', updatedFeats);
      
      console.log(`专长 "${newFeat.name}" 已添加到储存箱 (confirmed: ${confirmed})`);
    } catch (error) {
      console.error('添加专长到储存箱失败:', error);
      throw new Error(`添加专长到储存箱失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 从储存箱删除专长
   */
  static async removeFeat(actor: any, featId: string): Promise<void> {
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

      const currentFeats = this.getStoredFeats(targetActor);
      const updatedFeats = currentFeats.filter(feat => feat._id !== featId);
      
      await targetActor.setFlag('ai-pf2e-assistant', 'featStorage', updatedFeats);
      
      console.log(`专长 ID "${featId}" 已从储存箱移除`);
    } catch (error) {
      console.error('从储存箱删除专长失败:', error);
      throw new Error(`从储存箱删除专长失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取储存箱中指定ID的专长
   */
  static getStoredFeat(actor: any, featId: string): any | null {
    const feats = this.getStoredFeats(actor);
    return feats.find(feat => feat._id === featId) || null;
  }

  /**
   * 更新储存箱中的专长
   */
  static async updateFeat(actor: any, featId: string, updates: any): Promise<void> {
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

      const currentFeats = this.getStoredFeats(targetActor);
      const updatedFeats = currentFeats.map(feat => 
        feat._id === featId ? { ...feat, ...updates } : feat
      );
      
      await targetActor.setFlag('ai-pf2e-assistant', 'featStorage', updatedFeats);
      
      console.log(`专长 ID "${featId}" 已更新`);
    } catch (error) {
      console.error('更新储存箱专长失败:', error);
      throw new Error(`更新储存箱专长失败: ${error instanceof Error ? error.message : String(error)}`);
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

      await targetActor.setFlag('ai-pf2e-assistant', 'featStorage', []);
      
      console.log('储存箱已清空');
    } catch (error) {
      console.error('清空储存箱失败:', error);
      throw new Error(`清空储存箱失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 清除所有未确认的专长
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

      const currentFeats = this.getStoredFeats(targetActor);
      const confirmedFeats = currentFeats.filter(feat => feat.confirmed === true);
      
      await targetActor.setFlag('ai-pf2e-assistant', 'featStorage', confirmedFeats);
      
      const removedCount = currentFeats.length - confirmedFeats.length;
      console.log(`已清除 ${removedCount} 个未确认的专长`);
    } catch (error) {
      console.error('清除未确认专长失败:', error);
      throw new Error(`清除未确认专长失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 设置专长的确认状态
   */
  static async setConfirmed(actor: any, featId: string, confirmed: boolean): Promise<void> {
    try {
      await this.updateFeat(actor, featId, { confirmed });
      console.log(`专长 ID "${featId}" 确认状态已设置为 ${confirmed}`);
    } catch (error) {
      console.error('设置专长确认状态失败:', error);
      throw new Error(`设置专长确认状态失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取未确认的专长列表
   */
  static getUnconfirmedFeats(actor: any): any[] {
    const allFeats = this.getStoredFeats(actor);
    return allFeats.filter(feat => !feat.confirmed);
  }

  /**
   * 获取已确认的专长列表
   */
  static getConfirmedFeats(actor: any): any[] {
    const allFeats = this.getStoredFeats(actor);
    return allFeats.filter(feat => feat.confirmed === true);
  }

  /**
   * 获取储存箱中专长的数量
   */
  static getStorageCount(actor: any): number {
    return this.getStoredFeats(actor).length;
  }
}




