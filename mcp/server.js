#!/usr/bin/env node
// 第二大脑 MCP Server
// Markdown 是真相来源;内存索引做混合检索;纠错分级 + 全程留痕。
// 默认 vault = 本文件同级的 ../vault(克隆即用,零配置);可用环境变量 VAULT_PATH 覆盖。
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function resolveVault(rel) {
  if (process.env.VAULT_PATH) return process.env.VAULT_PATH;
  const cfg = path.join(process.env.HOME || "", ".config", "second-brain", "vault");
  try { const v = fs.readFileSync(cfg, "utf8").trim(); if (v) return v; } catch {}
  return path.resolve(__dirname, rel);
}
const VAULT = resolveVault("../vault");

const DIR = {
  inbox: "00-Inbox · 收件箱",
  core: "05-Core · 核心记忆",
  semanticKnowledge: path.join("10-Semantic · 语义记忆", "Knowledge · 知识概念"),
  episodic: "20-Episodic · 情景记忆",
  procedural: "30-Procedural · 程序记忆",
  entities: "40-Entities · 实体图谱",
  consolidation: "90-Consolidation · 巩固日志",
};
const EXCLUDE_DIRS = new Set([".obsidian", "_templates", "node_modules"]);
const AUDIT_LOG = path.join(VAULT, DIR.consolidation, "更正日志.md");

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (EXCLUDE_DIRS.has(e.name)) continue; yield* walk(full); }
    else if (e.isFile() && e.name.endsWith(".md")) {
      if (e.name.startsWith("_关于") || e.name.startsWith("更正日志")) continue;
      yield full;
    }
  }
}
function parseScalars(fm) {
  const out = {};
  for (const line of fm.split("\n")) {
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
function extractRegions(fm) {
  const lines = fm.split("\n");
  let tags = "", links = "", cues = "", inCues = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^tags:/.test(line)) {
      tags = line.replace(/^tags:/, "").trim();
      if (tags === "" || tags === "[]") {
        let j = i + 1; const items = [];
        while (j < lines.length && /^\s+-\s+/.test(lines[j])) { items.push(lines[j].replace(/^\s+-\s+/, "").trim()); j++; }
        tags = items.join(", ");
      }
    }
    if (/^(links|entities):/.test(line)) {
      links += " " + line.replace(/^(links|entities):/, "");
      let j = i + 1;
      while (j < lines.length && /^\s+-\s+/.test(lines[j])) { links += " " + lines[j].replace(/^\s+-\s+/, "").trim(); j++; }
    }
    if (/^cues:/.test(line)) { inCues = true; continue; }
    if (inCues) { if (/^\S/.test(line)) inCues = false; else cues += line + "\n"; }
  }
  return { tags, cues, links };
}
function parseMemoryFile(full) {
  const raw = fs.readFileSync(full, "utf8");
  const rel = path.relative(VAULT, full);
  let frontmatter = "", body = raw;
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (m) { frontmatter = m[1]; body = m[2]; }
  const fm = parseScalars(frontmatter);
  const regions = extractRegions(frontmatter);
  return {
    path: rel, absPath: full, id: fm.id || rel,
    title: fm.title || path.basename(full, ".md"),
    type: fm.type || "", tier: fm.tier || "standard",
    status: fm.status || "active", version: parseInt(fm.version) || 1,
    needs_review: fm.needs_review === "true",
    confidence: fm.confidence ? parseFloat(fm.confidence) : null,
    salience: parseFloat(fm.salience) || 0.5, strength: parseFloat(fm.strength) || 0.5,
    created_at: fm.created_at || "",
    tagsText: regions.tags, cuesText: regions.cues, linksText: regions.links,
    frontmatter, body,
  };
}
let cache = null;
function vaultSignature() {
  const files = [...walk(VAULT)].sort();
  const parts = files.map((f) => { try { return f + ":" + fs.statSync(f).mtimeMs; } catch { return f; } });
  return crypto.createHash("md5").update(parts.join("|")).digest("hex") + ":" + files.length;
}
function getIndex() {
  const sig = vaultSignature();
  if (cache && cache.sig === sig) return cache.memories;
  const memories = [];
  for (const f of walk(VAULT)) { try { memories.push(parseMemoryFile(f)); } catch {} }
  cache = { sig, memories };
  return memories;
}
function tokenize(text) {
  text = String(text).toLowerCase();
  const tokens = new Set();
  for (const w of text.match(/[a-z0-9]+/g) || []) if (w.length >= 2) tokens.add(w);
  for (const run of text.match(/[一-鿿]+/g) || []) {
    if (run.length <= 3) tokens.add(run);
    if (run.length === 1) tokens.add(run);
    for (let i = 0; i + 1 < run.length; i++) tokens.add(run.slice(i, i + 2));
  }
  return [...tokens];
}
const count = (h, n) => (n ? h.split(n).length - 1 : 0);
function keywordScores(query, memories) {
  const qTokens = tokenize(query);
  const map = new Map();
  for (const m of memories) {
    const title = m.title.toLowerCase(), tags = m.tagsText.toLowerCase(), cues = m.cuesText.toLowerCase(),
      links = m.linksText.toLowerCase(), body = m.body.toLowerCase();
    let s = 0;
    for (const t of qTokens) s += 5 * count(title, t) + 4 * count(tags, t) + 4 * count(cues, t) + 2 * count(links, t) + 1 * count(body, t);
    if (s > 0) map.set(m.path, s);
  }
  return map;
}
function recall(query, k = 5, typeFilter = null) {
  const memories = getIndex().filter((m) => m.status === "active" && (!typeFilter || m.type === typeFilter));
  const ranked = [...keywordScores(query, memories).entries()].sort((a, b) => b[1] - a[1]);
  const byPath = new Map(memories.map((m) => [m.path, m]));
  const results = [];
  for (const [p, s] of ranked) {
    const m = byPath.get(p); if (!m) continue;
    const prior = 1 + 0.6 * (m.tier === "core" ? 1 : 0) + 0.4 * m.salience + 0.2 * m.strength;
    results.push({ m, score: +(s * prior).toFixed(3) });
  }
  return results.slice(0, k);
}
const serializeValue = (v) => (typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(String(v)));
function buildFrontmatter(o) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      if (!v.length) lines.push(`${k}: []`);
      else { lines.push(`${k}:`); for (const it of v) lines.push(`  - ${JSON.stringify(String(it))}`); }
    } else lines.push(`${k}: ${serializeValue(v)}`);
  }
  lines.push("---");
  return lines.join("\n");
}
const splitFrontmatter = (raw) => { const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/); return m ? { fm: m[1], body: m[2] } : { fm: null, body: raw }; };
function setFrontmatterField(absPath, key, value) {
  const raw = fs.readFileSync(absPath, "utf8");
  const { fm, body } = splitFrontmatter(raw);
  if (fm === null) return false;
  const re = new RegExp(`^${key}:.*$`, "m");
  const newFm = re.test(fm) ? fm.replace(re, `${key}: ${serializeValue(value)}`) : fm + `\n${key}: ${serializeValue(value)}`;
  fs.writeFileSync(absPath, `---\n${newFm}\n---\n${body}`, "utf8");
  return true;
}
function replaceBody(absPath, newBody) {
  const { fm } = splitFrontmatter(fs.readFileSync(absPath, "utf8"));
  fs.writeFileSync(absPath, fm === null ? newBody : `---\n${fm}\n---\n\n${newBody.trim()}\n`, "utf8");
}
function bumpVersion(absPath) {
  const m = fs.readFileSync(absPath, "utf8").match(/^version:\s*(\d+)/m);
  const next = (m ? parseInt(m[1]) : 1) + 1;
  setFrontmatterField(absPath, "version", next);
  return next;
}
function audit(entry) {
  const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
  fs.mkdirSync(path.dirname(AUDIT_LOG), { recursive: true });
  if (!fs.existsSync(AUDIT_LOG)) fs.writeFileSync(AUDIT_LOG, "---\ntitle: 更正日志\ntags: [更正日志, 留痕]\n---\n\n# 更正日志\n\n> 所有对记忆的修正/取代/标记/删除都记录于此。记忆永不静默更改。\n", "utf8");
  fs.appendFileSync(AUDIT_LOG, `\n## [${ts}] ${entry.action} · ${entry.title}\n- id: \`${entry.id}\`\n- 原因: ${entry.reason || "(未说明)"}\n${entry.detail || ""}- 操作者: ${entry.by || "agent"}\n`, "utf8");
}
function folderFor(type, tier) {
  if (tier === "core") return DIR.core;
  switch (type) {
    case "episodic": return path.join(DIR.episodic, String(new Date().getFullYear()));
    case "semantic": return DIR.semanticKnowledge;
    case "procedural": return DIR.procedural;
    case "entity": return DIR.entities;
    default: return DIR.inbox;
  }
}
const sanitizeFilename = (n) => String(n).replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
const newId = (p) => `${p}_${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
function createMemory({ content, type = "episodic", title, tags = [], tier = "standard", salience = 0.6, links = [], emotion = "", confidence = null, needs_review = false }) {
  const id = newId(type === "entity" ? "ent" : "mem");
  const finalTitle = title || content.slice(0, 30).replace(/\n/g, " ");
  const now = new Date().toISOString().slice(0, 10);
  const fm = buildFrontmatter({
    id, layer: "long-term", type, tier, title: finalTitle,
    summary: content.slice(0, 60).replace(/\n/g, " "),
    salience, strength: tier === "core" ? 1.0 : 0.8, emotion, confidence, needs_review,
    consolidated: true, consolidated_at: now,
    links: links.map((l) => (String(l).startsWith("[[") ? l : `[[${l}]]`)),
    tags, status: "active", version: 1, created_at: now, source: { agent: "mcp" },
  });
  const dir = path.join(VAULT, folderFor(type, tier));
  fs.mkdirSync(dir, { recursive: true });
  const base = sanitizeFilename(finalTitle);
  const dp = type === "episodic" ? `${now}-` : "";
  let fname = `${dp}${base}.md`, n = 2;
  while (fs.existsSync(path.join(dir, fname))) { fname = `${dp}${base}-${n}.md`; n++; }
  const abs = path.join(dir, fname);
  fs.writeFileSync(abs, `${fm}\n\n${content.trim()}\n`, "utf8");
  cache = null;
  return { id, path: path.relative(VAULT, abs), absPath: abs, title: finalTitle, type, tier };
}
function findByRef(ref) {
  const memories = getIndex(); const r = String(ref);
  const pool = [...memories.filter((m) => m.status === "active"), ...memories];
  return pool.find((m) => m.id === r) || pool.find((m) => m.title === r) || pool.find((m) => m.path === r) ||
    pool.find((m) => m.title.toLowerCase().includes(r.toLowerCase()));
}
function detectContradictions(limit = 20) {
  const memories = getIndex().filter((m) => m.status === "active");
  const wt = memories.map((m) => ({ m, tokens: new Set(tokenize(m.title + " " + m.tagsText + " " + m.body.slice(0, 400))) }));
  const dupes = [];
  for (let i = 0; i < wt.length; i++) for (let j = i + 1; j < wt.length; j++) {
    const a = wt[i], b = wt[j];
    const inter = [...a.tokens].filter((t) => b.tokens.has(t)).length;
    const uni = new Set([...a.tokens, ...b.tokens]).size;
    const jac = uni ? inter / uni : 0;
    if (jac > 0.45) dupes.push({ a: a.m, b: b.m, jac: +jac.toFixed(2) });
  }
  dupes.sort((x, y) => y.jac - x.jac);
  const byEntity = new Map();
  for (const m of memories) for (const l of [...m.linksText.matchAll(/\[\[([^\]]+)\]\]/g)].map((x) => x[1])) {
    if (!byEntity.has(l)) byEntity.set(l, new Set());
    byEntity.get(l).add(m.title);
  }
  const entityGroups = [...byEntity.entries()].filter(([_, s]) => s.size >= 2).map(([k, s]) => ({ entity: k, titles: [...s] })).slice(0, limit);
  return { dupes: dupes.slice(0, limit), entityGroups };
}
const text = (s) => ({ content: [{ type: "text", text: s }] });
const err = (s) => ({ content: [{ type: "text", text: s }], isError: true });

function toolBrainOverview() {
  const memories = getIndex();
  const byType = {}; for (const m of memories) byType[m.type || "other"] = (byType[m.type || "other"] || 0) + 1;
  const review = memories.filter((m) => m.needs_review && m.status === "active");
  const core = memories.filter((m) => m.tier === "core" && m.status === "active");
  const entities = memories.filter((m) => m.type === "entity" && m.status === "active");
  const concepts = memories.filter((m) => m.path.includes("Knowledge"));
  const episodes = memories.filter((m) => m.type === "episodic" && m.status === "active").sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  const profile = memories.find((m) => m.title === "关于我");
  const lines = ["# 🧠 第二大脑概览", "", "📜 **第一步:调用 `get_protocol` 阅读并严格遵守《记忆系统操作协议》**。", "", `共 ${memories.length} 条记忆。按类型:${Object.entries(byType).map(([t, n]) => `${t}×${n}`).join(", ")}`, ""];
  if (review.length) { lines.push("## ⚠️ 待核查 — 请优先处理"); for (const m of review) lines.push(`- ${m.title}  \`id:${m.id}\``); lines.push(""); }
  if (profile) { lines.push("## 我是谁(先读这个)"); lines.push(profile.body.replace(/\n{2,}/g, "\n").slice(0, 600)); lines.push(""); }
  if (core.length) { lines.push("## ⭐ 核心记忆"); for (const m of core) lines.push(`- ${m.title}  \`id:${m.id}\``); lines.push(""); }
  if (entities.length) { lines.push("## 🕸️ 实体"); for (const m of entities) lines.push(`- ${m.title}  \`id:${m.id}\``); lines.push(""); }
  if (concepts.length) { lines.push("## 📚 概念节点"); for (const m of concepts) lines.push(`- ${m.title}`); lines.push(""); }
  if (episodes.length) { lines.push("## 🗓️ 最近情景记忆"); for (const m of episodes.slice(0, 8)) lines.push(`- [${m.created_at}] ${m.title}`); lines.push(""); }
  return text(lines.join("\n"));
}
function toolRecall({ query, k = 5, type }) {
  const results = recall(query, k, type || null);
  if (!results.length) return text(`未找到与「${query}」相关的记忆。`);
  const lines = [`# 检索「${query}」命中 ${results.length} 条`, ""];
  for (const { m, score } of results) {
    lines.push(`## ${m.title}  (相关度 ${score})`);
    lines.push(`- id: \`${m.id}\` | ${m.type} | ${m.tier} | v${m.version} | ${m.path}`);
    lines.push(`- 摘要: ${m.body.replace(/\s+/g, " ").trim().slice(0, 120)}…`); lines.push("");
  }
  return text(lines.join("\n"));
}
function toolGetMemory({ ref }) {
  const m = findByRef(ref); if (!m) return err(`找不到记忆:${ref}`);
  const flags = []; if (m.status !== "active") flags.push(`status:${m.status}`); if (m.needs_review) flags.push("⚠️待核查");
  return text(`# ${m.title}\n\n\`id:${m.id} | ${m.type} | ${m.tier} | v${m.version}${flags.length ? " | " + flags.join(" ") : ""} | ${m.path}\`\n\n---\n${m.body.trim()}`);
}
function toolRevise({ ref, new_content, reason }) {
  const m = findByRef(ref); if (!m) return err(`找不到记忆:${ref}`);
  const old = m.body.replace(/\s+/g, " ").trim().slice(0, 200);
  replaceBody(m.absPath, new_content);
  const v = bumpVersion(m.absPath);
  if (m.needs_review) setFrontmatterField(m.absPath, "needs_review", false);
  cache = null;
  audit({ action: "revise(修正)", id: m.id, title: m.title, reason, detail: `- 版本: v${v - 1} → v${v}\n- 修正前(节选): ${old}\n- 修正后(节选): ${new_content.replace(/\s+/g, " ").trim().slice(0, 200)}\n` });
  return text(`✏️ 已修正「${m.title}」→ v${v}。已记录到更正日志。`);
}
function toolSupersede({ ref, correction, reason, confirmed = false }) {
  const m = findByRef(ref); if (!m) return err(`找不到记忆:${ref}`);
  if (confirmed !== true) return text(`⚠️ 即将【取代】(高风险):${m.title}\n请先向用户说明矛盾并获确认,再传 confirmed=true 重新调用。`);
  const tagsArr = m.tagsText.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  const created = createMemory({ content: correction, type: m.type || "episodic", title: m.title, tags: tagsArr, tier: m.tier, salience: m.salience, links: [m.title] });
  setFrontmatterField(created.absPath, "supersedes", m.id);
  setFrontmatterField(m.absPath, "status", "superseded");
  setFrontmatterField(m.absPath, "superseded_by", created.id);
  setFrontmatterField(m.absPath, "superseded_reason", reason);
  setFrontmatterField(m.absPath, "corrected_at", new Date().toISOString().slice(0, 10));
  cache = null;
  audit({ action: "supersede(取代)", id: m.id, title: m.title, reason, detail: `- 旧: ${m.path}(已 superseded)\n- 新: \`${created.id}\` (${created.path})\n` });
  return text(`✅ 已取代。旧「${m.title}」→ superseded;新 \`${created.id}\`。已留痕。`);
}
function toolFlag({ ref, reason }) {
  const m = findByRef(ref); if (!m) return err(`找不到记忆:${ref}`);
  setFrontmatterField(m.absPath, "needs_review", true); cache = null;
  audit({ action: "flag(待核查)", id: m.id, title: m.title, reason });
  return text(`🚩 已标记「${m.title}」为待核查。`);
}
function toolDetectContradictions({ limit = 20 }) {
  const { dupes, entityGroups } = detectContradictions(limit);
  const lines = ["# 🔍 矛盾/一致性核查", "", "## 疑似重复"];
  if (!dupes.length) lines.push("- (无)");
  for (const d of dupes) lines.push(`- 重叠度 ${d.jac}: 「${d.a.title}」 ↔ 「${d.b.title}」`);
  lines.push("", "## 同实体/同主题组");
  if (!entityGroups.length) lines.push("- (无)");
  for (const g of entityGroups) lines.push(`- [[${g.entity}]]: ${g.titles.join(" / ")}`);
  return text(lines.join("\n"));
}
function toolListMemories({ type, tier, limit = 30 }) {
  let memories = getIndex().filter((m) => m.status === "active");
  if (type) memories = memories.filter((m) => m.type === type);
  if (tier) memories = memories.filter((m) => m.tier === tier);
  memories = memories.slice(0, limit);
  if (!memories.length) return text("没有符合条件的记忆。");
  return text([`# 记忆列表(${memories.length} 条)`, "", ...memories.map((m) => `- \`${m.id}\` | ${m.type}/${m.tier} | v${m.version}${m.needs_review ? " | ⚠️" : ""} | ${m.title}  _(${m.path})_`)].join("\n"));
}
function toolForget({ ref, hard = false, confirmed = false }) {
  const m = findByRef(ref); if (!m) return err(`找不到记忆:${ref}`);
  if (hard && confirmed !== true) return text(`⚠️ 即将【彻底删除】(不可逆):${m.title}\n请用户确认后传 confirmed=true。`);
  if (hard) { fs.unlinkSync(m.absPath); cache = null; audit({ action: "forget(硬删除)", id: m.id, title: m.title, reason: "用户确认" }); return text(`🗑️ 已彻底删除:${m.title}`); }
  setFrontmatterField(m.absPath, "status", "archived"); cache = null;
  audit({ action: "forget(软归档)", id: m.id, title: m.title, reason: "软遗忘(可恢复)" });
  return text(`📦 已归档:${m.title}`);
}
const FALLBACK_PROTOCOL = "记忆系统操作协议(精简):①诚实不编造 ②不静默篡改(改/删必留痕,高风险需确认) ③可逆优先 ④用户主权。纠错分级:flag/revise 可自主(留痕);supersede/硬删除/改 core 必须 confirmed=true。只信任 status:active。完整见 vault 根目录 AGENTS.md。";
function toolProtocol() {
  try { return text(fs.readFileSync(path.join(VAULT, "AGENTS.md"), "utf8")); } catch { return text(FALLBACK_PROTOCOL); }
}

