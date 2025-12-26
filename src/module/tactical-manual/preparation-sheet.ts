/**
 * 战术动作准备界面
 * Tactical Action Preparation Sheet
 */

import { TacticalManualCasting } from './tactical-casting';
import { MODULE_ID } from '../constants';

/**
 * 战术动作准备界面
 * 允许玩家选择要准备的战术动作
 */
export class TacticalPreparationSheet extends FormApplication {
    private tacticalManual: TacticalManualCasting;

    constructor(tacticalManual: TacticalManualCasting, options?: Partial<FormApplicationOptions>) {
        super(tacticalManual.actor, options);
        this.tacticalManual = tacticalManual;
    }

    static override get defaultOptions(): FormApplicationOptions {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "tactical-manual-preparation",
            classes: ["pf2e", "tactical-preparation-dialog"],
            title: game.i18n.localize("AIPF2E.TacticalManual.PrepareTitle"),
            template: `modules/${MODULE_ID}/templates/tactical-preparation-sheet.hbs`,
            width: 700,
            height: 600,
            closeOnSubmit: false,
            submitOnChange: false,
            resizable: true,
        });
    }

    override async getData(options?: Partial<FormApplicationOptions>): Promise<any> {
        const allTacticalActions = this.tacticalManual.collection.getAllActions().sort((a, b) => a.name.localeCompare(b.name));
        const preparedActionIds = new Set(this.tacticalManual.collection.getPreparedActionIds());
        const maxSlots = this.tacticalManual.collection.getMaxSlots();

        const preparedActions = allTacticalActions
            .filter(a => preparedActionIds.has(a.id))
            .map(action => this.enrichActionData(action));
        const availableActions = allTacticalActions
            .filter(a => !preparedActionIds.has(a.id))
            .map(action => this.enrichActionData(action));

        return {
            ...(await super.getData(options)),
            actor: this.object,
            tacticalManual: this.tacticalManual,
            preparedActions: preparedActions,
            availableActions: availableActions,
            maxSlots: maxSlots,
            i18n: {
                prepareHeader: game.i18n.localize("AIPF2E.TacticalManual.PrepareHeader"),
                prepareInfo: game.i18n.format("AIPF2E.TacticalManual.PrepareInfo", { max: maxSlots }),
                preparedSection: game.i18n.format("AIPF2E.TacticalManual.PreparedSection", { current: preparedActions.length, max: maxSlots }),
                availableSection: game.i18n.format("AIPF2E.TacticalManual.AvailableSection", { count: availableActions.length }),
                emptyPrepared: game.i18n.localize("AIPF2E.TacticalManual.EmptyPrepared"),
                emptyAvailable: game.i18n.localize("AIPF2E.TacticalManual.EmptyAvailable"),
                complete: game.i18n.localize("AIPF2E.TacticalManual.Complete"),
                unprepare: game.i18n.localize("AIPF2E.TacticalManual.Unprepare"),
                prepareAction: game.i18n.localize("AIPF2E.TacticalManual.PrepareAction"),
                deleteAction: game.i18n.localize("AIPF2E.TacticalManual.DeleteAction"),
                dropHint: game.i18n.localize("AIPF2E.TacticalManual.DropHint"),
                synthesize: game.i18n.localize("AIPF2E.TacticalManual.Synthesize"),
                synthesizeAction: game.i18n.localize("AIPF2E.TacticalManual.SynthesizeAction"),
                storage: game.i18n.localize("AIPF2E.TacticalManual.Storage"),
                actionStorage: game.i18n.localize("AIPF2E.TacticalManual.ActionStorage"),
            }
        };
    }

    /**
     * 增强动作数据，添加动作符号
     */
    private enrichActionData(action: any): any {
        return {
            id: action.id,
            name: action.name,
            img: action.img,
            system: action.system,
            actionGlyph: this.getActionGlyph(action),
        };
    }

    /**
     * 渲染准备界面
     */
    render(force: boolean = false): this {
        return super.render(force) as this;
    }

    /**
     * 获取动作符号
     */
    private getActionGlyph(action: any): string {
        const actionType = action.system?.actionType?.value;
        const actions = action.system?.actions?.value;

        if (actionType === 'reaction') {
            return '⟲';
        } else if (actionType === 'free') {
            return '◈';
        } else if (actionType === 'action') {
            if (actions === 1) return '◆';
            if (actions === 2) return '◆◆';
            if (actions === 3) return '◆◆◆';
        }
        return '';
    }

    override activateListeners(html: JQuery): void {
        super.activateListeners(html);

        // 打开战术动作合成界面
        html.find('.synthesis-button').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await this.openActionSynthesis();
        });

        // 打开战术动作存储箱
        html.find('.storage-button').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await this.openActionStorage();
        });

        // 准备动作
        html.find('.prepare-action').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const actionId = $(event.currentTarget).closest('.action-item').data('action-id');
            if (actionId) {
                await this.tacticalManual.collection.prepareAction(actionId);
                this.render(false); // 重新渲染
            }
        });

        // 取消准备
        html.find('.unprepare-action').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const actionId = $(event.currentTarget).closest('.action-item').data('action-id');
            if (actionId) {
                await this.tacticalManual.collection.unprepareAction(actionId);
                this.render(false); // 重新渲染
            }
        });

        // 双击显示动作详情
        html.find('.action-item').on('dblclick', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const actionId = $(event.currentTarget).data('action-id');
            const action = this.tacticalManual.actor.items.get(actionId);
            if (action?.sheet) {
                action.sheet.render(true);
            }
        });

        // 启用动作项的拖动功能
        html.find('.action-item').each((_i: number, el: HTMLElement) => {
            el.setAttribute('draggable', 'true');
            
            el.addEventListener('dragstart', (event: DragEvent) => {
                const actionId = el.getAttribute('data-action-id');
                const action = this.tacticalManual.actor.items.get(actionId);
                if (action && event.dataTransfer) {
                    const dragData = {
                        type: 'Item',
                        itemType: 'action',
                        uuid: action.uuid,
                    };
                    event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
                    event.dataTransfer.effectAllowed = 'copy';
                }
            });
        });

        // 删除战术动作
        html.find('.delete-tactical-action').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const actionId = $(event.currentTarget).closest('.action-item').data('action-id');
            const action = this.tacticalManual.actor.items.get(actionId);
            if (action) {
                const confirmed = await Dialog.confirm({
                    title: game.i18n.localize("AIPF2E.TacticalManual.DeleteConfirmTitle"),
                    content: game.i18n.format("AIPF2E.TacticalManual.DeleteConfirmContent", { name: action.name }),
                    yes: () => true,
                    no: () => false,
                });
                if (confirmed) {
                    await action.delete();
                    this.render(false);
                }
            }
        });

        // 整个窗口作为拖放区域
        html.on('dragover', (event) => {
            event.preventDefault();
            html.addClass('drag-over');
        });

        html.on('dragleave', (event) => {
            // 只在离开窗口边界时移除样式
            if (event.currentTarget === event.target) {
                html.removeClass('drag-over');
            }
        });

        html.on('drop', async (event) => {
            event.preventDefault();
            html.removeClass('drag-over');
            
            const dataString = (event.originalEvent as DragEvent).dataTransfer?.getData('text/plain');
            if (!dataString) return;

            try {
                const data = JSON.parse(dataString);
                
                // 检查是否是Item类型
                if (data.type !== 'Item') {
                    ui.notifications?.warn(game.i18n.localize("AIPF2E.TacticalManual.OnlyActions"));
                    return;
                }

                // 获取物品数据
                let itemData: any = null;
                
                // 如果有完整的data字段（从储存箱拖入），直接使用
                if (data.data) {
                    itemData = data.data;
                } else if (data.uuid) {
                    // 否则从UUID获取（从角色卡或其他地方拖入）
                    const sourceItem = await fromUuid(data.uuid);
                    if (!sourceItem) return;
                    itemData = sourceItem.toObject();
                }
                
                if (!itemData) return;
                
                // 检查是否是动作类型
                if (itemData.type !== 'action') {
                    ui.notifications?.warn(game.i18n.localize("AIPF2E.TacticalManual.OnlyActions"));
                    return;
                }
                
                // 清理储存箱专用字段
                const cleanItemData = { ...itemData };
                delete cleanItemData.confirmed;
                delete cleanItemData.storageTimestamp;
                
                // 添加 tactic 特征
                if (!cleanItemData.system.traits.value.includes('tactic')) {
                    cleanItemData.system.traits.value.push('tactic');
                }

                // 创建到当前角色
                await this.tacticalManual.actor.createEmbeddedDocuments('Item', [cleanItemData]);
                ui.notifications?.info(game.i18n.format("AIPF2E.TacticalManual.ActionAdded", { name: cleanItemData.name }));
                this.render(false);
            } catch (error) {
                console.error('AI PF2e Assistant | 拖放错误:', error);
                ui.notifications?.error(game.i18n.localize("AIPF2E.TacticalManual.DropError"));
            }
        });
    }

    override async _updateObject(event: Event, formData: Record<string, unknown>): Promise<void> {
        // 不需要处理表单提交
    }

    /**
     * 打开战术动作合成界面
     */
    private async openActionSynthesis(): Promise<void> {
        const game = (window as any).game;
        const module = game.modules.get(MODULE_ID);
        
        if (!module?.api?.openActionSynthesis) {
            ui.notifications?.error(game.i18n.localize("AIPF2E.TacticalManual.SynthesisNotAvailable"));
            return;
        }

        // 调用模块API打开合成界面
        module.api.openActionSynthesis(this.tacticalManual.actor);
    }

    /**
     * 打开战术动作存储箱
     */
    private async openActionStorage(): Promise<void> {
        const game = (window as any).game;
        const module = game.modules.get(MODULE_ID);
        
        if (!module?.api?.openActionStorage) {
            ui.notifications?.error(game.i18n.localize("AIPF2E.TacticalManual.StorageNotAvailable"));
            return;
        }

        // 调用模块API打开存储箱
        module.api.openActionStorage(this.tacticalManual.actor);
    }
}

