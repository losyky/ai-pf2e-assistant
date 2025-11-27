import { Message } from '../types/api';

/**
 * AI 服务接口
 * 定义了 AI 服务应该实现的方法
 */
export interface AIService {
  /**
   * 调用 AI 服务生成内容
   * @param messages 消息列表
   * @param options 选项
   * @returns 生成的内容
   */
  callService(messages: Message[], options?: any): Promise<any>;
  
  /**
   * 获取服务名称
   * @returns 服务名称
   */
  getServiceName(): string;
  
  /**
   * 获取可用的模型列表
   * @returns 模型列表
   */
  getAvailableModels(): string[];
} 