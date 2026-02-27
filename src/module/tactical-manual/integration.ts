/**
 * 战术手册系统集成
 * Integrate Tactical Manual into Actor System
 */

import { TacticalManualCasting } from './tactical-casting';
import { TacticalPreparationSheet } from './preparation-sheet';

const MODULE_ID = 'ai-pf2e-assistant';

function isTacticalManualEnabled(): boolean {
    try {
        // @ts-ignore
        const game = (window as any).game;
        return game?.settings?.get(MODULE_ID, 'tacticalManualEnabled') !== false;
    } catch {
        return true;
    }
}

// 存储每个角色的战术手册实例
const tacticalManualInstances = new Map<string, TacticalManualCasting>();

/**
 * 检查动作是否为战术动作
 */
function isTacticalAction(action: any): boolean {
    const traits = action.system?.traits?.value || [];
    return traits.includes('tactical') || traits.includes('tactic');
}

/**
 * 为角色获取或创建战术手册实例
 */
function getTacticalManual(actor: any): TacticalManualCasting | null {
    if (!actor || !actor.id) return null;

    // 只为玩家角色和NPC提供战术手册
    if (!['character', 'npc'].includes(actor.type)) {
        return null;
    }

    // 检查角色是否有战术动作（支持 "tactical" 和 "tactic" 两个特征）
    const actions = actor.itemTypes?.action || [];
    const tacticalActions = actions.filter(isTacticalAction);

    if (tacticalActions.length === 0) {
        // 如果没有战术动作，清理可能存在的实例
        tacticalManualInstances.delete(actor.id);
        return null;
    }

    // 获取或创建实例
    let manual = tacticalManualInstances.get(actor.id);
    if (!manual) {
        manual = new TacticalManualCasting(actor);
        tacticalManualInstances.set(actor.id, manual);
        console.log(`AI PF2e Assistant | 为角色 "${actor.name}" 创建战术手册`);
    } else {
        // 刷新以确保动作列表是最新的
        manual.refresh();
    }

    return manual;
}

/**
 * 集成战术手册到角色施法系统
 */
export function integrateTacticalManual(): void {
    // 在角色表渲染时注入战术手册UI并隐藏常规动作区域的战术动作
    // @ts-ignore
    Hooks.on('renderActorSheet', async (app: any, html: any, data: any) => {
        if (!isTacticalManualEnabled()) return;

        const actor = app.actor;
        if (!actor) return;
        
        // 只处理角色表（Character Sheet），不处理其他窗口
        if (!app.constructor.name.includes('CharacterSheet') && !app.constructor.name.includes('NPCSheet')) {
            return;
        }

        // 1. 首先从DOM中移除所有常规动作区域的战术动作
        const hasTacticalActions = actor.itemTypes?.action?.some(isTacticalAction);
        if (hasTacticalActions) {
            html.find('.actions-list .action[data-item-id]').each((_i: number, el: HTMLElement) => {
                const itemId = el.getAttribute('data-item-id');
                const item = actor.items.get(itemId);
                if (item && isTacticalAction(item)) {
                    // 隐藏这个动作
                    $(el).remove();
                }
            });
        }

        // 2. 然后添加战术手册
        const tacticalManual = getTacticalManual(actor);
        if (!tacticalManual) return;

        // 在启动标签页添加战术手册
        await addTacticalManualToSheet(app, html, tacticalManual);
    });

    // 在角色数据更新时刷新战术手册
    // @ts-ignore
    Hooks.on('updateActor', (actor: any, changes: any, options: any, userId: string) => {
        if (!isTacticalManualEnabled()) return;
        const manual = tacticalManualInstances.get(actor.id);
        if (manual) {
            manual.refresh();
        }
    });

    // 在创建/删除动作时刷新战术手册
    // @ts-ignore
    Hooks.on('createItem', (item: any, options: any, userId: string) => {
        if (!isTacticalManualEnabled()) return;
        if (item.type === 'action' && item.actor) {
            const manual = tacticalManualInstances.get(item.actor.id);
            if (manual) {
                manual.refresh();
            }
        }
    });

    // @ts-ignore
    Hooks.on('deleteItem', (item: any, options: any, userId: string) => {
        if (!isTacticalManualEnabled()) return;
        if (item.type === 'action' && item.actor) {
            const manual = tacticalManualInstances.get(item.actor.id);
            if (manual) {
                manual.refresh();
            }
        }
    });

    console.log('AI PF2e Assistant | 战术手册集成已启用');
}

