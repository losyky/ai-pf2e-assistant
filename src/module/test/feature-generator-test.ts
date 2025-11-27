import { FeatureGeneratorService, MechanismDesign, FeatureDesign, PF2eItemFormat } from '../services/feature-generator-service';
import { BalanceDataService } from '../services/balance-data-service';

/**
 * 特性生成器测试类
 * 用于测试特性生成器的各个组件
 */
export class FeatureGeneratorTest {
  private balanceService: BalanceDataService;
  private featureService: FeatureGeneratorService;

  constructor() {
    this.balanceService = new BalanceDataService();
    
    // 创建模拟的AI服务
    const mockAIService = {
      callService: this.mockAICall.bind(this),
      getServiceName: () => 'Mock AI Service',
      getAvailableModels: () => ['mock-model']
    };

    this.featureService = new FeatureGeneratorService(mockAIService, this.balanceService.getAllData());
  }

  /**
   * 模拟AI服务调用
   * 返回预设的测试数据
   */
  private async mockAICall(messages: any[], options?: any): Promise<any> {
    // 根据函数调用类型返回不同的模拟数据
    if (options?.function_call?.name === 'designMechanism') {
      return this.getMockMechanismResponse();
    } else if (options?.function_call?.name === 'designFeature') {
      return this.getMockFeatureResponse();
    } else if (options?.function_call?.name === 'convertToPF2eFormat') {
      return this.getMockFormatResponse();
    }

    // 默认返回空响应
    return {
      choices: [{
        message: {
          content: 'Mock response'
        }
      }]
    };
  }

  /**
   * 获取模拟机制设计响应
   */
  private getMockMechanismResponse(): any {
    const mockMechanism: MechanismDesign = {
      name: '元素共鸣',
      description: '一个基于元素能量积累和释放的资源管理系统，角色可以通过不同的动作积累元素点数，并消耗这些点数释放强大的能力。',
      mechanismType: 'resource',
      gameReference: '类似于MOBA游戏中的能量条机制，如英雄联盟的蓝条系统',
      coreRules: [
        '角色拥有最多5点元素共鸣点数',
        '使用特定动作可以获得1点元素共鸣',
        '可以消耗元素共鸣点数激活特殊能力',
        '战斗结束时重置为1点元素共鸣'
      ],
      balanceConsiderations: [
        '获得点数的动作不应过于容易',
        '消耗点数的能力应该有显著价值',
        '最大点数限制防止过度积累',
        '重置机制避免跨战斗积累'
      ],
      extensionPotential: [
        '不同元素类型的共鸣点数',
        '基于共鸣点数的被动加成',
        '消耗多点的强力技能',
        '与队友共享共鸣的能力'
      ],
      suggestedFeats: [
        '元素掌控：增加最大共鸣点数',
        '快速充能：更容易获得共鸣点数',
        '元素爆发：消耗所有点数的强力攻击',
        '持续共鸣：延长共鸣效果持续时间'
      ]
    };

    return {
      choices: [{
        message: {
          function_call: {
            name: 'designMechanism',
            arguments: JSON.stringify(mockMechanism)
          }
        }
      }]
    };
  }

  /**
   * 获取模拟特性设计响应
   */
  private getMockFeatureResponse(): any {
    const mockFeature: FeatureDesign = {
      name: '元素共鸣',
      description: '你与周围的元素能量产生共鸣，能够积累并释放这些力量。',
      level: 1,
      mechanismIntegration: '通过元素共鸣点数系统管理特殊能力的使用',
      prerequisites: [],
      traits: ['arcane', 'concentrate'],
      category: 'classfeature',
      actionType: 'passive',
      rulesElements: [
        {
          key: 'RollOption',
          option: 'elemental-resonance',
          suboptions: [
            { label: '元素共鸣1', value: '1' },
            { label: '元素共鸣2', value: '2' },
            { label: '元素共鸣3', value: '3' },
            { label: '元素共鸣4', value: '4' },
            { label: '元素共鸣5', value: '5' }
          ]
        },
        {
          key: 'Note',
          selector: 'all',
          text: '你拥有元素共鸣点数，最多5点。使用某些动作可以获得共鸣点数，消耗点数可以激活特殊能力。'
        }
      ],
      flavorText: '元素的力量在你体内流淌，等待着被释放的时机。'
    };

    return {
      choices: [{
        message: {
          function_call: {
            name: 'designFeature',
            arguments: JSON.stringify(mockFeature)
          }
        }
      }]
    };
  }

