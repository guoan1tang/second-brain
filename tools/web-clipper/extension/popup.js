const SERVER = "http://127.0.0.1:3737";
const $ = (id) => document.getElementById(id);

function setStatus(state, msg) {
  const el = $("status");
  if (state === "ok") { el.textContent = "● 捕捉服务已连接"; el.className = "status ok"; }
  else { el.textContent = msg || "○ 捕捉服务未运行 — 请先 node tools/web-clipper/server.js"; el.className = "status off"; }
}

async function init() {
  // 1) 健康检查
  try {
    const r = await fetch(`${SERVER}/health`);
    const j = await r.json();
    setStatus(j.ok ? "ok" : "off");
  } catch {
    setStatus("off");
  }
  // 2) 采集当前页面
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    let data = null;
    try { data = await chrome.tabs.sendMessage(tab.id, { type: "getPageData" }); } catch {}
    $("title").value = (data && data.title) || tab.title || "";
    $("url").value = (data && data.url) || tab.url || "";
    if (data && data.selection) $("selection").value = data.selection;
    if (data && data.excerpt) $("note").placeholder = data.excerpt;
  } catch {
    /* 忽略采集异常,用户可手填 */
  }
}

// 自动浮层开关
chrome.storage.local.get({ sbAutoBubble: true }, (s) => { $("autoBubble").checked = s.sbAutoBubble; });
$("autoBubble").addEventListener("change", (e) => { chrome.storage.local.set({ sbAutoBubble: e.target.checked }); });

$("save").addEventListener("click", async () => {
  const btn = $("save");
  const result = $("result");
  btn.disabled = true; btn.textContent = "存入中…";
  result.textContent = ""; result.className = "result";
  const payload = {
    title: $("title").value.trim(),
    url: $("url").value.trim(),
    selection: $("selection").value,
    note: $("note").value,
    type: $("type").value,
    tags: $("tags").value.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
  };
  try {
    const r = await fetch(`${SERVER}/clip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (j.ok) { result.textContent = `✅ 已存入:${j.path}`; result.className = "result ok"; }
    else { result.textContent = `❌ 失败:${j.error || "未知错误"}`; result.className = "result err"; }
  } catch {
    result.textContent = "❌ 无法连接捕捉服务,确认 server.js 正在运行";
    result.className = "result err";
  }
  btn.disabled = false; btn.textContent = "存入第二大脑";
});

init();
