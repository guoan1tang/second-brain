#!/usr/bin/env node
// 第二大脑 · 巩固进程(零依赖)
// 扫描收件箱"待巩固"记忆,分析(分类/实体关联/查重),生成巩固报告,可晋升归档(消退→长期记忆)。
// 用法:
//   node consolidator.js            # scan:看待巩固项与统计
//   node consolidator.js report     # 生成巩固报告(分析,不改文件)
//   node consolidator.js apply      # 干跑:显示将如何晋升(默认安全,不改动)
//   node consolidator.js apply --yes# 真正执行晋升(移动+标记 consolidated+加实体链接+留痕)
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
const VAULT = resolveVault("../../vault");
const INBOX = path.join(VAULT, "00-Inbox · 收件箱");
const CONSOL_DIR = path.join(VAULT, "90-Consolidation · 巩固日志");
const CONSOL_LOG = path.join(CONSOL_DIR, "巩固日志.md");

const PARTITION = {
  episodic: path.join("20-Episodic · 情景记忆"),
  semantic: path.join("10-Semantic · 语义记忆", "Knowledge · 知识概念"),
  procedural: path.join("30-Procedural · 程序记忆"),
  entity: path.join("40-Entities · 实体图谱"),
};
const EXCLUDE_DIRS = new Set([".obsidian", "_templates", "node_modules"]);

