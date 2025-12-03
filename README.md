# AI PF2e Assistant

<div align="center">

**为 Foundry VTT 的 Pathfinder 2e 系统提供 AI 驱动的内容生成与管理工具**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v13-orange)](https://foundryvtt.com/)
[![PF2e System](https://img.shields.io/badge/PF2e%20System-v7.0%2B-blue)](https://github.com/foundryvtt/pf2e)


</div>

---
**目前模组仍处于测试阶段，暂无任何发行版。**
---
## 📖 简介

**AI PF2e Assistant** 是一个为 Foundry VTT 的 Pathfinder 2e 系统设计的辅助模块，通过 AI 技术帮助 GM 和玩家生成游戏内容。本模块的核心是 **AI 文档修改助手**，可以直接在角色卡或物品表单中调用 AI 进行智能修改。此外还提供了神龛合成系统等多种扩展功能。


### ✨ 主要特点

- 🤖 **AI 文档助手** - 在任何文档中直接调用 AI，智能修改角色、物品等内容
- 🎲 **神龛合成系统** - 通过收集材料在神龛中合成专长、法术和装备的特色玩法
- 📚 **PF2e 规则参考** - 内置 PF2e 规则知识，帮助生成更符合规则的内容
- 🎨 **内容生成工具** - 提供专长、法术、装备等多种内容生成器

---

## 🚀 功能特性

### 1. AI 文档修改助手 ✏️

这是本模块的核心功能，提供便捷的 AI 辅助修改：

- 直接在角色卡或物品表单标题栏打开 AI 助手
- 用自然语言描述修改需求，AI 自动应用更改
- 支持批量修改和复杂调整
- 保持数据结构的完整性
- 可选启用 PF2e 规则知识库，生成更符合规则的内容

### 2. 内容生成工具 🎨

提供多种独立的内容生成器：

#### 专长生成器
- 支持所有专长类别
- 自动生成规则元素
- 可参考官方专长库
- 支持自定义前置条件和特征标签

#### 物品生成器
- 生成武器、护甲、魔法物品
- 自动计算价格和稀有度
- 支持附魔和特殊能力
- 可参考官方装备数据库

### 3. 神龛合成系统 🏛️

一个具有特色的ai内容生成玩法：

#### 合成材料系统
- **神龛（Shrine）** - 合成的核心，定义生成内容的类型、等级和风格
- **碎片（Fragment）** - 提供主题和机制灵感的材料
- **神性（Divinity）** - 赋予神话色彩和特殊力量
- **贡品（Offering）** - 可选的模板物品，用于参考和改进

#### 支持的合成类型
- **专长合成** - 生成职业专长、通用专长、技能专长等
- **法术合成** - 创建自定义法术，支持各种施法传统
- **装备合成** - 生成武器、护甲、魔法物品等装备

### 4. 战术手册系统 📋

为战术动作提供类似施法系统的管理：
- **战术准备** - 类似法术准备，选择可用的战术动作
- **战术槽位** - 限制可同时准备的战术数量
- **战术施放** - 在角色卡中直接使用战术动作
- **自动识别** - 自动识别带有  `tactic` 特征的动作

### 6. 术语管理系统 📝

确保翻译的准确性：
- PF2e 专业术语对照表
- 自动识别和应用术语
- 支持自定义术语导入
- 自动收集新术语功能

### 7. 平衡性管理 ⚖️

维护游戏平衡：
- 自定义数值平衡关键词
- AI 平衡性分析
- 参考官方标准
- 可配置的平衡规则

---

## 📥 安装方法

**目前所有mod处于测试阶段，未提供独立安装方式，以下内容仅为备用**

### 方法 1：通过 Foundry VTT 安装（推荐）

1. 在 Foundry VTT 中打开 **Add-on Modules** 标签
2. 点击 **Install Module**
3. 在搜索框中输入 `AI PF2e Assistant`
4. 点击 **Install**

### 方法 2：手动安装

1. 下载最新版本的 [Release](https://github.com/losyky/ai-pf2e-assistant/releases)
2. 解压到 Foundry VTT 的 `Data/modules` 目录
3. 重启 Foundry VTT
4. 在世界设置中启用 **AI PF2e Assistant** 模块

### 方法 3：通过 Manifest URL 安装

在 Foundry VTT 的模块安装界面，使用以下 Manifest URL：

```
https://github.com/losyky/ai-pf2e-assistant/releases/latest/download/module.json
```

---

## 🎯 快速开始

### 1. 配置 AI 服务

启用模块后，进入 **模块设置**：

1. **API 地址** - 输入兼容 OpenAI 格式的 API 端点
   - OpenAI: `https://api.openai.com/v1/chat/completions`
   - 302.AI: `https://api.302.ai/v1/chat/completions`
   - 其他兼容服务

2. **API 密钥** - 输入您的 API 密钥
   - GM 密钥：完整功能访问
   - 玩家密钥：有限功能（神龛系统、图标生成）

3. **AI 模型** - 选择使用的模型
   - 推荐：`gpt-4o`（平衡性能和成本）
   - 高质量：`grok-beta`（创造力强）
   - 经济型：`gpt-4o-mini`（性价比高）

4. **测试连接** - 点击"测试连接"按钮验证配置

---

### 兼容性

- **Foundry VTT**: v13
- **PF2e 系统**: v7.0.0+

---

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

### 开发环境设置

```bash
# 克隆仓库
git clone https://github.com/losyky/ai-pf2e-assistant.git
cd ai-pf2e-assistant

# 安装依赖
npm install

# 构建生产版本
npm run build

```

---

## 🐛 问题反馈

遇到问题？请在 [GitHub Issues](https://github.com/losyky/ai-pf2e-assistant/issues) 中报告。

报告问题时，请提供：
- Foundry VTT 版本
- PF2e 系统版本
- 模块版本
- 浏览器控制台错误信息（F12）
- 重现步骤

---

## 📜 许可证

本项目采用 [MIT License](LICENSE) 许可证。

---

## 🙏 致谢

- [Foundry VTT](https://foundryvtt.com/) - 优秀的虚拟桌面平台
- [PF2e 系统](https://github.com/foundryvtt/pf2e) - 高质量的 Pathfinder 2e 实现
- PF2e跑团社区与汉化组
- 所有贡献者和用户