  /**
   * 获取模拟格式转换响应
   */
  private getMockFormatResponse(): any {
    const mockFormat: PF2eItemFormat = {
      name: '元素共鸣',
      type: 'feat',
      img: 'icons/magic/symbols/elements-air-earth-fire-water.webp',
      system: {
        actionType: { value: 'passive' },
        actions: { value: null },
        category: 'classfeature',
        description: {
          value: '<p>你与周围的元素能量产生共鸣，能够积累并释放这些力量。</p><p>你拥有<strong>元素共鸣点数</strong>，最多5点。在战斗开始时，你拥有1点元素共鸣。你可以通过以下方式获得元素共鸣点数：</p><ul><li>使用@UUID[Compendium.pf2e.actionspf2e.Item.21WIfSu7Xd7uKqV8]{翻滚穿越}动作成功时获得1点</li><li>对敌人造成元素伤害时获得1点（每轮最多1次）</li><li>使用@UUID[Compendium.pf2e.actionspf2e.Item.1OagaWtBpVXExToo]{专注}动作时获得1点</li></ul><p>你可以消耗元素共鸣点数来激活特殊能力。战斗结束时，你的元素共鸣重置为1点。</p><p><em>元素的力量在你体内流淌，等待着被释放的时机。</em></p>',
          gm: ''
        },
        level: { value: 1 },
        prerequisites: { value: [] },
        publication: {
          license: 'ORC',
          remaster: true,
          title: 'AI Generated Feature',
          authors: 'AI PF2e Assistant'
        },
        rules: [
          {
            key: 'RollOption',
            option: 'elemental-resonance',
            suboptions: [
              { label: '元素共鸣1', value: '1' },
              { label: '元素共鸣2', value: '2' },
              { label: '元素共鸣3', value: '3' },
              { label: '元素共鸣4', value: '4' },
              { label: '元素共鸣5', value: '5' }
            ]
          },
          {
            key: 'Note',
            selector: 'all',
            text: '你拥有元素共鸣点数，最多5点。使用某些动作可以获得共鸣点数，消耗点数可以激活特殊能力。'
          }
        ],
        traits: {
          rarity: 'common',
          value: ['arcane', 'concentrate'],
          otherTags: []
        },
        slug: 'elemental-resonance',
        _migration: { version: 0.935, previous: null },
        onlyLevel1: false,
        maxTakable: 1,
        subfeatures: {
          proficiencies: {},
          senses: {},
          suppressedFeatures: []
        },
        location: null
      },
      effects: [],
      folder: null,
      flags: {
        exportSource: {
          world: "ai-generated",
          system: "pf2e",
          coreVersion: "12.331",
          systemVersion: "6.12.4"
        }
      }
    };

    return {
      choices: [{
        message: {
          function_call: {
            name: 'convertToPF2eFormat',
            arguments: JSON.stringify(mockFormat)
          }
        }
      }]
    };
  }

  /**
   * 测试平衡数据服务
   */
  async testBalanceService(): Promise<void> {
    console.log('=== 测试平衡数据服务 ===');
    
    // 测试获取等级数据
    const level5Data = this.balanceService.getLevelData(5);
    console.log('等级5数据:', level5Data);

    // 测试获取特定数据
    const abilityData = this.balanceService.getSpecificData('abilityScore', 5);
    console.log('等级5属性数据:', abilityData);

    // 测试数值验证
    const validation = this.balanceService.validateValue('skill', 5, 13);
    console.log('技能数值验证:', validation);

    // 测试动作价值评估
    const actionValue = this.balanceService.getActionValue('action', 1);
    console.log('单动作价值:', actionValue);

    // 测试平衡性评估
    const balance = this.balanceService.evaluateBalance(5, 'passive', undefined, ['伤害', '状态']);
    console.log('平衡性评估:', balance);
  }

  /**
   * 测试特性生成服务
   */
  async testFeatureGenerator(): Promise<void> {
    console.log('=== 测试特性生成服务 ===');

    try {
      const feature = await this.featureService.generateFeature(
        '一个基于元素能量的资源管理机制，可以积累和消耗元素点数',
        1,
        '法师'
      );

      console.log('生成的特性:', feature);
      console.log('特性名称:', feature.name);
      console.log('特性等级:', feature.system.level.value);
      console.log('特性类别:', feature.system.category);
      console.log('规则元素数量:', feature.system.rules.length);

    } catch (error) {
      console.error('特性生成测试失败:', error);
    }
  }

  /**
   * 运行所有测试
   */
  async runAllTests(): Promise<void> {
    console.log('开始运行特性生成器测试...');
    
    try {
      await this.testBalanceService();
      await this.testFeatureGenerator();
      
      console.log('所有测试完成！');
      
    } catch (error) {
      console.error('测试运行失败:', error);
    }
  }
}

// 导出测试实例以便在控制台中使用
declare global {
  interface Window {
    testFeatureGenerator?: () => Promise<void>;
  }
}

// 在模块加载时注册测试函数
if (typeof window !== 'undefined') {
  window.testFeatureGenerator = async () => {
    const test = new FeatureGeneratorTest();
    await test.runAllTests();
  };
}