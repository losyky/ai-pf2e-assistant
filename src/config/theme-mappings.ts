/**
 * 主题映射配置
 * 支持不同主题的文本和概念映射
 */

export interface ThemeMapping {
  id: string;
  name: string;
  description: string;
  
  // 核心概念映射
  concepts: {
    // 神龛系统 -> 爱达梦系统
    shrine: string;           // 神龛 -> 爱达梦训练场
    divinity: string;         // 神性材料 -> 指导
    offering: string;         // 贡品 -> 爱达梦技能
    fragment: string;         // 碎片 -> 爱达梦球
    synthesis: string;        // 合成 -> 融合
    feat: string;             // 专长 -> 特性
    sacred: string;           // 神圣 -> 神奇
    blessing: string;         // 祝福 -> 祝福
    power: string;            // 力量 -> 能力
    altar: string;            // 祭坛 -> 融合台
  };
  
  // 主题颜色配置
  colors: {
    primary: string;          // 主色调
    secondary: string;        // 辅助色
    background: string;       // 背景色
    ringGlow: string;         // 合成环发光色
    connectionLine: string;   // 连接线颜色
  };
  
  // UI文本映射
  ui: {
    // 窗口标题
    synthesisTitle: string;   // 神龛合成 -> 爱达梦学习
    
    // 材料类型
    materialTypes: {
      divinity: string;       // 神性材料 -> 指导
      offering: string;       // 贡品材料 -> 技能机
      fragment: string;       // 碎片材料 -> 爱达梦球
      shrine: string;         // 神龛 -> 爱达梦训练场
    };
    
    // 按钮文本
    buttons: {
      synthesize: string;     // 开始合成 -> 开始融合
      synthesisButton: string; // 合成专长 -> 学习特性
      import: string;         // 导入专长 -> 学习特性
      clear: string;          // 清空材料 -> 清空材料
      close: string;          // 关闭 -> 关闭
    };
    
    // 提示信息
    messages: {
      selectShrine: string;           // 请选择神龛 -> 请选择爱达梦训练场
      addMaterials: string;           // 添加合成材料 -> 添加融合材料
      synthesisComplete: string;      // 神圣合成完成 -> 融合完成
      synthesisStarted: string;       // 神明开始工作 -> 开始融合过程
      importSuccess: string;          // 专长已导入 -> 特性已学习
      importFailed: string;           // 导入失败 -> 学习失败
      invalidMaterial: string;        // 无效材料 -> 无效材料
      materialAdded: string;          // 材料已添加 -> 材料已添加
      materialExists: string;         // 材料已存在 -> 材料已存在
      shrineSelected: string;         // 神龛已选择 -> 中心已选择
      requirementsNotMet: string;     // 需求未满足 -> 条件未满足
      // 新增UI文字
      blessing: string;               // 神明的恩赐 -> 爱达梦的祝福
      synthesisAction: string;        // 进行神圣合成 -> 开始学习
      synthesisButton: string;        // 启动神圣合成 -> 开始学习
      dragShrineHere: string;         // 拖拽神龛到此 -> 拖拽训练场到此
      clearMaterials: string;         // 清空材料 -> 清空材料
      description: string;            // 描述文字 -> 描述文字
      progressWorking: string;        // 工作进度 -> 工作进度
      progressPreparing: string;      // 准备中 -> 准备中
      synthesisCompleteTitle: string; // 完成标题 -> 完成标题
    };
    
    // 描述文本
    descriptions: {
      shrineSystem: string;           // 神龛系统说明 -> 爱达梦学习系统说明
      materialSystem: string;         // 材料系统说明 -> 融合材料说明
      synthesisProcess: string;       // 合成过程说明 -> 融合过程说明
    };
  };
  
  // AI提示词映射
  prompts: {
    systemRole: string;               // 神龛合成师 -> 爱达梦学习师
    synthesisContext: string;         // 神圣合成 -> 爱达梦学习
    materialContext: string;          // 神圣材料 -> 融合材料
    resultContext: string;            // 神明赐予 -> 融合产生
  };
}

