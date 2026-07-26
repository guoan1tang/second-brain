# 🧠 第二大脑(Second Brain)

一个**模仿人类大脑、可接入 AI agent 的个人记忆系统**。

它不是一个普通的笔记软件,而是一个会**巩固、会遗忘、会联想、会被一句话唤醒**的记忆系统。记忆存在本地的 Obsidian 知识库里(Markdown,你完全掌控),通过一个 MCP 服务器,任意 AI agent(Claude Code / Claude Desktop 等)都能直接读写它——并遵守内置的操作协议。

## ✨ 特性

- **大脑式分层**:收件箱(工作记忆)→ 核心记忆 / 语义 / 情景 / 程序记忆 / 实体图谱
- **记忆生命周期**:显著度、强度、遗忘曲线、间隔重复——重要的留下,琐碎的淡去
- **线索触发**:每条记忆带 `cues`(感官/原话/情境/情绪),一句话、一种气味就能唤醒它
- **知识图谱**:人/地/物/概念作为实体,用关系相连,双向链接织成联想网络
- **核心记忆**:一生难忘的(`tier: core`)永不衰减、永不归档
- **自我纠错**:小修正自动留痕;覆盖事实/删除必须用户确认;消退而非擦除
- **接入 agent**:MCP 暴露 11 个工具,agent 启动即知道"你是谁"
- **协议即产品**:`AGENTS.md` 约束所有 agent——诚实、不静默篡改、覆盖必确认、全程留痕

## 🚀 快速开始(3 步)

```bash
# 1. 克隆(或点 GitHub 的 "Use this template")
git clone https://github.com/<你的用户名>/second-brain.git
cd second-brain

# 2. 一键安装(装 MCP 依赖 + 注册到 Claude Code)
./setup.sh

# 3. 用 Obsidian 打开 vault/ 文件夹 → 新开一个 Claude Code 会话 → 完成 ✅
```

然后在 Claude Code 里试试:
- 「**看看我的第二大脑**」→ agent 调 `brain_overview`,先读协议、再了解你
- 「**记一下:我今天开始搭建第二大脑**」→ agent 调 `remember` 写进 vault
- 「**我之前记过关于 X 的事吗?**」→ agent 调 `recall` 检索

> 需要:Node.js ≥ 18、[Obsidian](https://obsidian.md)、[Claude Code](https://claude.com/claude-code)(或任意 MCP 客户端)。

## 📁 结构

```
second-brain/
├── README.md          本文件
├── setup.sh           一键安装脚本
├── vault/             ← 用 Obsidian 打开这个(你的大脑)
│   ├── AGENTS.md      Agent 操作协议(宪法)
│   ├── 00-Home.md     主页
│   ├── 00-Inbox · 收件箱/        工作记忆,待巩固
│   ├── 05-Core · 核心记忆/        永不遗忘
│   ├── 10-Semantic · 语义记忆/    事实/概念/自我画像
│   ├── 20-Episodic · 情景记忆/    何时何地(按日期)
│   ├── 30-Procedural · 程序记忆/  怎么做(SOP)
│   ├── 40-Entities · 实体图谱/    人/地/物/概念
│   ├── 90-Consolidation · 巩固日志/  巩固记录 + 更正日志
│   └── _templates/    三套记忆模板
└── mcp/               MCP 服务器(Node)
    ├── package.json
    └── server.js
```

## 🔧 MCP 工具(11 个)

| 工具 | 作用 | 自主级别 |
|------|------|---------|
| `brain_overview` | 概览(待核查/我是谁/核心/实体/概念) | — |
| `get_protocol` | 读操作协议 | — |
| `recall` | 混合检索(关键词+加权+重要度) | — |
| `get_memory` | 读全文 | — |
| `remember` | 写入新记忆 | 🟢 |
| `revise_memory` | 小修正(版本+1,留痕) | 🟡 |
| `supersede_memory` | 取代错误记忆(旧保留) | 🔴 需确认 |
| `flag_memory` | 标记待核查 | 🟢 |
| `detect_contradictions` | 扫描疑似重复/同主题 | 🟢 |
| `list_memories` | 列出记忆 | — |
| `forget` | 遗忘(软归档/硬删除) | 🔴 硬删需确认 |

## ⚙️ 自定义

- **改 vault 位置**:默认 `vault/`(相对服务器)。若移动了,注册时传 `-e VAULT_PATH=/你的路径`。
- **接入其他 MCP 客户端**(如 Claude Desktop):在客户端配置里加一个 stdio server:
  ```json
  {
    "mcpServers": {
      "second-brain": {
        "command": "node",
        "args": ["/绝对路径/mcp/server.js"],
        "env": { "VAULT_PATH": "/绝对路径/vault" }
      }
    }
  }
  ```
- **启用模板**:在 Obsidian 设置里开启核心插件「模板」,模板文件夹设为 `_templates`。

## 🧩 设计原理

核心理念:**记忆不是档案柜,而是会运作的大脑**。形似靠分层,神似靠机制(巩固、遗忘、联想、再巩固),可信靠协议(诚实、不静默篡改、覆盖必确认、全程留痕)。存储上,**Markdown 是唯一的真相来源**,所有索引可重建——数据永远透明、可 git、可手工改、不会被供应商锁定。

## 📄 License

MIT
