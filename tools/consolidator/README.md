# 🌙 Consolidator · 巩固进程

像大脑睡眠时把白天的经历"重播"进皮层一样,巩固进程把收件箱里的**碎片**(尤其是网页捕捉)提炼、归类、晋升为**长期记忆**。

> 零依赖,纯 Node。

## 它做什么

1. 扫描 `00-Inbox · 收件箱/` 里 `consolidated: false` 的记忆
2. 对每条做分析:
   - **归类**:按 `type` 决定晋升到哪个分区(情景→情景记忆/年,语义→知识概念,程序→程序记忆)
   - **实体关联**:检测标题/正文提及的实体(人/地/物/概念),建议加为 `[[链接]]`
   - **查重**:与现有记忆做重叠检测,标记疑似重复
3. 生成**巩固报告** + 执行**晋升**(移动文件、标记 `consolidated: true`、写入实体链接、留痕巩固日志)

## 命令

```bash
cd tools/consolidator

node consolidator.js            # scan:看待巩固项与统计
node consolidator.js report     # 生成巩固报告(写入 90-Consolidation,不改记忆)
node consolidator.js apply      # 干跑:只显示将如何晋升(默认安全)
node consolidator.js apply --yes# 真正执行晋升(移动+标记+加链接+留痕)
```

> 遵循"确认优先":`apply` 默认是干跑,加 `--yes` 才真正改动——和纠错工具的护栏一致。

## 巩固 = 机械 + 创造的分工

- **本工具负责机械部分**:归类、链接、晋升、留痕——确定性、可重复。
- **创造性提炼交给 agent**:把一篇网页碎片改写成精炼的"概念记忆/情景记忆",适合让 agent 来做——读 `get_memory` 后用 `remember` / `revise_memory` 加工。巩固报告就是给 agent/你的"待办清单"。

## 典型工作流

1. 平时用 web-clipper / 手动,把碎片丢进收件箱
2. 定期跑 `report`,看一眼巩固报告(或让 agent 读它)
3. 跑 `apply`(先干跑核对,再 `apply --yes`)把碎片晋升到对应分区
4. (可选)让 agent 把晋升后的笔记进一步精炼成概念/实体

## 配置

- 默认 vault 为仓库内的 `../../vault`;可用环境变量覆盖:`VAULT_PATH=/你的/vault node consolidator.js scan`
- 巩固动作留痕到 `90-Consolidation · 巩固日志/巩固日志.md`
