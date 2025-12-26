import { AIService } from './ai-service';
import { PF2eMechanicsKnowledgeService } from './pf2e-mechanics-knowledge';

/**
 * 词条碎片数据接口
 */
export interface FragmentData {
  name: string;
  description: string;
  hiddenPrompt: string;
  rarity?: 'common' | 'uncommon' | 'rare' | 'unique';
  value?: number; // 物品价值
}

/**
 * 碎片集合设计方案接口
 * 第一阶段智能体的输出
 */
export interface FragmentSetPlan {
  overallTheme: string; // 整体主题描述
  fragments: Array<{
    designDirection: string; // 单个碎片的设计方向
    subTheme: string; // 子主题（如：火元素、防御向、进攻向等）
    suggestedRarity: 'common' | 'uncommon' | 'rare' | 'unique'; // 建议稀有度
  }>;
}

/**
 * PF2e词条碎片物品格式
 */
export interface PF2eFragmentFormat {
  name: string;
  type: "equipment";
  img: string;
  system: {
    description: {
      value: string; // 包含可见描述和隐藏提示词
      gm: string;
    };
    traits: {
      value: string[];
      rarity: "common" | "uncommon" | "rare" | "unique";
      otherTags: string[];
    };
    quantity: number;
    weight: {
      value: number;
    };
    price: {
      value: {
        cp?: number;
        sp?: number;
        gp?: number;
        pp?: number;
      };
    };
    level: {
      value: number;
    };
    usage: {
      value: string;
    };
    category: string;
    group: null;
    hands: null;
    bulk: {
      value: number;
    };
    activated: null;
    rules: any[];
  };
  effects: any[];
  folder: null;
  flags: {
    'ai-pf2e-assistant': {
      fragmentType: 'feat-fragment';
      hiddenPrompt: string;
    };
  };
}

/**
 * 词条碎片生成器服务
 * 为GM提供创建包含隐藏AI提示词的词条碎片物品的功能
 */
export class FragmentGeneratorService {
  private aiService: AIService;
  private mechanicsKnowledge: PF2eMechanicsKnowledgeService;

  constructor(aiService: AIService) {
    this.aiService = aiService;
    this.mechanicsKnowledge = PF2eMechanicsKnowledgeService.getInstance();
  }

