/**
 * 战术手册相关类型定义
 */

export interface TacticalManualData {
    /** 最大准备槽位数 */
    maxSlots: number;
    /** 已准备的动作ID列表 */
    prepared: string[];
}

export interface TacticalManualFlags {
    tacticalManual?: TacticalManualData;
}

export const MODULE_FLAG_KEY = 'ai-pf2e-assistant';
export const TACTICAL_MANUAL_ID = 'tactical-manual';

