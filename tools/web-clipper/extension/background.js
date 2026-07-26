// 后台 service worker:中转 content script 的存盘请求(避开 content script 跨域限制),并响应健康检查。
const SERVER = "http://127.0.0.1:3737";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "clip") {
    fetch(`${SERVER}/clip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg.payload),
    })
      .then((r) => r.json())
      .then((j) => sendResponse(j))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true; // 异步
  }
  if (msg && msg.type === "health") {
    fetch(`${SERVER}/health`)
      .then((r) => r.json())
      .then((j) => sendResponse(j))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});