  /**
   * 安全解析AI响应的JSON
   * @param response AI响应，可能是字符串或对象
   * @returns 解析后的对象
   */
  private parseAIResponse(response: any): any {
    console.log('原始AI响应:', response);
    
    // 如果响应已经是对象，检查是否是API响应格式
    if (typeof response === 'object' && response !== null) {
      // 处理 OpenAI API 响应格式
      if (response.choices && response.choices.length > 0) {
        const content = response.choices[0].message?.content;
        if (content) {
          console.log('从API响应中提取内容:', content);
          return this.parseAIResponse(content); // 递归解析内容
        }
      }
      
      // 如果已经是我们需要的格式，直接返回
      if (response.name && response.description && response.hiddenPrompt) {
        return response;
      }
      
      // 其他对象格式，尝试转换为字符串再解析
      response = JSON.stringify(response);
    }
    
    // 如果是字符串，进行文本清理和解析
    if (typeof response === 'string') {
      // 清理响应文本
      let cleanResponse = response.trim();
      
      // 移除可能的markdown代码块标记
      cleanResponse = cleanResponse.replace(/```json\s*/gi, '');
      cleanResponse = cleanResponse.replace(/```\s*/g, '');
      
      // 移除可能的前导说明文字
      const jsonStartIndex = cleanResponse.indexOf('{');
      const jsonEndIndex = cleanResponse.lastIndexOf('}');
      
      if (jsonStartIndex !== -1 && jsonEndIndex !== -1 && jsonEndIndex > jsonStartIndex) {
        cleanResponse = cleanResponse.substring(jsonStartIndex, jsonEndIndex + 1);
      }
      
      console.log('清理后的响应:', cleanResponse);
      
      try {
        return JSON.parse(cleanResponse);
      } catch (error) {
        console.error('JSON解析失败:', error);
        throw new Error(`无法解析AI响应为JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    throw new Error('无法识别的AI响应格式');
  }

  /**
   * 生成词条碎片物品
   * @param fragmentData 碎片数据
   * @returns PF2e格式的碎片物品
   */
  async generateFragment(fragmentData: FragmentData): Promise<PF2eFragmentFormat> {
    console.log('开始生成词条碎片:', fragmentData.name);

    // 构建包含隐藏提示词的描述HTML
    const descriptionHtml = this.buildFragmentDescription(
      fragmentData.description,
      fragmentData.hiddenPrompt
    );

    // 生成碎片物品的基本信息
    const fragmentItem: PF2eFragmentFormat = {
      name: fragmentData.name,
      type: "equipment",
      img: "icons/sundries/misc/admission-ticket-white.webp", // 默认碎片图标
      system: {
        description: {
          value: descriptionHtml,
          gm: `隐藏提示词: ${fragmentData.hiddenPrompt}`
        },
        traits: {
          value: ["magical", "fragment"], // 添加魔法和碎片特性
          rarity: fragmentData.rarity || "common",
          otherTags: []
        },
        quantity: 1,
        weight: {
          value: 0.1 // 很轻的物品
        },
        price: {
          value: {
            gp: fragmentData.value || 0
          }
        },
        level: {
          value: 1 // 碎片本身等级为1
        },
        usage: {
          value: "held-in-one-hand"
        },
        category: "other",
        group: null,
        hands: null,
        bulk: {
          value: 0 // 无体积
        },
        activated: null,
        rules: [] // 碎片本身无规则效果
      },
      effects: [],
      folder: null,
      flags: {
        'ai-pf2e-assistant': {
          fragmentType: 'feat-fragment',
          hiddenPrompt: fragmentData.hiddenPrompt
        }
      }
    };

    console.log('词条碎片生成完成:', fragmentItem.name);
    return fragmentItem;
  }

  /**
   * 构建包含隐藏提示词的描述HTML
   * @param visibleDescription 可见描述
   * @param hiddenPrompt 隐藏的AI提示词
   * @returns HTML格式的描述
   */
  private buildFragmentDescription(visibleDescription: string, hiddenPrompt: string): string {
    return `
      <p>${visibleDescription}</p>
      <hr />
      <p><em>这块古老的词条碎片散发着微弱的魔法光芒，似乎蕴含着某种知识或技能的片段。它可以与其他类似的碎片结合，创造出新的能力。</em></p>
      <section class="secret" style="display: none;">
        <h4>AI提示词内容</h4>
        <p>${hiddenPrompt}</p>
      </section>
    `;
  }

  /**
   * 从现有物品中提取隐藏提示词
   * @param item PF2e物品对象
   * @returns 提示词内容，如果不是碎片则返回null
   */
  static extractHiddenPrompt(item: any): string | null {
    try {
      // 首先从标准的GM描述字段获取隐藏提示词
      const gmDescription = item.system?.description?.gm || '';
      if (gmDescription.trim()) {
        return gmDescription.trim();
      }

      // 回退：检查flags中是否有隐藏提示词（兼容旧数据）
      if (item.flags?.['ai-pf2e-assistant']?.hiddenPrompt) {
        return item.flags['ai-pf2e-assistant'].hiddenPrompt;
      }

      // 最后尝试从描述HTML中解析secret section
      const description = item.system?.description?.value || '';
      const secretMatch = description.match(/<section[^>]*class[^>]*secret[^>]*>(.*?)<\/section>/si);
      
      if (secretMatch) {
        // 提取section内的文本，去除HTML标签
        const secretContent = secretMatch[1];
        const textMatch = secretContent.match(/<p[^>]*>(.*?)<\/p>/si);
        if (textMatch) {
          return textMatch[1].trim();
        }
      }

      return null;
    } catch (error) {
      console.error('提取隐藏提示词时出错:', error);
      return null;
    }
  }

  /**
   * 检查物品是否为词条碎片
   * @param item PF2e物品对象
   * @returns 是否为词条碎片
   */
  static isFragment(item: any): boolean {
    // 检查flags标记
    if (item.flags?.['ai-pf2e-assistant']?.fragmentType === 'feat-fragment') {
      return true;
    }

    // 检查描述中是否包含secret section
    const description = item.system?.description?.value || '';
    return description.includes('<section class="secret"');
  }

  /**
   * 批量生成相关主题的碎片集合（两阶段智能体）
   * @param theme 主题描述
   * @param count 碎片数量
   * @returns 碎片数组
   */
  async generateFragmentSet(theme: string, count: number = 3): Promise<PF2eFragmentFormat[]> {
    console.log(`开始生成${count}个关于"${theme}"主题的碎片集合`);

    // 第一阶段：规划智能体 - 设计碎片集合的整体方案
    console.log('【阶段1/2】规划碎片集合的整体设计方向...');
    const plan = await this.planFragmentSet(theme, count);
    console.log('整体规划完成:', plan);

    // 第二阶段：执行智能体 - 根据规划生成具体碎片
    console.log('【阶段2/2】根据设计方向生成具体碎片...');
    const fragments: PF2eFragmentFormat[] = [];
    
    for (let i = 0; i < plan.fragments.length; i++) {
      const fragmentPlan = plan.fragments[i];
      console.log(`生成碎片 ${i + 1}/${count}: ${fragmentPlan.subTheme}`);
      
      // 根据规划的设计方向生成碎片
      const fragmentData = await this.generateFragmentFromPlan(
        fragmentPlan,
        plan.overallTheme,
        i + 1,
        count
      );
      const fragment = await this.generateFragment(fragmentData);
      fragments.push(fragment);
    }

    console.log(`碎片集合生成完成，共${fragments.length}个碎片`);
    return fragments;
  }

  /**
   * 第一阶段：规划智能体 - 设计碎片集合的整体方案
   * @param theme 主题描述
   * @param count 碎片数量
   * @returns 碎片集合设计方案
   */
  private async planFragmentSet(theme: string, count: number): Promise<FragmentSetPlan> {
    // 检测系统语言
    const game = (window as any).game;
    const systemLang = game?.i18n?.lang || 'en';
    const isChinese = systemLang.startsWith('zh') || systemLang === 'cn';
    
    console.log(`[碎片集合规划] 系统语言: ${systemLang}, 使用中文提示词: ${isChinese}`);
    
    const messages = [
      {
        role: 'system' as const,
        content: isChinese 
          ? `你是一个专业的TTRPG内容设计师，负责规划碎片集合的整体设计。
你的任务是根据主题，设计一个协调统一且富有变化的碎片集合方案。

**🌏 语言要求（最高优先级）**：
- 所有内容必须使用中文（包括主题描述、子主题名称、设计方向等）
- 绝对不要使用英文

**设计原则**：
1. 确保碎片之间有明确的区分（不同的子主题或侧重点）
2. 保持整体的主题统一性
3. 考虑碎片之间的协同潜力（在神龛合成中配合使用）
4. 合理分配稀有度，形成梯度

**主题类型识别**：
- **剧情经历型主题**：如果主题包含具体的冒险经历、战斗场景、角色互动等剧情元素
  - 提取经历中的关键情感、力量或转折点
  - 每个碎片代表经历的不同侧面或阶段
  - 示例：从"与火龙的生死战斗"中提取"炽热的危机感"、"绝境中的反击"、"龙威的余韵"
- **抽象概念型主题**：如果主题是元素、概念或抽象力量
  - 围绕主题的不同侧面或表现形式展开
  - 示例：从"火焰"中分解为"爆裂的烈焰"、"温暖的余烬"、"灼烧的意志"

**特别注意**：
- 如果主题描述了剧情经历，将其转化为意象和情感碎片
- 如果主题涉及多个元素/方面，应该确保覆盖到各个方面
- 每个碎片应该有独特的子主题，避免重复
- 设计方向应该具体明确，能指导后续的创作
- 碎片是意象和记忆，不是事件本身

请严格按照以下JSON格式返回，不要包含任何其他文本：

{
  "overallTheme": "整体主题的概括描述（中文）",
  "fragments": [
    {
      "subTheme": "子主题名称（如：火元素、防御向、治疗向）",
      "designDirection": "具体的设计方向描述，应包含：1）核心概念 2）风格倾向 3）建议的能力类型",
      "suggestedRarity": "common/uncommon/rare/unique"
    }
  ]
}`
          : `You are a professional TTRPG content designer responsible for planning fragment set designs.
Your task is to design a coordinated yet varied fragment set plan based on the theme.

**🌏 Language Requirement (Highest Priority)**：
- All content must be in English (including theme descriptions, sub-themes, design directions, etc.)
- Absolutely no Chinese characters

**Design Principles**：
1. Ensure clear distinctions between fragments (different sub-themes or focuses)
2. Maintain overall thematic unity
3. Consider synergy potential between fragments (for shrine synthesis combinations)
4. Reasonable rarity distribution with gradation

**Theme Type Recognition**：
- **Story Experience Theme**: If the theme contains specific adventure experiences, combat scenes, character interactions, etc.
  - Extract key emotions, powers, or turning points from the experience
  - Each fragment represents a different aspect or phase of the experience
  - Example: From "Life-or-death battle with fire dragon" extract "Scorching sense of crisis", "Counterattack in desperation", "Lingering dragonawe"
- **Abstract Concept Theme**: If the theme is an element, concept, or abstract power
  - Develop different aspects or manifestations of the theme
  - Example: From "Fire" break down into "Explosive flames", "Warm embers", "Burning will"

**Special Notes**：
- If the theme describes story experiences, transform them into imagery and emotional fragments
- If the theme involves multiple elements/aspects, ensure all aspects are covered
- Each fragment should have a unique sub-theme, avoid duplication
- Design directions should be specific and clear to guide subsequent creation
- Fragments are imagery and memories, not events themselves

Please return strictly in the following JSON format, without any other text:

{
  "overallTheme": "Overall theme summary description (English)",
  "fragments": [
    {
      "subTheme": "Sub-theme name (e.g., Fire Element, Defensive, Healing)",
      "designDirection": "Specific design direction description, should include: 1) Core concept 2) Style tendency 3) Suggested ability types",
      "suggestedRarity": "common/uncommon/rare/unique"
    }
  ]
}`
      },
      {
        role: 'user' as const,
        content: isChinese
          ? `主题/经历：${theme}
碎片数量：${count}

请为这个主题设计一个包含${count}个碎片的整体方案。

**任务说明**：
1. 识别主题类型（剧情经历 or 抽象概念）
2. 如果是剧情经历，提取其中的关键情感、力量或意象，而非具体事件
3. 确保每个碎片有明确的区分和独特的价值
4. 碎片是意象和记忆的结晶，应该让玩家回忆起那段经历的感受

注意：碎片只提供风味元素和效果内容，不负责机制设计。记住：所有内容必须使用中文。`
          : `Theme/Experience: ${theme}
Fragment Count: ${count}

Please design an overall plan containing ${count} fragments for this theme.

**Task Instructions**:
1. Identify theme type (story experience or abstract concept)
2. If story experience, extract key emotions, powers, or imagery rather than specific events
3. Ensure each fragment has clear distinctions and unique value
4. Fragments are crystallizations of imagery and memory, should evoke the feelings of that experience

Note: Fragments only provide flavor elements and effect content, not mechanism design. Remember: All content must be in English.`
      }
    ];

    try {
      // 不指定模型，使用通用配置中的模型
      const response = await this.aiService.callService(messages);
      const plan = this.parseAIResponse(response) as FragmentSetPlan;
      
      // 验证方案
      if (!plan.overallTheme || !plan.fragments || plan.fragments.length !== count) {
        throw new Error('AI生成的方案格式不正确或数量不匹配');
      }
      
      return plan;
    } catch (error) {
      console.error('碎片集合规划失败:', error);
      // 返回默认方案
      return {
        overallTheme: theme,
        fragments: Array(count).fill(0).map((_, i) => ({
          subTheme: `${theme} 方向${i + 1}`,
          designDirection: `设计一个与"${theme}"相关的碎片，侧重第${i + 1}个方面`,
          suggestedRarity: 'common' as const
        }))
      };
    }
  }

  /**
   * 第二阶段：执行智能体 - 根据规划生成具体碎片
   * @param fragmentPlan 单个碎片的规划
   * @param overallTheme 整体主题
   * @param index 碎片索引
   * @param total 总数量
   * @returns 碎片数据
   */
  private async generateFragmentFromPlan(
    fragmentPlan: FragmentSetPlan['fragments'][0],
    overallTheme: string,
    index: number,
    total: number
  ): Promise<FragmentData> {
    // 检测系统语言
    const game = (window as any).game;
    const systemLang = game?.i18n?.lang || 'en';
    const isChinese = systemLang.startsWith('zh') || systemLang === 'cn';
    
    console.log(`[碎片生成] 系统语言: ${systemLang}, 使用中文提示词: ${isChinese}`);

    // 获取规则机制知识库（完整版）
    const mechanicsKnowledge = this.mechanicsKnowledge.getFullKnowledge();
    const knowledgeSection = `\n\n---\n\n## PF2e 规则机制参考\n\n${mechanicsKnowledge}\n\n**碎片效果指导**：\n- 碎片的【效果内容】部分应该提供效果的**方向和类型**，而非具体数值\n- 只需说明效果类型（伤害、增益、控制等）和大致方向\n- 避免具体数值和完整的机制描述\n- 伤害效果示例："额外造成火焰伤害"、"钝击伤害效果"、"与水特征相关的伤害"\n- 增益效果示例："提升攻击能力"、"增强防御"、"强化特定豁免"\n- 控制效果示例："施加战栗状态"、"减速效果"、"阻碍行动"\n- 特征方向示例："和水相关的效果"、"火焰特征互动"、"光明与黑暗对立"\n- **重点**：提供灵感和方向，具体数值和机制由神龛合成时决定`;

    const messages = [
      {
        role: 'system' as const,
        content: isChinese
          ? `你是一个专业的TTRPG内容设计师，负责为PF2e创建词条碎片。词条碎片是用于神龛合成的辅助材料，提供风味元素和效果内容。

**🌏 语言要求（最高优先级）**：
- 碎片名称必须使用中文
- 可见描述必须使用中文
- 隐藏提示词必须使用中文
- 绝对不要使用英文

**碎片的本质**：
- **碎片不是具体的物品**，而是一种意象、记忆、概念或力量的残片
- 它可以是：
  - 一段难忘的冒险经历留下的意象
  - 战斗中感受到的力量残响
  - 与NPC互动时产生的情感结晶
  - 探索遗迹时触碰到的古老记忆
  - 面对挑战时激发的内在潜能
- **避免描述成具体物品**（如"一把剑"、"一件护甲"、"一块宝石"）
- **应该描述成抽象的存在**（如"破晓时的勇气"、"冰封的绝望"、"雷霆的回响"、"与龙战斗的决心"）
- 如果主题包含剧情经历，应该提取其中的情感、力量或意象，而非具体事件本身

**碎片的角色定位**：
- 碎片只提供【风味元素】和【效果内容】
- 不负责核心机制设计（机制由神性提供或AI自行设计）

**创作要求**：
你将根据预先规划好的设计方向来创作碎片，确保碎片符合规划的要求。
- 如果设计方向包含剧情经历，提取其中最核心的情感、力量或意象
- 如果设计方向是抽象主题，直接围绕主题创作
- 碎片应该让玩家回忆起那段经历，同时提供明确的游戏效果

请创建一个碎片，包含：
1. 碎片名称（简短、神秘、符合子主题）
2. 可见描述（玩家看到的神秘描述，营造氛围感）
3. 隐藏AI提示词（用于神龛合成时添加到专长生成提示词中）

**隐藏提示词格式**：
【风味元素】简短的关键词或短语，描述主题元素和氛围特征
   - 使用形容词和名词短语（如"炙热、爆裂、破坏性的火焰力量"）
   - 描述核心主题、感觉、氛围
   - 简洁但富有表现力

【效果内容】描述这个碎片可以提供的效果方向
   - **提供效果的类型和方向，而非具体数值**
   - 伤害类效果：说明伤害类型方向（如"额外造成火焰伤害"、"钝击伤害"、"能量伤害"）
   - 增益类效果：说明加值方向（如"提升攻击检定"、"增强防御"、"强化豁免"）
   - 控制类效果：说明控制类型（如"施加战栗状态"、"减速效果"、"阻碍移动"）
   - 治疗类效果：说明治疗方向（如"恢复生命值"、"获得临时HP"、"移除负面状态"）
   - 特征关联效果：说明特征方向（如"和水特征相关的效果"、"火焰特征互动"）
   - 条件触发方向：说明触发条件类型（如"在特定地形时"、"对特定类型敌人"）
   - **避免具体数值**（不说1d6、+2等）和完整机制框架（不说动作类型、频次等）
   - 重点在于提供**效果的可能性和方向**，让神龛系统去决定具体实现

${knowledgeSection}

**随机选项格式（可选）**：
如需在合成时提供多种可能性，可使用HTML随机选项：
<p>固定文本</p><ol><li><p>选项1</p></li><li><p>选项2</p></li><li><p>选项3</p></li></ol>

**返回格式**（严格JSON，无其他文本）：
{
  "name": "碎片名称（中文）",
  "description": "可见描述（中文）",
  "hiddenPrompt": "【风味元素】...\\n【效果内容】...（中文）",
  "rarity": "common/uncommon/rare/unique"
}`
          : `You are a professional TTRPG content designer responsible for creating entry fragments for PF2e. Entry fragments are auxiliary materials used in shrine synthesis, providing flavor elements and effect content.

**🌏 Language Requirement (Highest Priority)**：
- Fragment name must be in English
- Visible description must be in English
- Hidden prompt must be in English
- Absolutely no Chinese characters

**Fragment Role Definition**：
- Fragments only provide [Flavor Elements] and [Effect Content]
- Not responsible for core mechanism design (mechanisms are provided by divinities or designed by AI)
- Effect content can be directional guidance (e.g., "provides fire damage") or specific description (e.g., "causes persistent burning")

**Creation Requirements**：
You will create fragments based on pre-planned design directions, ensuring the fragments meet the planning requirements.

Please create a fragment containing:
1. Fragment name (short, mysterious, matching sub-theme)
2. Visible description (mysterious description seen by players, creates atmosphere)
3. Hidden AI prompt (added to feat generation prompt during shrine synthesis)

**Hidden Prompt Format**：
[Flavor Elements] Brief keywords or phrases describing thematic elements and atmospheric characteristics
   - Use adjectives and noun phrases (e.g., "blazing, explosive, destructive fire power")
   - Describe core theme, feeling, atmosphere
   - Concise yet expressive

[Effect Content] Describe the effect direction this fragment can provide
   - **Provide effect type and direction, not specific values**
   - Damage effects: Indicate damage type direction (e.g., "deals additional fire damage", "bludgeoning damage", "energy damage")
   - Buff effects: Indicate bonus direction (e.g., "enhance attack rolls", "improve defense", "strengthen saves")
   - Control effects: Indicate control type (e.g., "apply frightened condition", "slowing effect", "hinder movement")
   - Healing effects: Indicate healing direction (e.g., "restore Hit Points", "gain temporary HP", "remove negative conditions")
   - Trait-related effects: Indicate trait direction (e.g., "water trait related effects", "fire trait interaction")
   - Conditional triggers: Indicate trigger type (e.g., "in specific terrain", "against specific enemy types")
   - **Avoid specific values** (no 1d6, +2, etc.) and complete mechanism frameworks (no action types, frequency, etc.)
   - Focus on providing **possibilities and directions**, let the shrine system determine specific implementation

${knowledgeSection}

**Random Options Format (Optional)**：
To provide multiple possibilities during synthesis, use HTML random options:
<p>Fixed text</p><ol><li><p>Option 1</p></li><li><p>Option 2</p></li><li><p>Option 3</p></li></ol>

**Return Format** (strict JSON, no other text)：
{
  "name": "Fragment name (English)",
  "description": "Visible description (English)",
  "hiddenPrompt": "[Flavor Elements]...\\n[Effect Content]...(English)",
  "rarity": "common/uncommon/rare/unique"
}`
      },
      {
        role: 'user' as const,
        content: isChinese
          ? `整体主题/经历：${overallTheme}
碎片序号：${index}/${total}

【本碎片的设计要求】
子主题：${fragmentPlan.subTheme}
设计方向：${fragmentPlan.designDirection}
建议稀有度：${fragmentPlan.suggestedRarity}

【创作指导】
1. 碎片名称应该唤起意象和情感，而非描述具体事物
2. 可见描述应该让玩家产生共鸣，回忆起那段经历的感受
3. 【风味元素】提取核心的情感、氛围和主题关键词
4. 【效果内容】提供效果的方向和类型，避免具体数值（参考PF2e规则知识库的效果类型）

请严格按照上述设计方向创作这个碎片，确保它符合规划的子主题和设计要求。记住：所有内容必须使用中文。`
          : `Overall Theme/Experience: ${overallTheme}
Fragment Number: ${index}/${total}

[Design Requirements for This Fragment]
Sub-theme: ${fragmentPlan.subTheme}
Design Direction: ${fragmentPlan.designDirection}
Suggested Rarity: ${fragmentPlan.suggestedRarity}

[Creation Guidelines]
1. Fragment name should evoke imagery and emotions, not describe concrete things
2. Visible description should resonate with players, evoking the feelings of that experience
3. [Flavor Elements] extract core emotions, atmosphere, and thematic keywords
4. [Effect Content] provide effect direction and type, avoid specific values (refer to PF2e rules knowledge for effect types)

Please create this fragment strictly according to the above design direction, ensuring it meets the planned sub-theme and design requirements. Remember: All content must be in English.`
      }
    ];

    try {
      // 不指定模型，使用通用配置中的模型
      const response = await this.aiService.callService(messages);
      const fragmentIdea = this.parseAIResponse(response);
      
      // 验证必需字段
      if (!fragmentIdea.name || !fragmentIdea.description || !fragmentIdea.hiddenPrompt) {
        throw new Error('AI响应缺少必需字段');
      }
      
      return {
        name: fragmentIdea.name,
        description: fragmentIdea.description,
        hiddenPrompt: fragmentIdea.hiddenPrompt,
        rarity: fragmentIdea.rarity || fragmentPlan.suggestedRarity || 'common'
      };
    } catch (error) {
      console.error(`碎片${index}生成失败:`, error);
      // 返回默认碎片
      return {
        name: `${fragmentPlan.subTheme}碎片`,
        description: `一块蕴含着"${fragmentPlan.subTheme}"力量的神秘碎片。`,
        hiddenPrompt: `${fragmentPlan.designDirection}`,
        rarity: fragmentPlan.suggestedRarity || 'common'
      };
    }
  }

  /**
   * 使用AI生成单个碎片的创意（公开方法）
   * @param requirement 需求描述
   * @param rarity 稀有度
   * @returns 碎片数据
   */
  async generateFragmentIdea(requirement: string, rarity?: string): Promise<FragmentData> {
    // 检测系统语言
    const game = (window as any).game;
    const systemLang = game?.i18n?.lang || 'en';
    const isChinese = systemLang.startsWith('zh') || systemLang === 'cn';
    
    console.log(`[单个碎片生成] 系统语言: ${systemLang}, 使用中文提示词: ${isChinese}`);

    // 获取规则机制知识库（完整版）
    const mechanicsKnowledge = this.mechanicsKnowledge.getFullKnowledge();

    const messages = [
      {
        role: 'system' as const,
        content: isChinese
          ? `你是一个专业的TTRPG内容设计师，负责为PF2e创建词条碎片。词条碎片是用于神龛合成的辅助材料，提供风味元素和效果内容。

**🌏 语言要求（最高优先级）**：
- 碎片名称必须使用中文
- 可见描述必须使用中文
- 隐藏提示词必须使用中文
- 绝对不要使用英文

**碎片的本质**：
- **碎片不是具体的物品**，而是一种意象、记忆、概念或力量的残片
- 它可以是：
  - 一段难忘的冒险经历留下的意象
  - 战斗中感受到的力量残响
  - 与NPC互动时产生的情感结晶
  - 探索遗迹时触碰到的古老记忆
  - 面对挑战时激发的内在潜能
- **避免描述成具体物品**（如"一把剑"、"一件护甲"、"一块宝石"）
- **应该描述成抽象的存在**（如"破晓时的勇气"、"冰封的绝望"、"雷霆的回响"、"与龙战斗的决心"）
- 如果需求描述包含剧情经历，应该提取其中的情感、力量或意象，而非具体事件本身

**碎片的角色定位**：
- 碎片只提供【风味元素】和【效果内容】
- 不负责核心机制设计（机制由神性提供或AI自行设计）
- 效果内容提供效果的方向和类型，而非具体数值（如"造成火焰伤害"、"提升攻击能力"）

请根据GM的需求描述设计一个碎片，包含：
1. 碎片名称（简短、神秘、富有想象力，体现其作为意象/记忆的本质）
2. 可见描述（玩家看到的神秘描述，营造氛围感，强调其非实体的特性）
3. 隐藏AI提示词（用于神龛合成时添加到专长生成提示词中）

**隐藏提示词格式要求**：
隐藏提示词应该按照以下格式分为两部分：

【风味元素】简短的关键词或短语，描述主题元素和氛围特征
   - 使用形容词和名词短语（如"炙热、爆裂、破坏性的火焰力量"）
   - 描述核心主题、感觉、氛围
   - 简洁但富有表现力

【效果内容】描述这个碎片可以提供的效果方向
   - **提供效果的类型和方向，而非具体数值**
   - 伤害类效果：说明伤害类型方向（如"额外造成火焰伤害"、"钝击伤害"）
   - 增益类效果：说明加值方向（如"提升攻击检定"、"增强防御"）
   - 控制类效果：说明控制类型（如"施加战栗状态"、"减速效果"）
   - 治疗类效果：说明治疗方向（如"恢复生命值"、"获得临时HP"）
   - 特征关联效果：说明特征方向（如"和水特征相关的效果"）
   - **效果应用场景**：必须使用PF2e规则中明确可判定的场景，例如：
     * 动作使用时："当你进行打击时"、"当你施放法术时"、"当你使用跨步动作时"
     * 被动响应："当你被敌人攻击时"、"当你受到伤害时"（注：这些是反应动作的触发条件）
     * 回合节点："在你的回合开始时"、"在你的回合结束时"
     * 状态条件："当你处于战栗状态时"、"当你倒地时"
     * 成功度相关："当你的攻击大成功时"、"当你豁免失败时"
     * 特定目标："对抗不死生物时"、"对抗具有邪恶特征的敌人时"
   - **避免抽象或无效的场景**：不要使用"当周围人群陷入愤怒时"、"当月圆之夜"等在规则上无法明确判定的条件
   - **避免具体数值**（不说1d6、+1等）和完整机制框架（不说动作类型、频次等）
   - 重点在于提供**效果的可能性和方向**，让神龛系统去决定具体实现

**随机选项格式（可选）**：
如需在合成时提供多种可能性，可使用HTML随机选项：
<p>固定文本</p><ol><li><p>选项1</p></li><li><p>选项2</p></li><li><p>选项3</p></li></ol>

**返回格式**（严格JSON，无其他文本）：
{
  "name": "碎片名称（中文）",
  "description": "可见描述（中文）",
  "hiddenPrompt": "【风味元素】...\\n【效果内容】...（中文）",
  "rarity": "common/uncommon/rare/unique"
}

---

## PF2e 规则机制参考

${mechanicsKnowledge}

**碎片效果指导**：
- 碎片的【效果内容】部分应该提供效果的**方向和类型**，而非具体数值
- 只需说明效果类型（伤害、增益、控制等）和大致方向
- 避免具体数值和完整的机制描述
- 伤害效果示例："额外造成火焰伤害"、"钝击伤害效果"、"与水特征相关的伤害"
- 增益效果示例："提升攻击能力"、"增强防御"、"强化特定豁免"
- 控制效果示例："施加战栗状态"、"减速效果"、"阻碍行动"
- 特征方向示例："和水相关的效果"、"火焰特征互动"、"光明与黑暗对立"
- **效果应用场景必须规则有效**：使用明确的游戏规则场景，如"当你进行打击时"、"当你被攻击时"、"在你的回合开始时"、"当你施放法术时"等，避免使用抽象或无法判定的条件如"当周围人群愤怒时"
- **重点**：提供灵感和方向，具体数值和机制由神龛合成时决定
`
          : `You are a professional TTRPG content designer responsible for creating entry fragments for PF2e. Entry fragments are auxiliary materials used in shrine synthesis, providing flavor elements and effect content.

**🌏 Language Requirement (Highest Priority)**：
- Fragment name must be in English
- Visible description must be in English
- Hidden prompt must be in English
- Absolutely no Chinese characters

**Fragment Essence**：
- **Fragments are not concrete items**, but imagery, memories, concepts, or remnants of power
- They can be:
  - Imagery left by memorable adventure experiences
  - Echoes of power felt in combat
  - Emotional crystallizations from NPC interactions
  - Ancient memories touched while exploring ruins
  - Inner potential awakened when facing challenges
- **Avoid describing as concrete items** (e.g., "a sword", "armor", "a gem")
- **Should describe as abstract existence** (e.g., "courage at dawn", "frozen despair", "echo of thunder", "determination from fighting dragons")
- If the requirement describes story experiences, extract emotions, powers, or imagery rather than specific events

**Fragment Role Definition**：
- Fragments only provide [Flavor Elements] and [Effect Content]
- Not responsible for core mechanism design (mechanisms are provided by divinities or designed by AI)
- Effect content provides effect direction and type, not specific values (e.g., "deals fire damage", "enhance attack capability")

Please design a fragment based on the GM's requirement description, containing:
1. Fragment name (short, mysterious, imaginative, embodying its nature as imagery/memory)
2. Visible description (mysterious description seen by players, creates atmosphere, emphasizes non-physical nature)
3. Hidden AI prompt (added to feat generation prompt during shrine synthesis)

**Hidden Prompt Format Requirements**：
The hidden prompt should be divided into two parts in the following format:

[Flavor Elements] Brief keywords or phrases describing thematic elements and atmospheric characteristics
   - Use adjectives and noun phrases (e.g., "blazing, explosive, destructive fire power")
   - Describe core theme, feeling, atmosphere
   - Concise yet expressive

[Effect Content] Describe the effect direction this fragment can provide
   - **Provide effect type and direction, not specific values**
   - Damage effects: Indicate damage type direction (e.g., "deals additional fire damage", "bludgeoning damage")
   - Buff effects: Indicate bonus direction (e.g., "enhance attack rolls", "improve defense")
   - Control effects: Indicate control type (e.g., "apply frightened condition", "slowing effect")
   - Healing effects: Indicate healing direction (e.g., "restore Hit Points", "gain temporary HP")
   - Trait-related effects: Indicate trait direction (e.g., "water trait related effects")
   - **Effect application scenarios**: Must use valid PF2e rule scenarios, such as:
     * Action usage: "when you make a Strike", "when you Cast a Spell", "when you Stride"
     * Passive response: "when you are attacked by an enemy", "when you take damage" (Note: these are triggers for reactions)
     * Turn-based: "at the start of your turn", "at the end of your turn"
     * Condition-based: "when you are frightened", "when you are prone"
     * Degree of success: "when you critically succeed on an attack", "when you fail a save"
     * Specific targets: "against undead", "against creatures with the evil trait"
   - **Avoid abstract or invalid scenarios**: Don't use conditions like "when the crowd around you becomes angry" or "when the moon is full" that cannot be clearly determined by game rules
   - **Avoid specific values** (no 1d6, +1, etc.) and complete mechanism descriptions
   - Focus on providing **possibilities and directions**, let the shrine system determine implementation

**Random Options Format (Optional)**：
To provide multiple possibilities during synthesis, use HTML random options:
<p>Fixed text</p><ol><li><p>Option 1</p></li><li><p>Option 2</p></li><li><p>Option 3</p></li></ol>

**Return Format** (strict JSON, no other text)：
{
  "name": "Fragment name (English)",
  "description": "Visible description (English)",
  "hiddenPrompt": "[Flavor Elements]...\\n[Effect Content]...(English)",
  "rarity": "common/uncommon/rare/unique"
}

---

## PF2e Rule Mechanics Reference

${mechanicsKnowledge}

**Fragment Effect Guidance**：
- The [Effect Content] section should provide effect **direction and type**, not specific values
- Only indicate effect types (damage, buffs, control, etc.) and general direction
- Avoid specific values and complete mechanism descriptions
- Damage effect examples: "deals additional fire damage", "bludgeoning damage effect", "water trait related damage"
- Buff effect examples: "enhance attack capability", "improve defense", "strengthen specific saves"
- Control effect examples: "apply frightened condition", "slowing effect", "hinder actions"
- Trait direction examples: "water-related effects", "fire trait interaction", "light vs darkness opposition"
- **Key point**: Provide inspiration and direction, specific values and mechanisms determined during shrine synthesis
`
      },
      {
        role: 'user' as const,
        content: isChinese
          ? `GM需求/经历: ${requirement}
${rarity ? `稀有度要求: ${rarity}` : ''}

【创作指导】
1. 如果需求描述了剧情经历，提取其中的关键情感、力量或意象
2. 碎片名称应该唤起意象和情感，而非描述具体事物
3. 可见描述应该让玩家产生共鸣，回忆起那段经历的感受
4. 【风味元素】提取核心的情感、氛围和主题关键词
5. 【效果内容】提供效果的方向和类型，避免具体数值（参考PF2e规则知识库的效果类型）

请根据这个需求设计一个相应的词条碎片。确保碎片的设计符合需求，同时保持神秘感。记住：所有内容必须使用中文。`
          : `GM Requirement/Experience: ${requirement}
${rarity ? `Rarity Requirement: ${rarity}` : ''}

[Creation Guidelines]
1. If the requirement describes story experiences, extract key emotions, powers, or imagery
2. Fragment name should evoke imagery and emotions, not describe concrete things
3. Visible description should resonate with players, evoking the feelings of that experience
4. [Flavor Elements] extract core emotions, atmosphere, and thematic keywords
5. [Effect Content] provide effect direction and type, avoid specific values (refer to PF2e rules knowledge for effect types)

Please design an appropriate entry fragment based on this requirement. Ensure the fragment design meets the requirement while maintaining mystery. Remember: All content must be in English.`
      }
    ];

    try {
      // 不指定模型，使用通用配置中的模型
      const response = await this.aiService.callService(messages);
      const fragmentIdea = this.parseAIResponse(response);
      
      // 验证必需字段
      if (!fragmentIdea.name || !fragmentIdea.description || !fragmentIdea.hiddenPrompt) {
        throw new Error('AI响应缺少必需字段');
      }
      
      return {
        name: fragmentIdea.name,
        description: fragmentIdea.description,
        hiddenPrompt: fragmentIdea.hiddenPrompt,
        rarity: fragmentIdea.rarity || rarity || 'common'
      };
    } catch (error) {
      console.error('生成碎片创意失败:', error);
      console.error('错误详情:', error instanceof Error ? error.message : String(error));
      
      // 返回默认碎片
      return {
        name: `神秘碎片`,
        description: `一块蕴含着神秘力量的古老碎片，似乎与"${requirement}"有某种联系。`,
        hiddenPrompt: `设计一个与"${requirement}"相关的专长，注重实用性和平衡性。`,
        rarity: rarity as any || 'common'
      };
    }
  }

}
