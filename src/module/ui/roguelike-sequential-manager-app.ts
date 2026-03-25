import { RoguelikeSequentialDrawApp, RoguelikeSequentialConfig, SequentialMacroConfig } from './roguelike-sequential-draw-app';
import { RoguelikeDrawPointService } from '../services/roguelike-draw-point-service';

/**
 * Roguelike 连续抽取宏管理器（ApplicationV2）
 * 配置连续抽取宏并创建对应的宏
 */
export class RoguelikeSequentialManagerApp extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  private config: {
    title: string;
    macros: SequentialMacroConfig[];
    banListIds: string[];
  };

  static DEFAULT_OPTIONS = {
    id: 'roguelike-sequential-manager',
    tag: 'div',
    window: {
      title: 'Roguelike 连续抽取宏管理器',
      icon: 'fas fa-list-ol',
      resizable: true
    },
    position: {
      width: 650,
      height: 'auto'
    },
    classes: ['roguelike-sequential-manager-app']
  };

  static PARTS = {
    main: {
      template: 'modules/ai-pf2e-assistant/templates/roguelike-sequential-manager.hbs'
    }
  };

  constructor() {
    super({});
    this.config = {
      title: 'Roguelike 连续抽取',
      macros: [],
      banListIds: [],
    };
  }

  async _prepareContext(_options: any): Promise<any> {
    const allBanLists = ((game as any).settings.get('ai-pf2e-assistant', 'roguelikeBanlists') || []) as any[];

    return {
      config: this.config,
      allBanLists,
    };
  }

  _onRender(_context: any, _options: any): void {
    const html = $(this.element);

    html.find('[name="title"]').on('input', (event) => {
      this.config.title = $(event.currentTarget).val() as string;
    });

    html.find('.remove-macro-btn').on('click', (event) => {
      const index = parseInt((event.currentTarget as HTMLElement).dataset.index || '0');
      this.removeMacro(index);
    });

    html.find('.move-up-btn').on('click', (event) => {
      const index = parseInt((event.currentTarget as HTMLElement).dataset.index || '0');
      this.moveMacro(index, -1);
    });

    html.find('.move-down-btn').on('click', (event) => {
      const index = parseInt((event.currentTarget as HTMLElement).dataset.index || '0');
      this.moveMacro(index, 1);
    });

    html.find('.banlist-checkbox').on('change', (event) => {
      const banlistId = (event.currentTarget as HTMLInputElement).value;
      const checked = (event.currentTarget as HTMLInputElement).checked;
      
      if (checked) {
        if (!this.config.banListIds.includes(banlistId)) {
          this.config.banListIds.push(banlistId);
        }
      } else {
        this.config.banListIds = this.config.banListIds.filter(id => id !== banlistId);
      }
    });

    html.find('.create-sequential-macro-btn').on('click', () => {
      this.createSequentialMacro();
    });

    html.find('.test-sequential-btn').on('click', () => {
      this.testSequential();
    });

    // 拖拽区域
    const dropZone = html.find('.sequential-macro-drop-zone')[0];
    if (dropZone) {
      dropZone.addEventListener('dragover', (ev: DragEvent) => {
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
        dropZone.classList.add('drag-over');
      });
      dropZone.addEventListener('dragleave', (ev: DragEvent) => {
        const related = ev.relatedTarget as HTMLElement | null;
        if (!related || !dropZone.contains(related)) {
          dropZone.classList.remove('drag-over');
        }
      });
      dropZone.addEventListener('drop', (ev: DragEvent) => {
        ev.preventDefault();
        dropZone.classList.remove('drag-over');
        this.handleMacroDrop(ev);
      });
    }
  }

  private async handleMacroDrop(ev: DragEvent): Promise<void> {
    if (!ev.dataTransfer) return;

    let data: any;
    try {
      data = JSON.parse(ev.dataTransfer.getData('text/plain'));
    } catch {
      return;
    }

    const uuid: string = data.uuid || '';
    if (!uuid) return;

    try {
      const doc = await (globalThis as any).fromUuid(uuid);
      if (!doc || doc.documentName !== 'Macro') {
        ui.notifications?.warn('请拖入宏（Macro）文档');
        return;
      }

      // 检查是否为有效的抽取宏
      const command = doc.command || '';
      if (!command.includes('game.modules.get(\'ai-pf2e-assistant\').api.roguelike.draw')) {
        ui.notifications?.warn('请拖入 Roguelike 抽取宏');
        return;
      }

      // 检查是否已存在
      if (this.config.macros.some(m => m.uuid === uuid)) {
        ui.notifications?.warn(`宏「${doc.name}」已在列表中`);
        return;
      }

      const macroConfig: SequentialMacroConfig = {
        uuid,
        name: doc.name || 'Unknown Macro',
        img: doc.img || 'icons/svg/dice-target.svg'
      };

      this.config.macros.push(macroConfig);
      ui.notifications?.info(`已添加宏「${macroConfig.name}」`);
      this.render({ force: false });
    } catch (err) {
      console.error('[SequentialManager] Drop failed', err);
      ui.notifications?.error('添加宏失败');
    }
  }

  private removeMacro(index: number): void {
    this.config.macros.splice(index, 1);
    this.render({ force: false });
  }

  private moveMacro(index: number, direction: number): void {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= this.config.macros.length) return;

    const temp = this.config.macros[index];
    this.config.macros[index] = this.config.macros[newIndex];
    this.config.macros[newIndex] = temp;
    this.render({ force: false });
  }

  private async createSequentialMacro(): Promise<void> {
    if (this.config.macros.length === 0) {
      (globalThis as any).ui?.notifications?.warn('请至少添加一个宏');
      return;
    }

    const configJson = JSON.stringify({
      title: this.config.title,
      macros: this.config.macros,
      banListIds: this.config.banListIds,
    }, null, 2);

    const command = `
// Roguelike 连续抽取宏 - 由 AI PF2e Assistant 生成
const config = ${configJson};

(async () => {
  // 解析 actor
  let actor = canvas.tokens?.controlled[0]?.actor || game.user?.character;
  if (!actor) {
    const ownedActors = game.actors?.filter(a => a.hasPlayerOwner && a.testUserPermission(game.user, 'OWNER'));
    if (ownedActors && ownedActors.length === 1) {
      actor = ownedActors[0];
    }
  }
  
  if (!actor) {
    ui.notifications?.warn('未选择角色');
    return;
  }
  
  // 通过 API 调用
  const mod = game.modules.get('ai-pf2e-assistant');
  if (!mod?.api?.roguelike?._executeSequential) {
    ui.notifications?.error('连续抽取宏功能不可用');
    return;
  }
  
  await mod.api.roguelike._executeSequential(config, actor);
})();
`;

    try {
      const Macro = (globalThis as any).Macro;
      await Macro.create({
        name: this.config.title,
        type: 'script',
        img: 'icons/svg/clockwork.svg',
        command: command.trim(),
      });

      (globalThis as any).ui?.notifications?.info(`连续抽取宏「${this.config.title}」已创建`);
    } catch (error) {
      console.error('[SequentialManager] 创建宏失败:', error);
      (globalThis as any).ui?.notifications?.error('创建连续抽取宏失败');
    }
  }

  private async testSequential(): Promise<void> {
    if (this.config.macros.length === 0) {
      (globalThis as any).ui?.notifications?.warn('请至少添加一个宏');
      return;
    }

    const actor = (globalThis as any).canvas?.tokens?.controlled[0]?.actor || (game as any).user?.character;
    if (!actor) {
      (globalThis as any).ui?.notifications?.warn('未选择角色，测试取消');
      return;
    }

    const config: RoguelikeSequentialConfig = {
      title: this.config.title,
      macros: this.config.macros,
      banListIds: this.config.banListIds,
    };

    try {
      const app = new RoguelikeSequentialDrawApp(config, actor);
      await app.initialize();
      app.render(true);
    } catch (error: any) {
      console.error('[SequentialManager] 测试失败:', error);
      (globalThis as any).ui?.notifications?.error('测试失败: ' + error.message);
    }
  }

  static show(): RoguelikeSequentialManagerApp {
    const manager = new RoguelikeSequentialManagerApp();
    manager.render({ force: true });
    return manager;
  }
}