async function startServer() {
  const server = new McpServer({ name: "second-brain", version: "1.0.0" });
  server.tool("brain_overview", "概览第二大脑;接入后第一步调用,并按提示先读操作协议。", {}, async () => toolBrainOverview());
  server.tool("get_protocol", "返回《记忆系统操作协议》全文。接入后必须首先调用并遵守。", {}, async () => toolProtocol());
  server.tool("recall", "按关键词/线索检索记忆(只返回 active)。", { query: z.string(), k: z.number().int().min(1).max(20).optional(), type: z.string().optional() }, async (a) => toolRecall(a));
  server.tool("get_memory", "读一条记忆全文(id/标题/路径)。", { ref: z.string() }, async (a) => toolGetMemory(a));
  server.tool("remember", "写入新记忆,自动归档。", { content: z.string(), type: z.enum(["episodic", "semantic", "procedural", "entity"]).optional(), title: z.string().optional(), tags: z.array(z.string()).optional(), tier: z.enum(["core", "standard", "trace"]).optional(), salience: z.number().min(0).max(1).optional(), links: z.array(z.string()).optional(), emotion: z.string().optional(), confidence: z.number().min(0).max(1).optional(), needs_review: z.boolean().optional() }, async (a) => { const c = createMemory(a); return text(`✅ 已记住 \`${c.id}\`\n- 标题: ${c.title}\n- 路径: ${c.path}`); });
  server.tool("revise_memory", "小修正(版本+1,留痕,可自主)。", { ref: z.string(), new_content: z.string(), reason: z.string() }, async (a) => toolRevise(a));
  server.tool("supersede_memory", "取代错误记忆(高风险)。⚠️必须先获用户确认再传 confirmed=true;否则只预览。", { ref: z.string(), correction: z.string(), reason: z.string(), confirmed: z.boolean().optional() }, async (a) => toolSupersede(a));
  server.tool("flag_memory", "标记待核查(不改内容,可自主)。", { ref: z.string(), reason: z.string() }, async (a) => toolFlag(a));
  server.tool("detect_contradictions", "扫描疑似重复/同主题记忆组。", { limit: z.number().int().min(1).max(100).optional() }, async (a) => toolDetectContradictions(a));
  server.tool("list_memories", "列出 active 记忆。", { type: z.string().optional(), tier: z.string().optional(), limit: z.number().int().min(1).max(200).optional() }, async (a) => toolListMemories(a));
  server.tool("forget", "遗忘(默认软归档;hard=true 彻底删除需 confirmed=true)。", { ref: z.string(), hard: z.boolean().optional(), confirmed: z.boolean().optional() }, async (a) => toolForget(a));
  await server.connect(new StdioServerTransport());
  console.error(`[second-brain-mcp] ready, vault=${VAULT}, memories=${getIndex().length}`);
}

function runSelfTest() {
  console.log(`Vault: ${VAULT}\n已索引: ${getIndex().length}\n`);
  for (const q of ["你好", "记忆"]) {
    console.log(`🔎 「${q}」`);
    const res = recall(q, 3);
    if (!res.length) console.log("   (无命中——新建记忆后再试)");
    for (const { m, score } of res) console.log(`   ${score}  ${m.title} [${m.tier}]`);
    console.log("");
  }
  console.log("✅ 服务器正常。");
}
if (process.argv.includes("--test")) runSelfTest();
else startServer().catch((e) => { console.error("fatal:", e); process.exit(1); });
