import { ShrineSynthesisApp } from '../ui/shrine-synthesis-app';
import { AIService } from '../services/ai-service';

/**
 * 神龛合成宏API配置接口
 */
export interface ShrineMacroConfig {
  /** 角色对象或UUID */
  actor?: any;
  /** 合成模式：'feat' | 'spell' | 'equipment' */
  mode?: 'feat' | 'spell' | 'equipment';
  /** 法术施法传统（仅spell模式） */
  spellTradition?: 'arcane' | 'divine' | 'occult' | 'primal';
  /** 锁定的神龛UUID（如果提供，神龛槽将被锁定） */
  lockedShrine?: string;
  /** 锁定的材料UUID列表（这些材料将被预填充且无法移除） */
  lockedMaterials?: string[];
  /** 是否允许添加额外材料（默认true） */
  allowAdditionalMaterials?: boolean;
  /** 是否显示清空材料按钮（默认true，如果有锁定材料则建议false） */
  showClearButton?: boolean;
  /** 自定义背景图URL（如果提供，将覆盖神龛物品中的背景图配置） */
  backgroundImage?: string;
}

/**
 * 神龛合成宏API
 * 提供通过宏调用神龛系统的功能
 */
export class ShrineMacroAPI {
  private static aiService: AIService | null = null;

  /**
   * 设置AI服务实例（由主模块调用）
   */
  static setAIService(aiService: AIService): void {
    this.aiService = aiService;
  }

  /**
   * 打开神龛合成界面（带锁定功能）
   * 
   * @example
   * // 基础用法
   * game.modules.get('ai-pf2e-assistant').api.shrine.open({
   *   actor: game.user.character,
   *   mode: 'feat'
   * });
   * 
   * @example
   * // 锁定神龛和部分材料
   * game.modules.get('ai-pf2e-assistant').api.shrine.open({
   *   actor: game.user.character,
   *   mode: 'feat',
   *   lockedShrine: 'Compendium.world.items.xyz123',
   *   lockedMaterials: ['Compendium.world.items.abc456', 'Actor.id.Item.def789'],
   *   allowAdditionalMaterials: true,
   *   showClearButton: false
   * });
   */
  static async open(config: ShrineMacroConfig = {}): Promise<ShrineSynthesisApp> {
    if (!this.aiService) {
      throw new Error('AI服务未初始化，无法打开神龛合成界面');
    }

    // 获取角色
    let actor = config.actor;
    if (typeof actor === 'string') {
      // 如果是UUID，尝试解析
      actor = await fromUuid(actor);
    }
    
    if (!actor && (game as any).user?.character) {
      actor = (game as any).user.character;
    }

    if (!actor) {
      ui.notifications?.warn('请先选择一个角色或提供角色参数');
      throw new Error('未提供有效的角色');
    }

    // 创建合成应用
    const mode = config.mode || 'feat';
    const options: any = {
      synthesisMode: mode
    };

    if (mode === 'spell' && config.spellTradition) {
      options.spellTradition = config.spellTradition;
    }

    const app = new ShrineSynthesisApp(actor, options);
    app.setAIService(this.aiService);

    // 如果有锁定配置，应用锁定
    if (config.lockedShrine || (config.lockedMaterials && config.lockedMaterials.length > 0)) {
      await this._applyLocks(app, config);
    }

    // 设置额外配置
    if (config.allowAdditionalMaterials !== undefined) {
      (app as any)._allowAdditionalMaterials = config.allowAdditionalMaterials;
    }
    
    if (config.showClearButton !== undefined) {
      (app as any)._showClearButton = config.showClearButton;
    }
    
    // 设置自定义背景图
    if (config.backgroundImage) {
      (app as any)._customBackgroundImage = config.backgroundImage;
    }

    app.render(true);
    return app;
  }

  /**
   * 应用锁定配置
   * @private
   */
  private static async _applyLocks(app: ShrineSynthesisApp, config: ShrineMacroConfig): Promise<void> {
    const locks: any = {
      shrine: null,
      materials: []
    };

    // 锁定神龛
    if (config.lockedShrine) {
      try {
        const shrineItem = await fromUuid(config.lockedShrine);
        if (shrineItem) {
          locks.shrine = {
            id: shrineItem.id || shrineItem._id,
            uuid: config.lockedShrine,
            name: shrineItem.name,
            img: shrineItem.img,
            type: 'shrine',
            locked: true,
            data: shrineItem,
            originalItem: shrineItem  // 保存原始物品，用于背景图检测
          };
        }
      } catch (error) {
        console.error('无法加载锁定的神龛:', config.lockedShrine, error);
        ui.notifications?.warn(`无法加载神龛: ${config.lockedShrine}`);
      }
    }

    // 锁定材料
    if (config.lockedMaterials && config.lockedMaterials.length > 0) {
      for (const materialUuid of config.lockedMaterials) {
        try {
          const materialItem = await fromUuid(materialUuid);
          if (materialItem) {
            // 判断材料类型
            const materialType = this._detectMaterialType(materialItem);
            
            locks.materials.push({
              id: materialItem.id || materialItem._id,
              uuid: materialUuid,
              name: materialItem.name,
              img: materialItem.img,
              type: materialType,
              locked: true,
              data: materialItem
            });
          }
        } catch (error) {
          console.error('无法加载锁定的材料:', materialUuid, error);
          ui.notifications?.warn(`无法加载材料: ${materialUuid}`);
        }
      }
    }

    // 将锁定信息保存到应用实例
    (app as any)._lockedItems = locks;
    
    // 如果有锁定的神龛，预设它
    if (locks.shrine) {
      (app as any).selectedShrine = locks.shrine;
    }
    
    // 如果有锁定的材料，预设它们
    if (locks.materials.length > 0) {
      (app as any).selectedMaterials = [...locks.materials];
    }
  }

