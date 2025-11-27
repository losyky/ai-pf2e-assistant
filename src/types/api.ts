/**
 * 消息角色类型
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'function';

/**
 * 消息接口
 */
export interface Message {
  role: MessageRole;
  content: string;
  name?: string;
  function_call?: FunctionCall;
}

/**
 * Function Call 接口
 */
export interface FunctionCall {
  name: string;
  arguments: string;
}

/**
 * 函数定义接口
 */
export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * API 请求参数接口
 */
export interface ApiRequest {
  model: string;
  messages: Message[];
  functions?: FunctionDefinition[];
  function_call?: 'auto' | 'none' | { name: string };
  max_tokens?: number;
  temperature?: number;
}

/**
 * API 响应接口
 */
export interface ApiResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: Message;
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
} 