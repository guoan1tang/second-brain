# 🧰 Tools · 第二大脑工具集

围绕第二大脑的各类工具,逐步完善。每个工具独立成目录,自带 README。

## 现有工具

- **[web-clipper](web-clipper/)** — 网页捕捉。浏览器扩展 + 本地捕捉服务:浏览时一键把「标题 / 网址 / 选中文字 / 备注」存入大脑收件箱,后续巩固成正式记忆。
- **[consolidator](consolidator/)** — 巩固进程。扫描收件箱碎片,分析(归类/实体关联/查重),生成巩固报告,并晋升为长期记忆(`scan` / `report` / `apply --yes`)。

## 规划中:聊天工具打通

聊天记录是情景记忆的富矿——"谁在何时说了什么"。每句话天然是 `cues.phrases`(原话即线索),说话的人天然连向实体图谱。打通后,大脑就记住"人和人说过的话"。

### 统一概念:对话记忆

不论哪个 app,都产出同结构的"对话记忆",落进收件箱(待巩固),并把说话人连向实体:

```yaml
source_app: wechat | feishu | telegram | imessage | slack
chat: "产品群"            # 群名 / 会话名
participants: [张三, 李四]
speaker: 张三              # 这句话是谁说的
spoken_at: 2026-07-26T10:30
type: episodic
tags: [chat, wechat]
cues:
  phrases: ["原话一字不差地存进来"]   # 原话 = 唤醒线索
links: [[张三]]            # 自动关联 People 实体
```

### 候选与可行性

| 工具 | 打通方式 | 可行性 | 价值 | 备注 |
|------|---------|--------|------|------|
| **chat-clip 通用片段** | 复制任意聊天消息→一键存(谁/app/原话) | 🟢 极易 | ⭐⭐⭐⭐⭐ | 万能兜底,所有 app 立即可用 |
| **feishu-sync 飞书** | 官方 Open API / 机器人(星标或@即转发) | 🟢 易 | ⭐⭐⭐⭐⭐ | 工作知识重镇 |
| **imessage-import** | 读 macOS 本地 `chat.db`(需完全磁盘权限) | 🟡 中 | ⭐⭐⭐⭐ | 仅 macOS |
| **telegram-import** | 解析 Telegram Desktop 导出的 JSON/HTML | 🟢 易 | ⭐⭐⭐⭐ | 导出干净,可批量+增量 |
| **slack-sync** | 官方 API / 工作区导出 | 🟢 易 | ⭐⭐⭐ | 视使用情况 |
| **wechat-import 微信** | 复制片段 + 解析导出的聊天记录文件 | 🔴 无安全API | ⭐⭐⭐⭐⭐ | 仅手动+日志导入;⚠️ 禁用 wechaty/itchat 挂钩(封号风险) |

> 微信没有安全的个人 API,所有"自动监听微信"方案都有封号风险,**不推荐**。故微信走「通用 chat-clip + 聊天记录文件导入」的务实路线。

### 各工具落位(均在 `tools/` 下,自包含)

- **`chat-clip/`** — 给捕捉服务加 `/chat` 接口(或极简 CLI/快捷指令):粘贴「谁 + app + 原话 + 备注」→ 对话记忆。**先做,等于一次打通所有聊天 app。**
- **`feishu-sync/`** — 飞书 Open API:拉指定会话,或部署机器人(⭐/@ 触发转发)。
- **`imessage-import/`** — 查 `chat.db`,按联系人/关键词/最近 N 条搜索→存。
- **`telegram-import/`** — 读导出目录,按会话批量生成,支持增量。
- **`wechat-import/`** — 解析微信导出的聊天记录文件(纯导入,不碰运行中的微信)。

### 建议顺序

1. 先做 **`chat-clip`**(通用片段):不依赖任何 app,搭完即可把任意聊天好句入脑。
2. 再做**实际用得最多**的那个(飞书 / 微信 / iMessage / Telegram)。
3. 其余按需。

## 其他规划

- **semantic-search** — 向量语义检索:本地 embedding,换个说法也能命中。
- 更多……欢迎提 issue / PR。

## 设计约定

- 每个工具自包含、可独立运行,自带 README 与(如需要的)`package.json`。
- 工具写入的内容都落在 vault 内,遵循统一的记忆 schema 与 `AGENTS.md` 操作协议。
- 捕捉/聊天类工具默认写入 `00-Inbox · 收件箱/`(待巩固的原始材料),不直接覆盖已有记忆。
- 聊天类工具统一产出"对话记忆"schema(`source_app`/`speaker`/`spoken_at`/`cues.phrases`),并自动把说话人链接到实体图谱。
