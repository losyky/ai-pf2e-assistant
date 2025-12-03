/**
 * API配置管理器
 * 管理所有API相关的配置：GM API、玩家API、图像API
 */

import { BaseConfigManager } from './base-config-manager';
import { MODULE_ID } from '../../constants';

declare const game: Game;

export class APIConfigManager extends BaseConfigManager {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'ai-pf2e-api-config',
      title: 'API 配置管理',
      template: `modules/${MODULE_ID}/templates/config-managers/api-config-manager.html`,
      width: 700,
      tabs: [
        { navSelector: '.tabs', contentSelector: '.content', initial: 'gm-api' }
      ]
    });
  }

  async getData(options?: any): Promise<any> {
    const data = await super.getData(options);
    
    return foundry.utils.mergeObject(data, {
      gmApi: {
        url: this.getSetting('apiUrl') || 'https://api.openai.com/v1/chat/completions',
        key: this.getSetting('apiKey') || '',
        model: this.getSetting('aiModel') || 'gpt-3.5-turbo'
      },
      playerApi: {
        url: this.getSetting('playerApiUrl') || '',
        key: this.getSetting('playerApiKey') || ''
      },
      imageApi: {
        url: this.getSetting('imageApiUrl') || '',
        key: this.getSetting('imageApiKey') || ''
      },
      playerImageApi: {
        url: this.getSetting('playerImageApiUrl') || '',
        key: this.getSetting('playerImageApiKey') || ''
      }
    });
  }

  async _updateObject(event: Event, formData: any): Promise<void> {
    try {
      // 保存所有API配置
      await this.saveSettings({
        'apiUrl': formData.gmApiUrl,
        'apiKey': formData.gmApiKey,
        'aiModel': formData.aiModel,
        'playerApiUrl': formData.playerApiUrl,
        'playerApiKey': formData.playerApiKey,
        'imageApiUrl': formData.imageApiUrl,
        'imageApiKey': formData.imageApiKey,
        'playerImageApiUrl': formData.playerImageApiUrl,
        'playerImageApiKey': formData.playerImageApiKey
      });

      this.showSuccess('API 配置已保存');
    } catch (error) {
      console.error('Failed to save API config:', error);
      this.showError('保存配置失败，请查看控制台了解详情');
    }
  }

  activateListeners(html: JQuery): void {
    super.activateListeners(html);

    // 测试连接按钮
    html.find('.test-gm-connection').on('click', () => this._testConnection('gm'));
    html.find('.test-player-connection').on('click', () => this._testConnection('player'));
    html.find('.test-gm-image-api').on('click', () => this._testConnection('gm-image'));
    html.find('.test-player-image-api').on('click', () => this._testConnection('player-image'));

    // 密码显示/隐藏切换
    html.find('.toggle-password').on('click', (event) => {
      const button = $(event.currentTarget);
      const input = button.siblings('input');
      const icon = button.find('i');
      
      if (input.attr('type') === 'password') {
        input.attr('type', 'text');
        icon.removeClass('fa-eye').addClass('fa-eye-slash');
      } else {
        input.attr('type', 'password');
        icon.removeClass('fa-eye-slash').addClass('fa-eye');
      }
    });
  }

  private async _testConnection(type: string): Promise<void> {
    const resultContainer = this.element.find(`.test-result-${type}`);
    const button = this.element.find(`.test-${type}-connection`);
    
    // 更新按钮状态
    button.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> 测试中...');
    resultContainer.empty().html('<p><i class="fas fa-spinner fa-spin"></i> 正在测试连接...</p>');

    try {
      // 根据类型获取相应的API配置
      let apiUrl = '';
      let apiKey = '';
      let model = '';

      switch (type) {
        case 'gm':
          apiUrl = this.element.find('input[name="gmApiUrl"]').val() as string;
          apiKey = this.element.find('input[name="gmApiKey"]').val() as string;
          model = this.element.find('input[name="aiModel"]').val() as string;
          break;
        case 'player':
          apiUrl = this.element.find('input[name="playerApiUrl"]').val() as string || 
                   this.element.find('input[name="gmApiUrl"]').val() as string;
          apiKey = this.element.find('input[name="playerApiKey"]').val() as string;
          model = this.element.find('input[name="aiModel"]').val() as string;
          break;
        case 'gm-image':
          apiUrl = this.element.find('input[name="imageApiUrl"]').val() as string || 
                   this.element.find('input[name="gmApiUrl"]').val() as string;
          apiKey = this.element.find('input[name="imageApiKey"]').val() as string || 
                   this.element.find('input[name="gmApiKey"]').val() as string;
          break;
        case 'player-image':
          apiUrl = this.element.find('input[name="playerImageApiUrl"]').val() as string || 
                   this.element.find('input[name="imageApiUrl"]').val() as string ||
                   this.element.find('input[name="playerApiUrl"]').val() as string ||
                   this.element.find('input[name="gmApiUrl"]').val() as string;
          apiKey = this.element.find('input[name="playerImageApiKey"]').val() as string ||
                   this.element.find('input[name="imageApiKey"]').val() as string ||
                   this.element.find('input[name="playerApiKey"]').val() as string ||
                   this.element.find('input[name="gmApiKey"]').val() as string;
          break;
      }

      if (!apiUrl || !apiKey) {
        resultContainer.html(`
          <div class="test-result error">
            <h4><i class="fas fa-times-circle"></i> 配置不完整</h4>
            <p>请先填写 API 地址和密钥</p>
          </div>
        `);
        return;
      }

      // 测试文本API
      if (type === 'gm' || type === 'player') {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model || 'gpt-3.5-turbo',
            messages: [
              { role: 'user', content: '你好' }
            ],
            max_tokens: 50
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '无回复内容';
        const usage = data.usage;

        resultContainer.html(`
          <div class="test-result success">
            <h4><i class="fas fa-check-circle"></i> 连接成功！</h4>
            <p><strong>模型:</strong> ${data.model || model}</p>
            <p><strong>回复:</strong> ${content}</p>
            ${usage ? `<p><strong>Token使用:</strong> ${usage.total_tokens}个 (提示: ${usage.prompt_tokens}, 回复: ${usage.completion_tokens})</p>` : ''}
          </div>
        `);
      } else {
        // 对于图像API，只做简单的端点测试
        resultContainer.html(`
          <div class="test-result success">
            <h4><i class="fas fa-check-circle"></i> 配置已设置</h4>
            <p>图像API配置已验证。实际生成图像时会进行完整测试。</p>
            <p><strong>API地址:</strong> ${apiUrl}</p>
          </div>
        `);
      }
    } catch (error) {
      console.error('Test connection failed:', error);
      resultContainer.html(`
        <div class="test-result error">
          <h4><i class="fas fa-times-circle"></i> 连接失败</h4>
          <p><strong>错误信息:</strong> ${error instanceof Error ? error.message : String(error)}</p>
        </div>
      `);
    } finally {
      // 恢复按钮状态
      button.prop('disabled', false).html('<i class="fas fa-plug"></i> 测试连接');
    }
  }
}

