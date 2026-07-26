// 内容脚本:接收弹窗请求,返回当前页面的标题/网址/选中文字/摘录
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req && req.type === "getPageData") {
    let selection = "";
    try { selection = (window.getSelection() || "").toString(); } catch {}
    const metaDesc = document.querySelector('meta[name="description"]')?.content || "";
    const firstP = document.querySelector("article p, main p, p")?.innerText || "";
    sendResponse({
      ok: true,
      title: document.title || "",
      url: location.href,
      selection: selection.slice(0, 4000),
      excerpt: (metaDesc || firstP).replace(/\s+/g, " ").trim().slice(0, 600),
    });
  }
  return true;
});