  /**
   * 检测材料类型
   * @private
   */
  private static _detectMaterialType(item: any): string {
    const itemData = item.toObject ? item.toObject() : item;
    
    // 检查flags标记
    const fragmentType = itemData.flags?.['ai-pf2e-assistant']?.fragmentType;
    if (fragmentType === 'feat-fragment') return 'fragment';
    if (fragmentType === 'divinity') return 'divinity';
    if (fragmentType === 'offering') return 'offering';
    
    // 检查特征标签
    const traits = itemData.system?.traits?.value || [];
    if (traits.includes('divinity')) return 'divinity';
    if (traits.includes('offering')) return 'offering';
    if (traits.includes('fragment')) return 'fragment';
    
    // 检查描述中的关键词
    const description = itemData.system?.description?.value || '';
    if (description.includes('神性') || description.includes('divinity')) return 'divinity';
    if (description.includes('贡品') || description.includes('offering')) return 'offering';
    if (description.includes('碎片') || description.includes('fragment')) return 'fragment';
    
    // 默认为碎片
    return 'fragment';
  }

  /**
   * 获取角色的神龛点数
   */
  static getShrinePoints(actor?: any): number {
    if (!actor && (game as any).user?.character) {
      actor = (game as any).user.character;
    }
    
    if (!actor) {
      return 0;
    }

    const { ShrinePointService } = require('../services/shrine-point-service');
    return ShrinePointService.getActorPoints(actor);
  }

  /**
   * 设置角色的神龛点数（仅GM）
   */
  static setShrinePoints(points: number, actor?: any): boolean {
    if (!(game as any).user?.isGM) {
      ui.notifications?.error('只有GM可以设置神龛点数');
      return false;
    }

    if (!actor && (game as any).user?.character) {
      actor = (game as any).user.character;
    }
    
    if (!actor) {
      ui.notifications?.warn('请先选择一个角色');
      return false;
    }

    const { ShrinePointService } = require('../services/shrine-point-service');
    return ShrinePointService.setActorPoints(actor, points);
  }

  /**
   * 增加角色的神龛点数（仅GM）
   */
  static addShrinePoints(amount: number, actor?: any): boolean {
    if (!(game as any).user?.isGM) {
      ui.notifications?.error('只有GM可以添加神龛点数');
      return false;
    }

    if (!actor && (game as any).user?.character) {
      actor = (game as any).user.character;
    }
    
    if (!actor) {
      ui.notifications?.warn('请先选择一个角色');
      return false;
    }

    const { ShrinePointService } = require('../services/shrine-point-service');
    return ShrinePointService.addActorPoints(actor, amount);
  }
}

/**
 * 宏示例
 */
export const MACRO_EXAMPLES = {
  // 基础使用
  basic: `// 打开神龛合成界面
game.modules.get('ai-pf2e-assistant').api.shrine.open({
  actor: game.user.character,
  mode: 'feat'
});`,

  // 锁定神龛
  lockedShrine: `// 锁定特定神龛
game.modules.get('ai-pf2e-assistant').api.shrine.open({
  actor: game.user.character,
  mode: 'feat',
  lockedShrine: 'Compendium.world.items.xyz123'
});`,

  // 完整锁定
  fullyLocked: `// 锁定神龛和材料，不允许修改
game.modules.get('ai-pf2e-assistant').api.shrine.open({
  actor: game.user.character,
  mode: 'feat',
  lockedShrine: 'Compendium.world.items.xyz123',
  lockedMaterials: [
    'Compendium.world.items.abc456',
    'Actor.id.Item.def789'
  ],
  allowAdditionalMaterials: false,
  showClearButton: false
});`,

  // 法术合成
  spell: `// 法术合成
game.modules.get('ai-pf2e-assistant').api.shrine.open({
  actor: game.user.character,
  mode: 'spell',
  spellTradition: 'arcane'
});`,

  // 物品合成
  equipment: `// 物品合成
game.modules.get('ai-pf2e-assistant').api.shrine.open({
  actor: game.user.character,
  mode: 'equipment',
  lockedShrine: 'Compendium.world.items.weapon-shrine'
});`,

  // 查询点数
  checkPoints: `// 查询神龛点数
const points = game.modules.get('ai-pf2e-assistant').api.shrine.getShrinePoints(game.user.character);
console.log(\`当前神龛点数: \${points}\`);`,

  // 添加点数（GM）
  addPoints: `// 添加神龛点数（仅GM）
game.modules.get('ai-pf2e-assistant').api.shrine.addShrinePoints(5, game.user.character);`
};



