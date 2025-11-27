/**
 * 法术储存箱服务
 * 管理角色的神龛法术储存箱，提供法术的增删查改功能
 * 储存的法术不会被视为角色拥有的法术，其规则元素不会生效
 */
export class SpellStorageService {
  private static readonly STORAGE_FLAG_KEY = 'ai-pf2e-assistant.spellStorage';

  /**
   * 获取角色的储存箱中的所有法术
   */
  static getStoredSpells(actor: any): any[] {
    try {
      // 如果传入的是actorData对象，尝试获取真正的Actor对象
      const realActor = actor?._actor || actor;
      
      // 如果仍然没有getFlag方法，尝试从game.actors中获取
      if (!realActor?.getFlag && actor?.id) {
        const gameActor = (window as any).game?.actors?.get(actor.id);
        if (gameActor?.getFlag) {
          const spells = gameActor.getFlag('ai-pf2e-assistant', 'spellStorage');
          return Array.isArray(spells) ? spells : [];
        }
      }
      
      if (realActor?.getFlag) {
        const spells = realActor.getFlag('ai-pf2e-assistant', 'spellStorage');
        return Array.isArray(spells) ? spells : [];
      }
      
      console.warn('无法获取Actor对象或Actor对象缺少getFlag方法');
      return [];
    } catch (error) {
      console.warn('获取储存箱法术失败:', error);
      return [];
    }
  }

  /**
   * 添加法术到储存箱
   */
  static async addSpell(actor: any, spellData: any, confirmed: boolean = false): Promise<void> {
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

      const currentSpells = this.getStoredSpells(targetActor);
      
      // 生成唯一ID（如果没有的话）
      const newSpell = {
        ...spellData,
        _id: spellData._id || foundry.utils.randomID(),
        storageTimestamp: Date.now(), // 添加时间戳
        confirmed: confirmed // 添加确认标记
      };
      
      const updatedSpells = [...currentSpells, newSpell];
      await targetActor.setFlag('ai-pf2e-assistant', 'spellStorage', updatedSpells);
      
      console.log(`法术 "${newSpell.name}" 已添加到储存箱 (confirmed: ${confirmed})`);
    } catch (error) {
      console.error('添加法术到储存箱失败:', error);
      throw new Error(`添加法术到储存箱失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 从储存箱删除法术
   */
  static async removeSpell(actor: any, spellId: string): Promise<void> {
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

      const currentSpells = this.getStoredSpells(targetActor);
      const updatedSpells = currentSpells.filter(spell => spell._id !== spellId);
      
      await targetActor.setFlag('ai-pf2e-assistant', 'spellStorage', updatedSpells);
      
      console.log(`法术 ID "${spellId}" 已从储存箱移除`);
    } catch (error) {
      console.error('从储存箱删除法术失败:', error);
      throw new Error(`从储存箱删除法术失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取储存箱中指定ID的法术
   */
  static getStoredSpell(actor: any, spellId: string): any | null {
    const spells = this.getStoredSpells(actor);
    return spells.find(spell => spell._id === spellId) || null;
  }

  /**
   * 更新储存箱中的法术
   */
  static async updateSpell(actor: any, spellId: string, updates: any): Promise<void> {
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

      const currentSpells = this.getStoredSpells(targetActor);
      const updatedSpells = currentSpells.map(spell => 
        spell._id === spellId ? { ...spell, ...updates } : spell
      );
      
      await targetActor.setFlag('ai-pf2e-assistant', 'spellStorage', updatedSpells);
      
      console.log(`法术 ID "${spellId}" 已更新`);
    } catch (error) {
      console.error('更新储存箱法术失败:', error);
      throw new Error(`更新储存箱法术失败: ${error instanceof Error ? error.message : String(error)}`);
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

      await targetActor.setFlag('ai-pf2e-assistant', 'spellStorage', []);
      
      console.log('法术储存箱已清空');
    } catch (error) {
      console.error('清空法术储存箱失败:', error);
      throw new Error(`清空法术储存箱失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 清除所有未确认的法术
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

      const currentSpells = this.getStoredSpells(targetActor);
      const confirmedSpells = currentSpells.filter(spell => spell.confirmed === true);
      
      await targetActor.setFlag('ai-pf2e-assistant', 'spellStorage', confirmedSpells);
      
      const removedCount = currentSpells.length - confirmedSpells.length;
      console.log(`已清除 ${removedCount} 个未确认的法术`);
    } catch (error) {
      console.error('清除未确认法术失败:', error);
      throw new Error(`清除未确认法术失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 设置法术的确认状态
   */
  static async setConfirmed(actor: any, spellId: string, confirmed: boolean): Promise<void> {
    try {
      await this.updateSpell(actor, spellId, { confirmed });
      console.log(`法术 ID "${spellId}" 确认状态已设置为 ${confirmed}`);
    } catch (error) {
      console.error('设置法术确认状态失败:', error);
      throw new Error(`设置法术确认状态失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取未确认的法术列表
   */
  static getUnconfirmedSpells(actor: any): any[] {
    const allSpells = this.getStoredSpells(actor);
    return allSpells.filter(spell => !spell.confirmed);
  }

  /**
   * 获取已确认的法术列表
   */
  static getConfirmedSpells(actor: any): any[] {
    const allSpells = this.getStoredSpells(actor);
    return allSpells.filter(spell => spell.confirmed === true);
  }

  /**
   * 获取储存箱中法术的数量
   */
  static getStorageCount(actor: any): number {
    return this.getStoredSpells(actor).length;
  }
}