/**
 * 在角色表中添加战术手册UI
 */
async function addTacticalManualToSheet(app: any, html: any, tacticalManual: TacticalManualCasting): Promise<void> {
    // 查找"启动"标签页的"遭遇"子标签中的动作列表
    const actionsTab = html.find('.tab[data-tab="actions"] .actions-panel[data-tab="encounter"]');
    
    
    if (actionsTab.length === 0) {
        return;
    }

    // 检查是否有战术动作，如果没有则直接返回
    const allTacticalActions = tacticalManual.collection.getAllActions();
    if (allTacticalActions.length === 0) {
        return; // 没有战术动作，不显示战术手册
    }

    // 获取战术手册数据
    const preparedActions = tacticalManual.collection.getPreparedActions();
    const maxSlots = tacticalManual.collection.getMaxSlots();
    const actor = app.actor;


    // 构建战术手册HTML - 完全仿照PF2e原生的动作区域结构
    // 使用AIPF2E命名空间
    const tacticalName = game.i18n.localize("AIPF2E.TacticalManual.Name");
    const prepareButtonText = game.i18n.localize("AIPF2E.TacticalManual.Prepare");
    
    const tacticalHTML = `
        <header>
            ${tacticalName}
            ${app.options.editable ? `
            <div class="controls">
                <button type="button" class="tactical-prepare" data-tooltip="${prepareButtonText}">
                    <i class="fa-solid fa-fw fa-book-sparkles"></i> ${prepareButtonText}
                </button>
                <button type="button" class="tactical-config" data-tooltip="${game.i18n.localize("PF2E.SETTINGS.Settings")}">
                    <i class="fa-solid fa-fw fa-cog"></i>
                </button>
            </div>
            ` : ''}
        </header>
        
        <ol class="actions-list item-list directory-list tactical-actions-list">
            ${preparedActions.length > 0 ? preparedActions.filter(action => action).map(action => {
                const actionGlyph = action.actionCost?.value || '';
                const actionType = action.system?.actionType?.value || 'action';
                return `
                <li class="action item tactical-action" data-item-id="${action.id}" data-item-summary-id="action-${action.id}">
                    <a class="icon item-image framed" data-action="item-to-chat">
                        <img src="${action.img}" />
                        <i class="fa-solid fa-message"></i>
                    </a>

                    <h4 class="name">
                        <a data-action="toggle-summary">${action.name}</a>
                    </h4>

                    <div class="button-group">
                        ${actionType !== 'passive' ? `
                        <button type="button" class="use-action" data-action="use-action">
                            <span>使用</span>
                            ${actionGlyph ? `<span class="action-glyph">${actionGlyph}</span>` : ''}
                        </button>
                        ` : ''}
                    </div>

                    <div class="item-controls" data-tooltip-direction="UP">
                        ${app.options.editable ? `
                            <a data-action="edit-item" data-tooltip="编辑"><i class="fa-solid fa-fw fa-edit"></i></a>
                            <a class="tactical-unprepare" data-action="unprepare-tactical" data-tooltip="取消准备"><i class="fa-solid fa-fw fa-trash"></i></a>
                        ` : ''}
                    </div>

                    <div class="item-summary" hidden="hidden"></div>
                </li>
                `;
            }).join('') : '<li class="empty-message">没有准备的战术动作</li>'}
        </ol>
    `;

    // 插入到遭遇标签的末尾（在所有其他动作区域之后）
    actionsTab.append(tacticalHTML);

    // 绑定事件
    bindTacticalManualEvents(html, app.actor, tacticalManual);
}

/**
 * 绑定战术手册相关事件
 */