// ---------- 解析 ----------
function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (EXCLUDE_DIRS.has(e.name)) continue; yield* walk(full); }
    else if (e.isFile() && e.name.endsWith(".md") && !e.name.startsWith("_关于") && e.name !== "更正日志.md" && !e.name.startsWith("巩固")) yield full;
  }
}
function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  return m ? { fm: m[1], body: m[2] } : { fm: "", body: raw };
}
function field(fm, key) {
  const m = fm.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  if (!m) return null;
  let v = m[1].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
}
function inlineList(fm, key) {
  const line = field(fm, key);
  if (!line) return [];
  if (line.startsWith("[")) return line.slice(1, -1).split(",").map((s) => s.replace(/^["']|["']$/g, "").trim()).filter(Boolean);
  // block list
  const out = [];
  const re = new RegExp(`^${key}:[\\s\\S]*?(?=\\n[A-Za-z_]|$)`, "m");
  const seg = fm.match(re)?.[0] || "";
  for (const im of seg.matchAll(/^\s+-\s*(.+)$/gm)) out.push(im[1].trim().replace(/^["']|["']$/g, ""));
  return out;
}
function loadAll() {
  const list = [];
  for (const f of walk(VAULT)) {
    const raw = fs.readFileSync(f, "utf8");
    const { fm, body } = parseFrontmatter(raw);
    list.push({
      path: path.relative(VAULT, f), absPath: f,
      id: field(fm, "id") || path.basename(f),
      title: field(fm, "title") || path.basename(f, ".md"),
      type: field(fm, "type") || "",
      tier: field(fm, "tier") || "standard",
      status: field(fm, "status") || "active",
      consolidated: field(fm, "consolidated") === "true",
      created_at: field(fm, "created_at") || "",
      aliases: inlineList(fm, "aliases"),
      links: inlineList(fm, "links"),
      fm, body,
    });
  }
  return list;
}
function tokenize(t) {
  t = String(t).toLowerCase();
  const s = new Set();
  for (const w of t.match(/[a-z0-9]+/g) || []) if (w.length >= 3) s.add(w);
  for (const run of t.match(/[一-鿿]+/g) || []) {
    if (run.length <= 3) s.add(run);
    for (let i = 0; i + 1 < run.length; i++) s.add(run.slice(i, i + 2));
  }
  return s;
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const x of a) if (b.has(x)) inter++;
  return inter / new Set([...a, ...b]).size;
}

// ---------- 分析 ----------
function analyze(all) {
  const inbox = all.filter((m) => m.path.startsWith("00-Inbox") && !m.consolidated && m.status === "active");
  const entities = all.filter((m) => m.type === "entity" || m.path.includes("40-Entities"));
  const activeMem = all.filter((m) => m.status === "active" && !m.path.startsWith("00-Inbox"));
  const memTokens = activeMem.map((m) => ({ m, tok: tokenize(m.title + " " + m.body.slice(0, 500)) }));

  return inbox.map((item) => {
    const type = item.type && PARTITION[item.type] ? item.type : "episodic";
    const year = (item.created_at || new Date().toISOString()).slice(0, 4);
    const targetRel = type === "episodic" ? path.join(PARTITION.episodic, year) : PARTITION[type];
    // 实体关联:标题+正文提及的实体名/别名
    const hay = (item.title + " " + item.body).toLowerCase();
    const entityLinks = [];
    for (const ent of entities) {
      const names = [ent.title, ...ent.aliases].filter(Boolean);
      for (const nm of names) if (nm.length >= 2 && hay.includes(String(nm).toLowerCase())) { entityLinks.push(ent.title); break; }
    }
    // 查重:与现有记忆的重叠
    const itTok = tokenize(item.title + " " + item.body.slice(0, 500));
    const dup = memTokens.map((x) => ({ t: x.m.title, j: jaccard(itTok, x.tok) })).filter((x) => x.j > 0.5).sort((a, b) => b.j - a.j).slice(0, 2);
    return { item, type, targetRel, entityLinks: [...new Set(entityLinks)], dup };
  });
}

// ---------- 输出 ----------
function scan() {
  const all = loadAll();
  const plan = analyze(all);
  console.log(`📦 收件箱待巩固:${plan.length} 条   (vault: ${VAULT})\n`);
  if (!plan.length) { console.log("✨ 收件箱已清空,无需巩固。"); return plan; }
  for (const p of plan) {
    console.log(`• ${p.item.title}`);
    console.log(`    路径  : ${p.item.path}`);
    console.log(`    类型  : ${p.type}  →  ${p.targetRel}/`);
    if (p.entityLinks.length) console.log(`    关联  : ${p.entityLinks.map((e) => `[[${e}]]`).join(" ")}`);
    if (p.dup.length) console.log(`    ⚠️ 疑似重复: ${p.dup.map((d) => `${d.t}(${d.j})`).join(", ")}`);
    console.log("");
  }
  return plan;
}
function report() {
  const plan = scan();
  const date = new Date().toISOString().slice(0, 10);
  const lines = [`---`, `title: "巩固报告 ${date}"`, `tags: [巩固报告]`, `created_at: "${date}"`, `---`, ``, `# 🌙 巩固报告 ${date}`, ``, `> 收件箱待巩固 **${plan.length}** 条。本文件由巩固进程生成,供人工/agent 复核后执行 \`apply --yes\`。`, ``];
  for (const p of plan) {
    lines.push(`## ${p.item.title}`, `- 当前:\`${p.item.path}\``, `- 晋升到:\`${p.targetRel}/\`(类型 ${p.type})`, `- 建议实体链接:${p.entityLinks.length ? p.entityLinks.map((e) => `\`[[${e}]]\``).join(" ") : "(无)"}`, `- 查重:${p.dup.length ? p.dup.map((d) => `「${d.t}」重叠 ${d.j}`).join(";") : "无重复"}`, `- 摘要:${(p.item.body.replace(/\s+/g, " ").trim().slice(0, 100) || "(空)")}`, ``);
  }
  lines.push(`> 提示:把网页碎片提炼成精炼的「概念/情景记忆」这类创造性工作,适合交给 agent(读 \`get_memory\` 后用 \`remember\`/\`revise_memory\` 加工);本工具负责机械的归类、链接与晋升。`);
  const out = lines.join("\n");
  fs.mkdirSync(CONSOL_DIR, { recursive: true });
  const repPath = path.join(CONSOL_DIR, `巩固报告-${date}.md`);
  fs.writeFileSync(repPath, out + "\n", "utf8");
  console.log(`\n📄 报告已写入:${path.relative(VAULT, repPath)}`);
}

// ---------- 晋升 ----------
function withLinks(fmStr, names) {
  if (!names.length) return fmStr;
  const add = names.map((n) => `[[${n}]]`);
  const blockRe = /^links:[^\n]*(?:\n[ \t]+-[^\n]*)*/m;
  let existing = [];
  const m = fmStr.match(blockRe);
  if (m) {
    const seg = m[0];
    const inline = seg.match(/^links:\s*\[([^\]]*)\]/m);
    if (inline) existing = inline[1].split(",").map((s) => s.trim()).filter(Boolean);
    for (const im of seg.matchAll(/^\s*-\s*(.+)$/gm)) existing.push(im[1].trim());
  }
  const merged = [...new Set([...existing, ...add])];
  const newBlock = merged.length ? `links:\n` + merged.map((x) => `  - ${x}`).join("\n") : `links: []`;
  return m ? fmStr.replace(blockRe, newBlock) : fmStr + `\n${newBlock}`;
}
function setField(fmStr, key, value) {
  const ser = typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(String(value));
  const re = new RegExp(`^${key}:.*$`, "m");
  return re.test(fmStr) ? fmStr.replace(re, `${key}: ${ser}`) : fmStr + `\n${key}: ${ser}`;
}
function consolidateLog(entry) {
  fs.mkdirSync(CONSOL_DIR, { recursive: true });
  if (!fs.existsSync(CONSOL_LOG)) fs.writeFileSync(CONSOL_LOG, "---\ntitle: 巩固日志\ntags: [巩固日志, 留痕]\n---\n\n# 巩固日志\n\n> 巩固进程把收件箱碎片晋升为长期记忆的记录。\n", "utf8");
  const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
  fs.appendFileSync(CONSOL_LOG, `\n## [${ts}] consolidate(巩固) · ${entry.title}\n- id: \`${entry.id}\`\n- 从: \`${entry.from}\`\n- 到: \`${entry.to}\`\n${entry.links ? `- 新增链接: ${entry.links}\n` : ""}- 操作者: consolidator\n`, "utf8");
}
function apply(execute) {
  const plan = analyze(loadAll());
  if (!plan.length) { console.log("✨ 无可巩固项。"); return; }
  console.log(execute ? "🚀 执行巩固:\n" : "🔍 干跑(--yes 才真正执行):\n");
  const now = new Date().toISOString().slice(0, 10);
  for (const p of plan) {
    const { item } = p;
    const targetDir = path.join(VAULT, p.targetRel);
    const base = path.basename(item.absPath, ".md");
    let fname = `${base}.md`, n = 2;
    while (fs.existsSync(path.join(targetDir, fname))) { fname = `${base}-${n}.md`; n++; }
    const newPath = path.join(targetDir, fname);
    const newRel = path.relative(VAULT, newPath);
    console.log(`• ${item.title}`);
    console.log(`    ${item.path}  →  ${newRel}`);
    if (p.entityLinks.length) console.log(`    + 链接 ${p.entityLinks.map((e) => `[[${e}]]`).join(" ")}`);
    if (p.dup.length) console.log(`    ⚠️ 注意疑似重复:${p.dup.map((d) => d.t).join(", ")}(建议先人工复核)`);
    if (execute) {
      let { fm, body } = parseFrontmatter(fs.readFileSync(item.absPath, "utf8"));
      fm = setField(fm, "consolidated", true);
      fm = setField(fm, "consolidated_at", now);
      fm = withLinks(fm, p.entityLinks);
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(newPath, `---\n${fm}\n---\n${body}`, "utf8");
      fs.unlinkSync(item.absPath);
      consolidateLog({ id: item.id, title: item.title, from: item.path, to: newRel, links: p.entityLinks.map((e) => `[[${e}]]`).join(" ") });
    }
    console.log("");
  }
  if (!execute) console.log(`👉 确认无误后运行: node consolidator.js apply --yes`);
  else console.log(`✅ 巩固完成,已留痕到 ${path.relative(VAULT, CONSOL_LOG)}`);
}

// ---------- 入口 ----------
const cmd = process.argv[2] || "scan";
if (cmd === "scan") scan();
else if (cmd === "report") report();
else if (cmd === "apply") apply(process.argv.includes("--yes"));
else { console.log("用法: node consolidator.js [scan|report|apply [--yes]]"); }
