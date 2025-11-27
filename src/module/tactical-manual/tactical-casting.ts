/**
 * 战术手册施法类
 * Tactical Manual Casting Entry
 * 
 * 参考 RitualSpellcasting 的实现，作为一个独立的施法条目
 */

import { TacticalCollection } from './tactical-collection';
import { TACTICAL_MANUAL_ID } from './types';

/**
 * 战术手册施法条目
 * 
 * 这是一个内存中的施法条目，用于管理角色的战术动作准备和使用
 */
export class TacticalManualCasting {
    actor: any;
    collection: TacticalCollection;

    constructor(actor: any) {
        this.actor = actor;
        this.collection = new TacticalCollection(actor);
    }

    get id(): string {
        return TACTICAL_MANUAL_ID;
    }

    get name(): string {
        // @ts-ignore
        return game.i18n?.localize('AIPF2E.TacticalManual.Name') || '战术手册';
    }

    get sort(): number {
        // 排在所有施法条目之后，但在仪式之前
        const spellcastingEntries = this.actor.itemTypes?.spellcastingEntry || [];
        const maxSort = Math.max(0, ...spellcastingEntries.map((e: any) => e.sort || 0));
        return maxSort + 10;
    }

    get category(): string {
        return 'tactical';
    }

    get tradition(): null {
        return null;
    }

    get isFlexible(): false {
        return false;
    }

    get isFocusPool(): false {
        return false;
    }

    get isRitual(): false {
        return false;
    }

    get isEphemeral(): false {
        // 战术手册不是临时的，需要持久化准备数据
        return false;
    }

    get isPrepared(): true {
        return true;
    }

    get isSpontaneous(): false {
        return false;
    }

    get isInnate(): false {
        return false;
    }

    /**
     * 获取已准备的动作（作为 "spells" 使用）
     */
    get spells(): any {
        return {
            size: this.collection.getPreparedActions().length,
            [Symbol.iterator]: () => this.collection.getPreparedActions()[Symbol.iterator](),
        };
    }

    /**
     * 检查是否可以使用某个动作
     */
    canCast(action: any): boolean {
        if (!action || action.type !== 'action') {
            return false;
        }

        const prepared = this.collection.getPreparedActionIds();
        return prepared.includes(action.id);
    }

    /**
     * 使用一个战术动作
     * 战术动作使用时不消耗，类似戏法
     */
    async cast(action: any, options: any = {}): Promise<void> {
        if (!this.canCast(action)) {
            ui.notifications?.warn('该战术动作未准备');
            return;
        }

        // 将动作发送到聊天
        if (action.toMessage) {
            await action.toMessage(undefined, { rollMode: options.rollMode });
        } else {
            // 备用方法：手动创建聊天消息
            const chatData = {
                user: game.user?.id,
                speaker: { actor: this.actor },
                content: `<div class="pf2e chat-card">
                    <header class="card-header flexrow">
                        <img src="${action.img}" alt="${action.name}" />
                        <h3>${action.name}</h3>
                    </header>
                    <div class="card-content">
                        ${action.system?.description?.value || ''}
                    </div>
                </div>`,
                type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            };

            // @ts-ignore
            await ChatMessage.create(chatData);
        }
    }

    /**
     * 获取工作表数据
     */
    async getSheetData(): Promise<any> {
        const preparedActions = this.collection.getPreparedActions();
        const maxSlots = this.collection.getMaxSlots();

        // 构造类似法术槽位的显示结构
        const groups = [{
            id: 'prepared',
            label: '已准备的战术',
            maxRank: 0,
            uses: {
                value: preparedActions.length,
                max: maxSlots,
            },
            active: preparedActions.map(action => ({
                spell: action,
                castRank: 0,
                expended: false, // 战术动作不消耗
            })),
        }];

        return {
            id: this.id,
            name: this.name,
            statistic: null,
            tradition: null,
            category: this.category,
            isPrepared: true,
            isEphemeral: false,
            hasCollection: true,
            sort: this.sort,
            usesSpellProficiency: false,
            groups: groups,
            prepList: null,
        };
    }

    /**
     * 刷新战术动作列表
     */
    refresh(): void {
        this.collection.refresh();
    }

    /**
     * 打开准备界面
     */
    async openPreparationSheet(): Promise<void> {
        // 动态导入以避免循环依赖
        const { TacticalPreparationSheet } = await import('./preparation-sheet');
        const sheet = new TacticalPreparationSheet(this);
        sheet.render(true);
    }
}

