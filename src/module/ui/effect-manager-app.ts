import { MODULE_ID } from '../constants';
import { EffectItemService } from '../services/effect-item-service';

/**
 * Effect管理器应用程序
 * 用于查看、管理和编辑effect物品
 */
export class EffectManagerApp extends Application {
  private effectService: EffectItemService;
  private sourceItemName: string;
  private effects: any[] = [];

  constructor(sourceItemName: string, options = {}) {
    super(options);
    this.sourceItemName = sourceItemName;
    this.effectService = EffectItemService.getInstance();
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: 'effect-manager',
      classes: [MODULE_ID, 'effect-manager'],
      title: 'Effect管理器',
      template: `modules/${MODULE_ID}/templates/effect-manager-app.hbs`,
      width: 700,
      height: 600,
      resizable: true,
      tabs: [],
      scrollY: ['.effects-list']
    });
  }

  async getData() {
    // 加载effect列表
    this.effects = await this.effectService.getEffectsForItem(this.sourceItemName);

    return {
      sourceItemName: this.sourceItemName,
      effects: this.effects.map((effect: any) => ({
        id: effect.id,
        name: effect.name,
        uuid: effect.uuid,
        img: effect.img,
        level: effect.system?.level?.value || 1,
        duration: this.formatDuration(effect.system?.duration),
        rulesCount: effect.system?.rules?.length || 0,
        description: effect.system?.description?.value || ''
      })),
      hasEffects: this.effects.length > 0
    };
  }

  activateListeners(html: any) {
    super.activateListeners(html);

    // 编辑effect
    html.find('.edit-effect').click(async (event: any) => {
      const effectId = $(event.currentTarget).data('effect-id');
      const effect = game.items?.get(effectId);
      if (effect) {
        effect.sheet.render(true);
      }
    });

    // 删除effect
    html.find('.delete-effect').click(async (event: any) => {
      const effectId = $(event.currentTarget).data('effect-id');
      const effect = game.items?.get(effectId);
      
      if (effect) {
        const confirmed = await Dialog.confirm({
          title: '确认删除',
          content: `<p>确定要删除effect "${effect.name}" 吗？</p><p>这将会断开与主物品的连接。</p>`,
          yes: () => true,
          no: () => false,
          defaultYes: false
        });

        if (confirmed) {
          await effect.delete();
          ui.notifications.info(`已删除effect: ${effect.name}`);
          this.render();
        }
      }
    });

    // 复制UUID
    html.find('.copy-uuid').click((event: any) => {
      const uuid = $(event.currentTarget).data('uuid');
      navigator.clipboard.writeText(uuid).then(() => {
        ui.notifications.info('UUID已复制到剪贴板');
      });
    });

    // 查看详情
    html.find('.effect-name').click((event: any) => {
      const detailsRow = $(event.currentTarget).closest('.effect-item').next('.effect-details');
      detailsRow.toggle();
    });

    // 创建新effect
    html.find('.create-new-effect').click(async () => {
      this.showCreateEffectDialog();
    });

    // 删除全部
    html.find('.delete-all-effects').click(async () => {
      if (this.effects.length === 0) {
        ui.notifications.warn('没有effect可删除');
        return;
      }

      const confirmed = await Dialog.confirm({
        title: '确认删除全部',
        content: `<p>确定要删除 ${this.sourceItemName} 的所有 ${this.effects.length} 个effect吗？</p><p>此操作不可撤销！</p>`,
        yes: () => true,
        no: () => false,
        defaultYes: false
      });

      if (confirmed) {
        await this.effectService.deleteEffectsForItem(this.sourceItemName);
        ui.notifications.info(`已删除所有effect`);
        this.render();
      }
    });

    // 刷新列表
    html.find('.refresh-list').click(() => {
      this.render();
    });
  }

  /**
   * 显示创建effect对话框
   */
  private showCreateEffectDialog() {
    const dialogContent = `
      <form>
        <div class="form-group">
          <label>Effect名称:</label>
          <input type="text" name="effectName" placeholder="Effect: My Effect" required />
        </div>
        <div class="form-group">
          <label>类型:</label>
          <select name="effectType">
            <option value="toggle">Toggle（可开关）</option>
            <option value="aura">Aura（光环）</option>
            <option value="stance">Stance（姿态）</option>
            <option value="target">Target（目标效果）</option>
            <option value="duration">Duration（持续效果）</option>
            <option value="general">General（通用）</option>
          </select>
        </div>
        <div class="form-group">
          <label>描述:</label>
          <textarea name="description" rows="3" placeholder="效果描述..."></textarea>
        </div>
        <div class="form-group">
          <label>等级:</label>
          <input type="number" name="level" value="1" min="1" max="20" />
        </div>
      </form>
      <style>
        .form-group {
          margin-bottom: 10px;
        }
        .form-group label {
          display: block;
          font-weight: bold;
          margin-bottom: 3px;
        }
        .form-group input,
        .form-group select,
        .form-group textarea {
          width: 100%;
          padding: 5px;
          border: 1px solid #ccc;
          border-radius: 3px;
        }
      </style>
    `;

    new Dialog({
      title: '创建新Effect',
      content: dialogContent,
      buttons: {
        create: {
          label: '创建',
          icon: '<i class="fas fa-plus"></i>',
          callback: async (html: any) => {
            const formData = new FormData(html.find('form')[0]);
            const effectName = formData.get('effectName') as string;
            const effectType = formData.get('effectType') as string;
            const description = formData.get('description') as string;
            const level = parseInt(formData.get('level') as string) || 1;

            if (!effectName) {
              ui.notifications.error('请输入effect名称');
              return;
            }

            try {
              // 创建effect
              const effectData = {
                name: effectName,
                description: `<p>由 ${this.sourceItemName} 授予</p>${description ? `<p>${description}</p>` : ''}`,
                level: level,
                duration: this.getDefaultDuration(effectType),
                rules: [],
                traits: [],
                rarity: 'common',
                showTokenIcon: true
              };

              const { item, uuid } = await this.effectService.createEffectForItem(
                this.sourceItemName,
                effectData
              );

              ui.notifications.info(`已创建effect: ${effectName}`);
              
              // 打开编辑界面
              item.sheet.render(true);
              
              // 刷新列表
              this.render();
            } catch (error) {
              ui.notifications.error(`创建effect失败: ${error.message}`);
              console.error(error);
            }
          }
        },
        cancel: {
          label: '取消',
          icon: '<i class="fas fa-times"></i>'
        }
      },
      default: 'create'
    }).render(true);
  }

  /**
   * 根据类型获取默认持续时间
   */
  private getDefaultDuration(type: string) {
    switch (type) {
      case 'toggle':
      case 'aura':
      case 'stance':
        return {
          expiry: null as any,
          sustained: false,
          unit: 'unlimited',
          value: -1
        };
      case 'target':
        return {
          expiry: 'turn-start',
          sustained: false,
          unit: 'minutes',
          value: 1
        };
      case 'duration':
        return {
          expiry: 'turn-start',
          sustained: false,
          unit: 'rounds',
          value: 1
        };
      default:
        return {
          expiry: 'turn-start',
          sustained: false,
          unit: 'unlimited',
          value: -1
        };
    }
  }

  /**
   * 格式化持续时间显示
   */
  private formatDuration(duration: any): string {
    if (!duration) return '未知';

    const unit = duration.unit || 'unlimited';
    const value = duration.value || -1;

    if (unit === 'unlimited' || value === -1) {
      return '无限';
    }

    const unitNames: { [key: string]: string } = {
      rounds: '轮',
      minutes: '分钟',
      hours: '小时',
      days: '天'
    };

    return `${value} ${unitNames[unit] || unit}`;
  }
}

