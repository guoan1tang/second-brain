# 📎 Web Clipper · 网页捕捉

浏览网页时,一键把「标题 / 网址 / 选中文字 / 备注」存入你的第二大脑。
由两部分组成:

- **浏览器扩展**(`extension/`):捕捉界面,采集页面信息
- **本地捕捉服务**(`server.js`):接收捕捉请求,把内容写成标准记忆文件,存入 vault 的 `00-Inbox · 收件箱/web/`

> 为什么需要本地服务?浏览器扩展不能直接写你的本地文件,所以通过一个只监听 `127.0.0.1` 的小服务中转(安全,不联网)。

## 一、启动捕捉服务

```bash
cd tools/web-clipper
node server.js
# 默认监听 http://127.0.0.1:3737。写入哪个 vault 的优先级:
#   环境变量 VAULT_PATH  >  本机配置 ~/.config/second-brain/vault  >  仓库自带 ../../vault
# 把服务指向"你自己的大脑"(推荐,配一次后直接 node server.js 即可):
#   mkdir -p ~/.config/second-brain && echo "/你的/大脑路径" > ~/.config/second-brain/vault
# 或临时用环境变量:VAULT_PATH=/你的/vault node server.js
```

看到 `🧠 Second Brain 捕捉服务已启动` 即可。建议保持后台运行。

## 二、安装浏览器扩展(Chrome / Edge)

1. 打开 `chrome://extensions`(Edge 为 `edge://extensions`)
2. 右上角开启「**开发者模式**」
3. 点「**加载已解压的扩展程序**」,选择本目录下的 **`extension/`** 文件夹
4. 工具栏出现 🧠 图标即安装成功(可把它固定到工具栏)

## 三、使用

1. 在任意网页上(可先选中你想保存的文字)
2. 点击工具栏的 🧠 图标
3. 弹窗会自动填入标题/网址/选中文字;可补充「备注」、选类型、加标签
4. 点「**存入第二大脑**」→ 提示 `✅ 已存入:...` 即成功
5. 内容已落到 `vault/00-Inbox · 收件箱/web/`,稍后由巩固进程提炼成正式记忆

## 它存成什么样

每条捕捉生成一个 Markdown 记忆文件,带标准 frontmatter(`type`/`cues`/`source_url`/`tags`/`consolidated: false` 等),因此:

- `recall` 能按标题/标签/网址/选中内容检索到它
- 网址作为 `cues.context`,日后可凭线索召回
- `consolidated: false` 标记它是待巩固的原始材料

## 故障排查

- 弹窗显示「捕捉服务未运行」→ 确认 `node server.js` 正在跑
- 某些页面(chrome:// 商店页等)无法采集 → 属正常,可手动填标题/网址
- 端口被占用 → 用 `PORT=xxxx node server.js` 换端口(扩展默认连 3737,如需改端口请同步改 `popup.js` 里的 `SERVER`)

## 后续可做

- 划词高亮批量捕捉、网页截图、AI 自动摘要
- 自定义剪藏模板
