/**
 * 物品文件夹存储服务
 * 管理法术和物品的文件夹存储，自动创建以角色命名的文件夹
 */
export class ItemFolderStorageService {
  
  /**
   * 获取或创建指定角色的法术文件夹
   * @param actorName 角色名称
   * @returns 法术文件夹
   */
  static async getOrCreateSpellFolder(actorName: string): Promise<Folder | null> {
    return this.getOrCreateFolder(`${actorName}法术`, 'Item');
  }

  /**
   * 获取或创建指定角色的物品文件夹
   * @param actorName 角色名称
   * @returns 物品文件夹
   */
  static async getOrCreateEquipmentFolder(actorName: string): Promise<Folder | null> {
    return this.getOrCreateFolder(`${actorName}物品`, 'Item');
  }

  /**
   * 获取或创建文件夹
   * @param folderName 文件夹名称
   * @param type 文件夹类型
   * @returns 文件夹对象
   */
  private static async getOrCreateFolder(folderName: string, type: string): Promise<Folder | null> {
    try {
      // 查找是否已存在该文件夹
      const existingFolder = game.folders?.find(
        (f: Folder) => f.name === folderName && f.type === type
      );

      if (existingFolder) {
        console.log(`找到现有文件夹: ${folderName}`);
        return existingFolder;
      }

      // 创建新文件夹
      const newFolder = await Folder.create({
        name: folderName,
        type: type,
        color: this.getFolderColor(folderName),
        sorting: 'a' // 按名称排序
      });

      console.log(`创建新文件夹: ${folderName}`);
      return newFolder as Folder;
    } catch (error) {
      console.error(`创建/获取文件夹 ${folderName} 失败:`, error);
      return null;
    }
  }

  /**
   * 根据文件夹名称获取颜色
   * @param folderName 文件夹名称
   * @returns 颜色代码
   */
  private static getFolderColor(folderName: string): string {
    if (folderName.endsWith('法术')) {
      return '#4a90e2'; // 蓝色 - 法术
    } else if (folderName.endsWith('物品')) {
      return '#f5a623'; // 橙色 - 物品
    }
    return '#999999'; // 默认灰色
  }

  /**
   * 添加法术到角色的法术文件夹
   * @param actorName 角色名称
   * @param spellData 法术数据
   * @returns 创建的法术物品
   */
  static async addSpell(actorName: string, spellData: any): Promise<any> {
    try {
      const folder = await this.getOrCreateSpellFolder(actorName);
      
      if (!folder) {
        throw new Error('无法创建法术文件夹');
      }

      // 创建法术物品并关联到文件夹
      const itemData = {
        ...spellData,
        folder: folder.id
      };

      const createdItem = await Item.create(itemData);
      console.log(`法术 "${spellData.name}" 已添加到文件夹 "${folder.name}"`);
      
      return createdItem;
    } catch (error) {
      console.error('添加法术到文件夹失败:', error);
      throw new Error(`添加法术失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 添加物品到角色的物品文件夹
   * @param actorName 角色名称
   * @param equipmentData 物品数据
   * @returns 创建的物品
   */
  static async addEquipment(actorName: string, equipmentData: any): Promise<any> {
    try {
      const folder = await this.getOrCreateEquipmentFolder(actorName);
      
      if (!folder) {
        throw new Error('无法创建物品文件夹');
      }

      // 创建物品并关联到文件夹
      const itemData = {
        ...equipmentData,
        folder: folder.id
      };

      const createdItem = await Item.create(itemData);
      console.log(`物品 "${equipmentData.name}" 已添加到文件夹 "${folder.name}"`);
      
      return createdItem;
    } catch (error) {
      console.error('添加物品到文件夹失败:', error);
      throw new Error(`添加物品失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 同时添加物品到角色物品栏和物品文件夹
   * @param actor 角色对象
   * @param equipmentData 物品数据
   * @returns 创建的物品
   */
  static async addEquipmentToActorAndFolder(actor: any, equipmentData: any): Promise<{actorItem: any, folderItem: any}> {
    try {
      // 1. 添加到角色物品栏
      const actorItems = await actor.createEmbeddedDocuments('Item', [equipmentData]);
      const actorItem = actorItems[0];
      console.log(`物品 "${equipmentData.name}" 已添加到角色 "${actor.name}" 的物品栏`);

      // 2. 同时添加到物品文件夹
      const folderItem = await this.addEquipment(actor.name, equipmentData);
      
      return {
        actorItem,
        folderItem
      };
    } catch (error) {
      console.error('添加物品到角色和文件夹失败:', error);
      throw new Error(`添加物品失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取文件夹中的所有物品
   * @param folderName 文件夹名称
   * @returns 物品列表
   */
  static async getItemsInFolder(folderName: string): Promise<any[]> {
    try {
      const folder = game.folders?.find(
        (f: Folder) => f.name === folderName && f.type === 'Item'
      );

      if (!folder) {
        return [];
      }

      const items = game.items?.filter((item: any) => item.folder?.id === folder.id) || [];
      return Array.from(items);
    } catch (error) {
      console.error(`获取文件夹 ${folderName} 中的物品失败:`, error);
      return [];
    }
  }

  /**
   * 清空指定文件夹（删除其中所有物品）
   * @param folderName 文件夹名称
   */
  static async clearFolder(folderName: string): Promise<void> {
    try {
      const items = await this.getItemsInFolder(folderName);
      
      if (items.length === 0) {
        console.log(`文件夹 ${folderName} 已经是空的`);
        return;
      }

      const itemIds = items.map((item: any) => item.id);
      await Item.deleteDocuments(itemIds);
      
      console.log(`已清空文件夹 ${folderName}，删除了 ${items.length} 个物品`);
    } catch (error) {
      console.error(`清空文件夹 ${folderName} 失败:`, error);
      throw new Error(`清空文件夹失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 删除指定文件夹及其所有内容
   * @param folderName 文件夹名称
   */
  static async deleteFolder(folderName: string): Promise<void> {
    try {
      const folder = game.folders?.find(
        (f: Folder) => f.name === folderName && f.type === 'Item'
      );

      if (!folder) {
        console.log(`文件夹 ${folderName} 不存在`);
        return;
      }

      // 先清空文件夹内容
      await this.clearFolder(folderName);

      // 删除文件夹本身
      await folder.delete();
      
      console.log(`已删除文件夹 ${folderName}`);
    } catch (error) {
      console.error(`删除文件夹 ${folderName} 失败:`, error);
      throw new Error(`删除文件夹失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

