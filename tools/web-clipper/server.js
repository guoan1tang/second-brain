#!/usr/bin/env node
// Second Brain · 网页捕捉服务(零依赖)
// 接收浏览器扩展/书签小工具的捕捉请求,写入 vault 收件箱的 web 区。
// 只监听 127.0.0.1,不联网。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function resolveVault(rel) {
  if (process.env.VAULT_PATH) return process.env.VAULT_PATH;
  const cfg = path.join(process.env.HOME || "", ".config", "second-brain", "vault"); // 本机配置:指向你的真大脑
  try { const v = fs.readFileSync(cfg, "utf8").trim(); if (v) return v; } catch {}
  return path.resolve(__dirname, rel);
}
const VAULT = resolveVault("../../vault");
const PORT = process.env.PORT || 3737;
const WEB_DIR = path.join(VAULT, "00-Inbox · 收件箱", "web");

const sanitize = (n) => String(n).replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
const newId = () => `clip_${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

function writeClip({ title, url, selection = "", note = "", content = "", type = "episodic", tags = [] }) {
  const id = newId();
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const ts = now.toISOString().slice(0, 16).replace("T", " ");
  const allTags = ["web-clip", ...(Array.isArray(tags) ? tags : [])];
  const summary = (note || selection || title || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const fm = [
    "---",
    `id: ${id}`,
    "layer: working",
    `type: ${["episodic", "semantic", "procedural", "entity"].includes(type) ? type : "episodic"}`,
    "tier: standard",
    `title: ${JSON.stringify(String(title || url || "未命名"))}`,
    `summary: ${JSON.stringify(summary)}`,
    `source_url: ${JSON.stringify(String(url || ""))}`,
    `captured_at: ${JSON.stringify(ts)}`,
    "consolidated: false",
    "salience: 0.5",
    "cues:",
    `  context: [${JSON.stringify(String(url || ""))}]`,
    "  phrases: []",
    `tags: [${allTags.map((t) => JSON.stringify(String(t))).join(", ")}]`,
    "status: active",
    "version: 1",
    `created_at: ${JSON.stringify(date)}`,
    "---",
  ].join("\n");
  const body = [
    `> 📎 来源:[${title || url}](${url})`,
    `> 🕐 捕捉于 ${ts}`,
    "",
    selection && selection.trim() ? `## 选中内容\n\n${selection.trim()}\n` : "",
    note && note.trim() ? `## 我的备注\n\n${note.trim()}\n` : "",
    content && content.trim() ? `## 页面摘录\n\n${content.trim()}\n` : "",
  ].filter(Boolean).join("\n");
  fs.mkdirSync(WEB_DIR, { recursive: true });
  let fname = `${date}-${sanitize(title || "clip")}.md`, n = 2;
  while (fs.existsSync(path.join(WEB_DIR, fname))) { fname = `${date}-${sanitize(title || "clip")}-${n}.md`; n++; }
  const abs = path.join(WEB_DIR, fname);
  fs.writeFileSync(abs, `${fm}\n\n${body}\n`, "utf8");
  return { id, path: path.relative(VAULT, abs) };
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method === "GET" && req.url.startsWith("/health")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, vault: VAULT }));
    return;
  }
  if (req.method === "POST" && req.url.startsWith("/clip")) {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        const result = writeClip(JSON.parse(data || "{}"));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, ...result }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "not found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`🧠 Second Brain 捕捉服务已启动: http://127.0.0.1:${PORT}`);
  console.log(`   vault: ${VAULT}`);
  console.log(`   捕捉写入: ${path.relative(VAULT, WEB_DIR)}/`);
});
