// 内容脚本:① 响应弹窗取页面数据;② 选区浮层(选中文字自动弹出"存入"气泡)
// 用 closed Shadow DOM + CSSOM 内联样式:防网页 CSS 污染 + 防严格 CSP 拦截。
(function () {
  if (window.__sbInstalled) return;
  window.__sbInstalled = true;

  let enabled = true;
  chrome.storage.local.get({ sbAutoBubble: true }, (s) => { enabled = s.sbAutoBubble; });
  chrome.storage.onChanged.addListener((c) => {
    if (c.sbAutoBubble) { enabled = c.sbAutoBubble.newValue; if (!enabled) hide(); }
  });

  // ---- 供弹窗取数据 ----
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req && req.type === "getPageData") {
      let selection = "";
      try { selection = (window.getSelection() || "").toString(); } catch {}
      const metaDesc = document.querySelector('meta[name="description"]')?.content || "";
      const firstP = document.querySelector("article p, main p, p")?.innerText || "";
      sendResponse({
        ok: true, title: document.title || "", url: location.href,
        selection: selection.slice(0, 4000),
        excerpt: (metaDesc || firstP).replace(/\s+/g, " ").trim().slice(0, 600),
      });
    }
    return true;
  });

  // ---- 选区浮层 ----
  let host = null, shadow = null, bubble = null, quoteEl = null, saveBtn = null, curText = "";
  const css = (el, o) => { for (const k in o) el.style[k] = o[k]; };
  const S_BUBBLE = { position: "fixed", zIndex: "2147483647", display: "none", width: "264px", boxSizing: "border-box", background: "#fff", color: "#1a1a2e", borderRadius: "12px", boxShadow: "0 8px 30px rgba(20,20,50,.28)", border: "1px solid rgba(0,0,0,.05)", padding: "10px 12px", fontFamily: '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif', fontSize: "13px", lineHeight: "1.45", opacity: "0", transform: "translateY(4px) scale(.98)", transition: "opacity .12s ease, transform .12s ease" };

  function ensureHost() {
    if (host) return;
    host = document.createElement("div");
    host.style.cssText = "all:initial;"; // 重置,避免继承页面样式
    shadow = host.attachShadow({ mode: "closed" });
    document.documentElement.appendChild(host);

    bubble = document.createElement("div");
    css(bubble, S_BUBBLE);
    quoteEl = document.createElement("div");
    css(quoteEl, { color: "#444", maxHeight: "66px", overflow: "hidden", marginBottom: "8px", wordBreak: "break-word" });
    const row = document.createElement("div");
    css(row, { display: "flex", gap: "6px", alignItems: "center" });
    saveBtn = document.createElement("button");
    css(saveBtn, { flex: "1", background: "#6c63ff", color: "#fff", border: "none", borderRadius: "8px", padding: "7px 8px", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit" });
    saveBtn.textContent = "🧠 存入第二大脑";
    const hoverOn = () => { if (!saveBtn.disabled) saveBtn.style.background = "#5a52e0"; };
    saveBtn.addEventListener("mouseenter", hoverOn);
    saveBtn.addEventListener("mouseleave", () => { saveBtn.style.background = "#6c63ff"; });
    const closeBtn = document.createElement("button");
    css(closeBtn, { background: "transparent", border: "none", color: "#9aa", fontSize: "18px", lineHeight: "1", cursor: "pointer", padding: "2px 7px", borderRadius: "6px" });
    closeBtn.textContent = "×";
    closeBtn.addEventListener("mouseenter", () => { closeBtn.style.background = "#f0f0f3"; closeBtn.style.color = "#333"; });
    closeBtn.addEventListener("mouseleave", () => { closeBtn.style.background = "transparent"; closeBtn.style.color = "#9aa"; });
    closeBtn.addEventListener("click", hide);
    saveBtn.addEventListener("click", doSave);
    row.appendChild(saveBtn); row.appendChild(closeBtn);
    bubble.appendChild(quoteEl); bubble.appendChild(row);
    shadow.appendChild(bubble);
  }

  function position() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    bubble.style.visibility = "hidden"; bubble.style.left = "0px"; bubble.style.top = "0px"; bubble.style.display = "block";
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    bubble.style.visibility = "";
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = rect.left + rect.width / 2 - bw / 2;
    left = Math.max(8, Math.min(vw - bw - 8, left));
    let top = rect.top - bh - 10;
    if (top < 8) top = rect.bottom + 10;
    if (top + bh > vh - 8) top = Math.max(8, vh - bh - 8);
    bubble.style.left = left + "px"; bubble.style.top = top + "px";
  }

  function show(text) {
    ensureHost();
    curText = text;
    quoteEl.textContent = "“" + (text.length > 120 ? text.slice(0, 120) + "…" : text) + "”";
    quoteEl.style.color = "#444"; quoteEl.style.fontWeight = "normal";
    saveBtn.textContent = "🧠 存入第二大脑"; saveBtn.disabled = false; saveBtn.style.background = "#6c63ff";
    bubble.style.display = "block";
    position();
    requestAnimationFrame(() => { bubble.style.opacity = "1"; bubble.style.transform = "none"; });
  }
  function hide() {
    if (!bubble) return;
    bubble.style.opacity = "0"; bubble.style.transform = "translateY(4px) scale(.98)";
    setTimeout(() => { if (bubble) bubble.style.display = "none"; }, 140);
  }

  async function doSave() {
    saveBtn.disabled = true; saveBtn.textContent = "存入中…";
    const payload = { title: document.title, url: location.href, selection: curText, text: curText, note: "", type: "episodic", tags: ["web-clip", "highlight"] };
    let res;
    try { res = await chrome.runtime.sendMessage({ type: "clip", payload }); }
    catch (e) { res = { ok: false, error: e.message }; }
    if (res && res.ok) {
      quoteEl.textContent = "✅ 已存入第二大脑"; quoteEl.style.color = "#1a7f4b"; quoteEl.style.fontWeight = "600";
      setTimeout(hide, 1000);
    } else {
      quoteEl.textContent = "❌ 存入失败(捕捉服务未运行?)"; quoteEl.style.color = "#c0392b";
      saveBtn.textContent = "🧠 重试"; saveBtn.disabled = false;
    }
  }

  // 选区结束(松开鼠标)→ 决定是否弹出
  document.addEventListener("mouseup", () => {
    if (!enabled) return;
    setTimeout(() => {
      let text = "";
      try { text = (window.getSelection() || "").toString().trim(); } catch {}
      if (text.length >= 2 && text.length <= 4000) show(text);
      else if (bubble && bubble.style.display !== "none" && quoteEl.textContent.indexOf("✅") !== 0) hide();
    }, 10);
  }, true);
  // 点空白处/滚动/Esc → 收起
  document.addEventListener("mousedown", (e) => {
    if (!bubble || bubble.style.display === "none") return;
    if (e.target === host) return; // 点在我们的浮层内(closed shadow 在 document 层表现为 host)
    hide();
  }, true);
  document.addEventListener("scroll", () => { if (bubble && bubble.style.display !== "none") hide(); }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); }, true);
})();
