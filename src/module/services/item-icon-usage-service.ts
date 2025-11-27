import { MODULE_ID } from '../constants';

// 声明全局变量
declare const game: any;

/**
 * 物品图标生成使用限制服务
 * 追踪玩家对每个物品的图标生成使用次数
 */
export class ItemIconUsageService {
  private static instance: ItemIconUsageService;

  private constructor() {}

  public static getInstance(): ItemIconUsageService {
    if (!ItemIconUsageService.instance) {
      ItemIconUsageService.instance = new ItemIconUsageService();
    }
    return ItemIconUsageService.instance;
  }

  /**
   * 获取存储键
   */
  private getStorageKey(userId: string): string {
    return `${MODULE_ID}.itemIconUsage.${userId}`;
  }

  /**
   * 获取用户的使用记录
   */
  private getUserUsage(userId: string): Record<string, boolean> {
    const key = this.getStorageKey(userId);
    const data = game.user?.getFlag(MODULE_ID, key) || {};
    return data;
  }

  /**
   * 设置用户的使用记录
   */
  private async setUserUsage(userId: string, data: Record<string, boolean>): Promise<void> {
    const key = this.getStorageKey(userId);
    await game.user?.setFlag(MODULE_ID, key, data);
  }

  /**
   * 检查物品是否已被使用过图标生成
   * @param itemId 物品ID
   * @param userId 用户ID，默认为当前用户
   * @returns 是否已使用过
   */
  public hasUsedIconGeneration(itemId: string, userId?: string): boolean {
    // GM无限制
    if (game.user?.isGM) {
      return false;
    }

    const uid = userId || game.user?.id;
    if (!uid) return false;

    const usage = this.getUserUsage(uid);
    return usage[itemId] === true;
  }

  /**
   * 记录物品图标生成使用
   * @param itemId 物品ID
   * @param userId 用户ID，默认为当前用户
   */
  public async markItemUsed(itemId: string, userId?: string): Promise<void> {
    const uid = userId || game.user?.id;
    if (!uid) {
      throw new Error('无法获取用户ID');
    }

    // GM不记录
    if (game.user?.isGM) {
      return;
    }

    const usage = this.getUserUsage(uid);
    usage[itemId] = true;
    await this.setUserUsage(uid, usage);

    console.log(`${MODULE_ID} | 记录物品 ${itemId} 的图标生成使用`);
  }

  /**
   * 检查是否可以使用图标生成（GM或未使用过的物品）
   * @param itemId 物品ID
   * @param userId 用户ID，默认为当前用户
   * @returns 是否可以使用
   */
  public canUseIconGeneration(itemId: string, userId?: string): boolean {
    // GM无限制
    if (game.user?.isGM) {
      return true;
    }

    return !this.hasUsedIconGeneration(itemId, userId);
  }

  /**
   * 清除物品的使用记录（仅GM可用）
   * @param itemId 物品ID
   * @param userId 用户ID，如果不指定则清除所有用户的记录
   */
  public async clearItemUsage(itemId: string, userId?: string): Promise<void> {
    if (!game.user?.isGM) {
      throw new Error('只有GM可以清除使用记录');
    }

    if (userId) {
      // 清除特定用户的记录
      const usage = this.getUserUsage(userId);
      delete usage[itemId];
      await this.setUserUsage(userId, usage);
    } else {
      // 清除所有用户的记录
      for (const user of game.users) {
        const usage = this.getUserUsage(user.id);
        if (usage[itemId]) {
          delete usage[itemId];
          await this.setUserUsage(user.id, usage);
        }
      }
    }

    console.log(`${MODULE_ID} | 清除物品 ${itemId} 的使用记录`);
  }

  /**
   * 获取用户已使用图标生成的物品总数
   * @param userId 用户ID，默认为当前用户
   * @returns 已使用的物品数量
   */
  public getUsedItemCount(userId?: string): number {
    const uid = userId || game.user?.id;
    if (!uid) return 0;

    const usage = this.getUserUsage(uid);
    return Object.keys(usage).length;
  }

  /**
   * 重置用户的所有使用记录（仅GM可用）
   * @param userId 用户ID
   */
  public async resetUserUsage(userId: string): Promise<void> {
    if (!game.user?.isGM) {
      throw new Error('只有GM可以重置使用记录');
    }

    await this.setUserUsage(userId, {});
    console.log(`${MODULE_ID} | 重置用户 ${userId} 的所有使用记录`);
  }
}