// 默认主题（神龛主题）
export const SHRINE_THEME: ThemeMapping = {
  id: 'shrine',
  name: '神龛主题',
  description: '经典的神龛合成系统',
  
  concepts: {
    shrine: '神龛',
    divinity: '神性',
    offering: '贡品',
    fragment: '碎片',
    synthesis: '合成',
    feat: '专长',
    sacred: '神圣',
    blessing: '祝福',
    power: '力量',
    altar: '祭坛'
  },
  
  colors: {
    primary: '#8b4a9c',         // 神秘紫色
    secondary: '#6f42c1',       // 深紫色
    background: '#2a1d3a',      // 深紫背景
    ringGlow: '#b347d1',        // 紫色发光
    connectionLine: '#9d4edd'   // 紫色连接线
  },
  
  ui: {
    synthesisTitle: '神龛合成',
    
    materialTypes: {
      divinity: '神性材料',
      offering: '贡品材料',
      fragment: '碎片材料',
      shrine: '神龛'
    },
    
    buttons: {
      synthesize: '开始合成',
      synthesisButton: '合成专长',
      import: '导入专长',
      clear: '清空材料',
      close: '关闭'
    },
    
    messages: {
      selectShrine: '请将神龛拖拽到中央位置以开始合成',
      addMaterials: '请添加合成材料到对应环上',
      synthesisComplete: '神圣合成完成！神明赐予了新的力量。',
      synthesisStarted: '神明开始工作，请稍候...',
      importSuccess: '专长已成功导入',
      importFailed: '专长导入失败',
      invalidMaterial: '无效的合成材料',
      materialAdded: '已添加材料',
      materialExists: '该材料已经添加过了',
      shrineSelected: '已选择神龛',
      requirementsNotMet: '合成需求未满足',
      // 新增UI文字
      blessing: '神明的恩赐',
      synthesisAction: '进行神圣合成',
      synthesisButton: '启动神圣合成',
      dragShrineHere: '拖拽神龛到此',
      clearMaterials: '清空材料',
      description: '在神龛的指引下合成神圣专长',
      progressWorking: '神明正在施展神圣仪式...',
      progressPreparing: '准备中...',
      synthesisCompleteTitle: '神明恩赐已降临！'
    },
    
    descriptions: {
      shrineSystem: '神龛系统允许你通过神圣仪式合成强大的专长',
      materialSystem: '收集神性材料、贡品和碎片来进行神圣合成',
      synthesisProcess: '将材料放入神龛中，让神明为你创造新的力量'
    }
  },
  
  prompts: {
    systemRole: '神龛合成师',
    synthesisContext: '神圣合成',
    materialContext: '神圣材料',
    resultContext: '神明赐予'
  }
};

// 爱达梦主题
export const POKEMON_THEME: ThemeMapping = {
  id: 'pokemon',
  name: '爱达梦主题',
  description: '爱达梦世界的学习系统',
  
  concepts: {
    shrine: '爱达梦训练场',
    divinity: '指导',
    offering: '技能',
    fragment: '个性',
    synthesis: '学习',
    feat: '特性',
    sacred: '神奇',
    blessing: '祝福',
    power: '能力',
    altar: '学习台'
  },
  
  colors: {
    primary: '#4a9eff',         // 明亮蓝色
    secondary: '#2196f3',       // 标准蓝色
    background: '#e3f2fd',      // 淡蓝背景
    ringGlow: '#64b5f6',        // 淡蓝发光
    connectionLine: '#42a5f5'   // 蓝色连接线
  },
  
  ui: {
    synthesisTitle: '爱达梦学习',
    
    materialTypes: {
      divinity: '指导',
      offering: '技能机',
      fragment: '个性',
      shrine: '爱达梦训练场'
    },
    
    buttons: {
      synthesize: '开始学习',
      synthesisButton: '学习特性',
      import: '学习特性',
      clear: '清空材料',
      close: '关闭'
    },
    
    messages: {
      selectShrine: '请将爱达梦训练场拖拽到中央位置以开始学习',
      addMaterials: '请添加学习材料到对应环上',
      synthesisComplete: '学习完成！获得了新的特性。',
      synthesisStarted: '开始学习过程，请稍候...',
      importSuccess: '特性已成功学习',
      importFailed: '特性学习失败',
      invalidMaterial: '无效的学习材料',
      materialAdded: '已添加材料',
      materialExists: '该材料已经添加过了',
      shrineSelected: '已选择爱达梦训练场',
      requirementsNotMet: '学习条件未满足',
      // 新增UI文字
      blessing: '爱达梦的祝福',
      synthesisAction: '开始学习',
      synthesisButton: '开始学习',
      dragShrineHere: '拖拽训练场到此',
      clearMaterials: '清空材料',
      description: '在爱达梦训练场的指引下学习新特性',
      progressWorking: '爱达梦正在学习过程中...',
      progressPreparing: '准备学习...',
      synthesisCompleteTitle: '学习完成！新特性已获得！'
    },
    
    descriptions: {
      shrineSystem: '爱达梦学习系统允许你通过特殊技术创造新的特性',
      materialSystem: '收集指导、技能机和个性来进行学习',
      synthesisProcess: '将材料放入学习台中，创造全新的爱达梦特性'
    }
  },
  
  prompts: {
    systemRole: '爱达梦学习师',
    synthesisContext: '爱达梦学习',
    materialContext: '学习材料',
    resultContext: '学习产生'
  }
};

// 所有可用主题
export const AVAILABLE_THEMES: ThemeMapping[] = [
  SHRINE_THEME,
  POKEMON_THEME
];

// 根据ID获取主题
export function getThemeById(id: string): ThemeMapping {
  return AVAILABLE_THEMES.find(theme => theme.id === id) || SHRINE_THEME;
}

// 获取当前激活的主题
export function getCurrentTheme(): ThemeMapping {
  // 直接返回神龛主题，不再依赖配置
  return SHRINE_THEME;
}
