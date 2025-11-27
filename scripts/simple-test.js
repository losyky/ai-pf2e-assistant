#!/usr/bin/env node

/**
 * AI PF2e Assistant - API 连接测试脚本
 * 
 * 功能：测试 OpenAI 兼容 API 的连接性
 * 使用方法: node simple-test.js YOUR_API_KEY [API_URL]
 * 
 * 示例：
 *   node simple-test.js sk-xxxxx
 *   node simple-test.js sk-xxxxx https://api.openai.com
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// 获取命令行参数
const apiKey = process.argv[2];
const apiUrl = process.argv[3] || 'https://api.openai.com';

if (!apiKey) {
  console.error('错误: 请提供 API 密钥作为参数');
  console.error('使用方法: node simple-test.js YOUR_API_KEY [API_URL]');
  console.error('');
  console.error('示例:');
  console.error('  node simple-test.js sk-xxxxx');
  console.error('  node simple-test.js sk-xxxxx https://api.openai.com');
  console.error('  node simple-test.js sk-xxxxx https://your-proxy-url.com');
  process.exit(1);
}

console.log('正在测试 API 连接...');
console.log('API 地址:', apiUrl);

// API 请求数据
const requestData = JSON.stringify({
  model: 'gpt-3.5-turbo',
  messages: [
    { role: 'user', content: '你好，请回复一个简短的测试消息' }
  ],
  max_tokens: 20
});

// 解析 URL
const parsedUrl = new URL(apiUrl);
const isHttps = parsedUrl.protocol === 'https:';
const hostname = parsedUrl.hostname;
const port = parsedUrl.port || (isHttps ? 443 : 80);
const apiPath = parsedUrl.pathname.replace(/\/$/, '') + '/v1/chat/completions';

// API 请求选项
const options = {
  hostname: hostname,
  port: port,
  path: apiPath,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(requestData),
    'Authorization': `Bearer ${apiKey.trim()}`
  }
};

// 选择 HTTP 或 HTTPS 模块
const protocol = isHttps ? https : http;

// 发送请求
const req = protocol.request(options, (res) => {
  let data = '';
  
  // 接收数据
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  // 请求完成
  res.on('end', () => {
    if (res.statusCode === 200) {
      try {
        const response = JSON.parse(data);
        console.log('\n✓ 测试成功! API 连接正常');
        console.log('AI 响应:', response.choices[0].message.content);
        console.log('使用模型:', response.model);
        if (response.usage) {
          console.log('Token 用量:', response.usage.total_tokens);
        }
        process.exit(0);
      } catch (e) {
        console.error('\n✗ 解析响应失败:', e.message);
        console.error('原始响应:', data);
        process.exit(1);
      }
    } else {
      console.error('\n✗ API 请求失败:', res.statusCode, res.statusMessage);
      console.error('错误详情:', data);
      process.exit(1);
    }
  });
});

// 请求错误处理
req.on('error', (e) => {
  console.error('\n✗ 请求错误:', e.message);
  console.error('提示: 请检查 API 地址是否正确，以及网络连接是否正常');
  process.exit(1);
});

// 发送请求数据
req.write(requestData);
req.end(); 