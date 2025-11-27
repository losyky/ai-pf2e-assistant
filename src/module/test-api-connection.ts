import { MODULE_ID } from './constants';
import { AIPF2eAssistant } from './ai-pf2e-assistant';
import { ui } from '../foundry-imports';

/**
 * 测试API连接
 * 导出供外部调用的测试函数
 */
export async function testApiConnection(): Promise<void> {
  console.log(`${MODULE_ID} | 开始测试API连接`);
  
  try {
    // 获取游戏实例
    // @ts-ignore
    const game = window.game;
    
    if (!game) {
      console.error(`${MODULE_ID} | 游戏实例不可用`);
      return;
    }
    
    // 读取配置信息
    const apiKey = game.settings.get(MODULE_ID, 'apiKey') as string;
    const model = game.settings.get(MODULE_ID, 'aiModel') as string;
    
    if (!apiKey) {
      console.error(`${MODULE_ID} | API密钥未设置`);
      ui.notifications?.error("API密钥未设置，请在模块设置中配置API密钥");
      return;
    }
    
    // 创建测试消息
    const messages = [
      {
        role: 'user',
        content: '简单的连接测试。请回复"连接成功"。'
      }
    ];
    
    // 显示测试中消息
    ui.notifications?.info("正在测试AI服务连接，请稍候...");
    
    // 准备请求数据
    const requestData = {
      model: model,
      messages: messages,
      max_tokens: 50,
      temperature: 0.7
    };
    
    console.log(`${MODULE_ID} | 测试参数:`, { model, messages });
    
    // 发送请求到配置的 API 地址
    const apiUrl = game.settings.get('ai-pf2e-assistant', 'apiUrl') || 'https://api.openai.com/v1/chat/completions';
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestData)
    });
    
    // 检查响应
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${MODULE_ID} | API连接测试失败: ${response.status} ${response.statusText}`, errorText);
      ui.notifications?.error(`AI服务连接失败: ${response.status} ${response.statusText}`);
      return;
    }
    
    // 解析响应
    const data = await response.json();
    console.log(`${MODULE_ID} | API连接测试响应:`, data);
    
    // 检查响应是否有效
    if (data?.choices && data.choices.length > 0) {
      const content = data.choices[0].message.content || '';
      ui.notifications?.info(`AI服务连接成功! 模型: ${data.model}`);
      console.log(`${MODULE_ID} | 连接成功: ${content}`);
    } else {
      console.error(`${MODULE_ID} | API响应格式不正确:`, data);
      ui.notifications?.error("AI服务连接测试返回了无效的响应格式");
    }
  } catch (error) {
    console.error(`${MODULE_ID} | API连接测试出错:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    ui.notifications?.error(`AI服务连接失败: ${errorMessage}`);
  }
} 