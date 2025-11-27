/**
 * 战术动作集合管理类
 * Tactical Action Collection Manager
 */

import { MODULE_FLAG_KEY, TacticalManualData } from './types';

export class TacticalCollection {
    private actor: any;
    private actions: Map<string, any>;

    constructor(actor: any) {
        this.actor = actor;
        this.actions = new Map();
        this.collectTacticalActions();
    }

    /**
     * 收集所有带 tactical 或 tactic 特征的动作
     */
    private collectTacticalActions(): void {
        if (!this.actor?.itemTypes?.action) return;

        const tacticalActions = this.actor.itemTypes.action.filter((action: any) => {
            const traits = action.system?.traits?.value || [];
            // 支持 "tactical" 和 "tactic" 两个特征
            return traits.includes('tactical') || traits.includes('tactic');
        });

        for (const action of tacticalActions) {
            this.actions.set(action.id, action);
        }
    }

    /**
     * 获取所有可用的战术动作
     */
    getAllActions(): any[] {
        return Array.from(this.actions.values());
    }

    /**
     * 根据ID获取动作
     */
    getAction(actionId: string): any | undefined {
        return this.actions.get(actionId);
    }

    /**
     * 获取已准备的动作列表
     */
    getPreparedActions(): any[] {
        const preparedIds = this.getPreparedActionIds();
        return preparedIds
            .map(id => this.actions.get(id))
            .filter(action => action !== undefined);
    }

    /**
     * 获取已准备的动作ID列表
     */
    getPreparedActionIds(): string[] {
        const flags = this.actor.getFlag(MODULE_FLAG_KEY, 'tacticalManual') as TacticalManualData | undefined;
        return flags?.prepared || [];
    }

    /**
     * 获取最大槽位数
     */
    getMaxSlots(): number {
        const flags = this.actor.getFlag(MODULE_FLAG_KEY, 'tacticalManual') as TacticalManualData | undefined;
        return flags?.maxSlots || 3; // 默认3个槽位
    }

    /**
     * 准备一个动作
     */
    async prepareAction(actionId: string): Promise<boolean> {
        if (!this.actions.has(actionId)) {
            return false;
        }

        const prepared = this.getPreparedActionIds();
        const maxSlots = this.getMaxSlots();

        if (prepared.includes(actionId)) {
            return true; // 已经准备过了
        }

        if (prepared.length >= maxSlots) {
            ui.notifications?.warn(`已达到最大准备槽位数 (${maxSlots})`);
            return false;
        }

        const newPrepared = [...prepared, actionId];
        await this.actor.setFlag(MODULE_FLAG_KEY, 'tacticalManual.prepared', newPrepared);
        return true;
    }

    /**
     * 取消准备一个动作
     */
    async unprepareAction(actionId: string): Promise<boolean> {
        const prepared = this.getPreparedActionIds();
        const newPrepared = prepared.filter(id => id !== actionId);

        if (prepared.length === newPrepared.length) {
            return false; // 该动作本来就没有准备
        }

        await this.actor.setFlag(MODULE_FLAG_KEY, 'tacticalManual.prepared', newPrepared);
        return true;
    }

    /**
     * 设置最大槽位数
     */
    async setMaxSlots(maxSlots: number): Promise<void> {
        if (maxSlots < 0) {
            maxSlots = 0;
        }

        await this.actor.setFlag(MODULE_FLAG_KEY, 'tacticalManual.maxSlots', maxSlots);

        // 如果当前准备的数量超过新的最大值，需要移除多余的
        const prepared = this.getPreparedActionIds();
        if (prepared.length > maxSlots) {
            const newPrepared = prepared.slice(0, maxSlots);
            await this.actor.setFlag(MODULE_FLAG_KEY, 'tacticalManual.prepared', newPrepared);
        }
    }

    /**
     * 清空所有准备的动作
     */
    async clearPrepared(): Promise<void> {
        await this.actor.setFlag(MODULE_FLAG_KEY, 'tacticalManual.prepared', []);
    }

    /**
     * 检查是否有战术动作可用
     */
    hasActions(): boolean {
        return this.actions.size > 0;
    }

    /**
     * 刷新战术动作列表（当角色的动作发生变化时调用）
     */
    refresh(): void {
        this.actions.clear();
        this.collectTacticalActions();
    }
}