function bindTacticalManualEvents(html: any, actor: any, tacticalManual: TacticalManualCasting): void {
    // 使用事件委托绑定所有战术手册相关事件
    const tacticalSection = html.find('.tactical-actions-list').parent();

    // 打开准备界面
    tacticalSection.on('click', '.tactical-prepare', async (event: any) => {
        event.preventDefault();
        event.stopPropagation();
        new TacticalPreparationSheet(tacticalManual).render(true);
    });

    // 打开配置对话框
    tacticalSection.on('click', '.tactical-config', async (event: any) => {
        event.preventDefault();
        event.stopPropagation();
        await openTacticalConfigDialog(actor, tacticalManual);
    });

    // 点击图标发送到聊天
    tacticalSection.on('click', '.tactical-action [data-action="item-to-chat"]', async (event: any) => {
        event.preventDefault();
        event.stopPropagation();
        const actionId = $(event.currentTarget).closest('.tactical-action').data('item-id');
        const action = actor.items.get(actionId);
        if (action) {
            await action.toMessage();
        }
    });

    // 点击名称展开/收起详情
    tacticalSection.on('click', '.tactical-action [data-action="toggle-summary"]', async (event: any) => {
        event.preventDefault();
        event.stopPropagation();
        const li = $(event.currentTarget).closest('.tactical-action');
        const actionId = li.data('item-id');
        const action = actor.items.get(actionId);
        
        if (!action) return;

        // 查找或创建summary元素
        let summary = li.find('.item-summary');
        
        if (summary.is(':visible')) {
            // 如果已经展开，就收起
            summary.slideUp(200, () => summary.attr('hidden', 'hidden'));
        } else {
            // 如果未展开，就展开并填充内容
            if (summary.children().length === 0) {
                // 获取动作描述
                const chatData = await action.getChatData();
                summary.html(await renderTemplate('systems/pf2e/templates/actors/partials/item-summary.hbs', chatData));
            }
            summary.removeAttr('hidden').hide().slideDown(200);
        }
    });

    // 使用动作按钮
    tacticalSection.on('click', '.tactical-action [data-action="use-action"]', async (event: any) => {
        event.preventDefault();
        event.stopPropagation();
        const actionId = $(event.currentTarget).closest('.tactical-action').data('item-id');
        const action = actor.items.get(actionId);
        if (action && typeof action.use === 'function') {
            await action.use();
        } else if (action) {
            await action.toMessage();
        }
    });

    // 编辑动作
    tacticalSection.on('click', '.tactical-action [data-action="edit-item"]', async (event: any) => {
        event.preventDefault();
        event.stopPropagation();
        const actionId = $(event.currentTarget).closest('.tactical-action').data('item-id');
        const action = actor.items.get(actionId);
        if (action) {
            action.sheet?.render(true);
        }
    });

    // 取消准备（从战术手册移除，但不删除动作）
    tacticalSection.on('click', '.tactical-action [data-action="unprepare-tactical"]', async (event: any) => {
        event.preventDefault();
        event.stopPropagation();
        const actionId = $(event.currentTarget).closest('.tactical-action').data('item-id');
        await tacticalManual.collection.unprepareAction(actionId);
        // 刷新角色表
        actor.sheet?.render(false);
    });

    // 启用拖动功能 - 设置战术动作可拖动
    tacticalSection.find('.tactical-action').each((_i: number, el: HTMLElement) => {
        el.setAttribute('draggable', 'true');
        
        el.addEventListener('dragstart', (event: DragEvent) => {
            const itemId = el.getAttribute('data-item-id');
            const action = actor.items.get(itemId);
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
}

/**
 * 打开战术手册配置对话框
 */
async function openTacticalConfigDialog(actor: any, tacticalManual: TacticalManualCasting): Promise<void> {
    const currentMaxSlots = tacticalManual.collection.getMaxSlots();

    const g = (game as any).i18n;
    // @ts-ignore
    new Dialog({
        title: g.localize('AIPF2E.TacticalManual.ConfigTitle'),
        content: `
            <form>
                <div class="form-group">
                    <label>${g.localize('AIPF2E.TacticalManual.ConfigMaxSlots')}</label>
                    <input type="number" name="maxSlots" value="${currentMaxSlots}" min="0" max="20" />
                </div>
            </form>
        `,
        buttons: {
            save: {
                icon: '<i class="fas fa-check"></i>',
                label: g.localize('AIPF2E.TacticalManual.Save'),
                callback: async (html: any) => {
                    const maxSlots = parseInt(html.find('[name="maxSlots"]').val() || '5');
                    await tacticalManual.collection.setMaxSlots(maxSlots);
                    ui.notifications?.info(g.format('AIPF2E.TacticalManual.SlotsUpdated', { slots: maxSlots }));
                    // 刷新角色表
                    actor.sheet?.render(false);
                },
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: g.localize('AIPF2E.TacticalManual.Cancel'),
            },
        },
        default: 'save',
    }).render(true);
}

