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
            const actionId = $(event.currentTarget).data('action-id');
            const action = this.tacticalManual.actor.items.get(actionId);
            if (action?.sheet) {
                action.sheet.render(true);
            }
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
                
                // 检查是否是动作类型
                if (data.type !== 'Item' || data.itemType !== 'action') {
                    ui.notifications?.warn(game.i18n.localize("AIPF2E.TacticalManual.OnlyActions"));
                    return;
                }

                // 创建动作副本并添加战术特征
                const sourceItem = await fromUuid(data.uuid);
                if (!sourceItem) return;

                const itemData = sourceItem.toObject();
                // 添加 tactic 特征
                if (!itemData.system.traits.value.includes('tactic')) {
                    itemData.system.traits.value.push('tactic');
                }

                // 创建到当前角色
                await this.tacticalManual.actor.createEmbeddedDocuments('Item', [itemData]);
                ui.notifications?.info(game.i18n.format("AIPF2E.TacticalManual.ActionAdded", { name: itemData.name }));
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
}

