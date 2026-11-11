// AI 모델 지도 — 데이터 생성 (models.dev + OpenRouter 공개 API)
// 실행: node scripts/build_data.js
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const NOTES_FILE = path.join(ROOT, "notes", "curation.json");

const PROVIDERS = [
  // 미국
  { id: "openai", match: /^(gpt-|chatgpt|o[1-9]|codex)/,      country: "US", label: "OpenAI" },
  { id: "anthropic", match: /^claude-/,   country: "US", label: "Anthropic" },
  { id: "google", match: /^(gemini|gemma)-/,      country: "US", label: "Google" },
  { id: "xai", match: /^grok-/,         country: "US", label: "xAI" },
  { id: "meta", match: /^muse-/,        country: "US", label: "Meta" },
  { id: "mistral", match: /^(mistral|magistral|codestral|devstral|ministral|pixtral|voxtral|labs-)/,     country: "EU", label: "Mistral" },
  { id: "cohere", match: /^(command|north|aya|tiny-aya)/,      country: "CA", label: "Cohere" },
  // 중국
  { id: "deepseek", match: /^deepseek-/,    country: "CN", label: "DeepSeek" },
  { id: "moonshotai", match: /^kimi-/,  country: "CN", label: "Moonshot (Kimi)" },
  { id: "alibaba", match: /^qwen/,     country: "CN", label: "Alibaba (Qwen)" },
  { id: "zhipuai", match: /^glm-/,     country: "CN", label: "Zhipu (GLM)" },
  { id: "minimax", match: /^minimax-/i,     country: "CN", label: "MiniMax" },
];

const TASKS = [
  { id: "coding",  name: "코딩 · 개발",        desc: "코드 작성·리팩터링·버그 수정" },
  { id: "agent",   name: "에이전트 · 자동화",   desc: "도구 호출·장시간 작업·워크플로" },
  { id: "writing", name: "문서 · 보고서",       desc: "기획서·리포트·한국어 글쓰기" },
  { id: "research",name: "리서치 · 분석",       desc: "자료 조사·비교·요약" },
  { id: "long",    name: "긴 문서 처리",        desc: "대용량 PDF·코드베이스 통째로" },
  { id: "vision",  name: "이미지 · PDF 이해",   desc: "도표·스크린샷·스캔 문서" },
  { id: "cheap",   name: "대량 · 저비용",       desc: "분류·추출·번역 등 반복 작업" },
];

function toNum(v) { return typeof v === "number" && isFinite(v) ? v : null; }


function autoKo(r) {
  const parts = [];
  const tier = { flagship: "최상위", mid: "중급", light: "경량" }[r.tier] || "범용";
  const caps = [];
  if (r.reasoning) caps.push("추론");
  if (r.vision) caps.push("비전");
  if (r.pdf) caps.push("PDF");
  if (r.audio_in) caps.push("음성");
  if (r.image_out) caps.push("이미지 생성");
  if (r.video_out) caps.push("영상 생성");
  if (r.tool_call) caps.push("도구 호출");

  let hl = "";
  if (r.open_weights) hl = "오픈웨이트";
  else if (r.video_out) hl = "영상 생성";
  else if (r.image_out) hl = "이미지 생성";
  else if (r.audio_in) hl = "음성";
  else if (r.reasoning) hl = "추론";
  else if (r.cost_in != null && r.cost_in <= 0.3) hl = "저렴한 가격";
  else if (r.context && r.context >= 1e6) hl = "100만 토큰";
  else hl = "범용";

  parts.push(r.provider_label + "의 " + tier + " 모델.");
  if (r.context) parts.push("컨텍스트 " + (r.context >= 1e6 ? (Math.round(r.context / 1e5) / 10) + "M" : Math.round(r.context / 1000) + "K") + " 토큰.");
  if (r.cost_in != null) parts.push("입력 $" + r.cost_in + " / 출력 $" + r.cost_out + " (100만 토큰당).");
  if (r.open_weights) parts.push("오픈웨이트로 자체 서버 설치가 가능합니다.");
  if (caps.length) parts.push(caps.join("·") + " 지원.");
  if (!r.open_weights && r.cost_in != null && r.cost_in <= 0.3) parts.push("저렴한 가격이 장점입니다.");
  if (r.context && r.context >= 1e6 && !r.open_weights) parts.push("100만 토큰 문서를 통째로 넣을 수 있습니다.");
  return { ko: parts.join(" "), hl };
}

function mapModel(pid, mid, m, country, label) {
  const cost = m.cost || {};
  const modalities = m.modalities || { input: ["text"], output: ["text"] };
  const input = modalities.input || ["text"];
  const out = modalities.output || ["text"];
  return {
    key: pid + "/" + mid,
    provider: pid,
    provider_label: label,
    country,
    id: mid,
    name: m.name || mid,
    family: m.family || "",
    description: m.description || "",
    release: m.release_date || null,
    updated: m.last_updated || null,
    knowledge: m.knowledge || null,
    reasoning: !!m.reasoning,
    tool_call: !!m.tool_call,
    structured: !!m.structured_output,
    attachment: !!m.attachment,
    open_weights: !!m.open_weights,
    context: toNum(m.limit && m.limit.context),
    max_output: toNum(m.limit && m.limit.output),
    cost_in: toNum(cost.input),
    cost_out: toNum(cost.output),
    cost_cache_read: toNum(cost.cache_read),
    vision: input.includes("image") || input.includes("video"),
    pdf: input.includes("pdf"),
    audio_in: input.includes("audio"),
    image_out: out.includes("image"),
    video_out: out.includes("video"),
  };
}

const TASK_SPEND_MAP = [
  [/^code:/, "coding"],
  [/^agent:/, "agent"],
  [/^(research_report|qa_knowledge|math|finance_trading|security_audit|devops)$/, "research"],
  [/^(content_writing|summarization|roleplay_fiction|conversational_reply|customer_support)$/, "writing"],
  [/^(classification_tagging|data:|translation)/, "cheap"]
];
const PROV_SLUG = { openai:"openai", anthropic:"anthropic", google:"google", xai:"x-ai", meta:"meta", mistral:"mistralai", cohere:"cohere", deepseek:"deepseek", moonshotai:"moonshotai", alibaba:"qwen", zhipuai:"z-ai", minimax:"minimax" };
const slugify = s => String(s).toLowerCase().replace(/\./g, "-").replace(/[^a-z0-9\/-]+/g, "").replace(/-+/g, "-");
const baseSlug = s => String(s).replace(/-\d{8}$/, "");

async function getTaskSpend() {
  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 30000);
    const r = await fetch("https://openrouter.ai/api/frontend/v1/rankings/task-spend", {
      signal: ctrl.signal,
      headers: { "user-agent": "Mozilla/5.0", "accept": "application/json" }
    });
    clearTimeout(tm);
    if (!r.ok) return null;
    const j = await r.json();
    return (j && j.data && j.data.spend) ? j.data.spend : null;
  } catch (e) { return null; }
}

const OR_ALIAS = {
  "deepseek/deepseek-v4-flash": ["DeepSeek V4.1 Flash 1017", "DeepSeek V4.1 Flash"],
  "deepseek/deepseek-v4-pro": ["DeepSeek V4.1 Pro", "DeepSeek V4 Pro"],
  "zhipuai/glm-5.3-flash": ["GLM 5.3 Flash"],
  "zhipuai/glm-5.3": ["GLM 5.3"],
  "minimax/MiniMax-M3.1-Flash": ["MiniMax M3.1 Flash"],
  "minimax/MiniMax-M3": ["MiniMax M3"],
  "moonshotai/kimi-k3.1-pro": ["Kimi K3.1 Pro"],
  "moonshotai/kimi-k3": ["Kimi K3"],
  "anthropic/claude-opus-5-5": ["Claude Opus 5.5"],
  "anthropic/claude-sonnet-5-5": ["Claude Sonnet 5.5"],
  "anthropic/claude-haiku-5-5": ["Claude Haiku 5.5"],
  "anthropic/claude-fable-5-1": ["Claude Fable 5.1"],
  "openai/gpt-6-luna": ["GPT-6 Luna"],
  "openai/gpt-6-astra": ["GPT-6 Astra"],
  "openai/gpt-6-1-sol": ["GPT-6.1 Sol"],
  "openai/gpt-6-1-terra": ["GPT-6.1 Terra"],
  "google/gemini-4-argon": ["Gemini 4 Argon"],
  "google/gemini-3-8-flash": ["Gemini 3.8 Flash"],
  "xai/grok-4-7": ["Grok 4.7"],
  "xai/grok-4-6": ["Grok 4.6"],
  "alibaba/qwen3.8-max": ["Qwen3.8 Max"],
  "alibaba/qwen3.8-flash": ["Qwen3.8 Flash"],
  "meta/muse-wonder-1.0": ["Muse Wonder 1.0"],
  "mistral/mistral-large-4": ["Mistral Large 4"]
};

async function getHTML(url, timeoutMs = 45000) {
  const ctrl = new AbortController();
  let tm;
  try {
    tm = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36", "accept": "text/html" } });
    if (!r.ok) throw new Error(url + " -> HTTP " + r.status);
    return await r.text();
  } catch (e) {
    return "";
  } finally {
    if (tm) clearTimeout(tm);
  }
}

const normName = s => String(s || "")
  .toLowerCase()
  .replace(/\b(preview|latest|exp|experimental|default|snapshot|beta|alpha)\b/g, "")
  .replace(/[^a-z0-9]+/g, "");

function parseToks(v) {
  const m = String(v).match(/([\d.]+)\s*([TBM])/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return n * ({ T: 1e12, B: 1e9, M: 1e6 }[m[2].toUpperCase()] || 1);
}

async function getOpenRouterUsage() {
  const html = await getHTML("https://openrouter.ai/rankings");
  if (!html) return [];
  const re = /<td class="or-table__cell">(\d+)<\/td><th[^>]*>([^<]+)<\/th><td class="or-table__cell">([^<]+)<\/td><td class="or-table__cell">([^<]+)<\/td><td class="or-table__cell">([^<]+)<\/td>/g;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push({ rank: +m[1], name: m[2].trim(), author: m[3].trim(), tokens: parseToks(m[4]), raw: m[4].trim(), chg: m[5].trim() });
  }
  // 표가 여러 개(이번주/지난주/전체)이므로 첫 등장만 사용
  const seen = new Set();
  return out.filter(u => { const k = normName(u.name); if (seen.has(k)) return false; seen.add(k); return true; });
}

async function getJSON(url, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "ai-model-map/1.0" } });
    if (!r.ok) throw new Error(url + " -> HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

(async () => {
  const [md, or] = await Promise.all([
    getJSON("https://models.dev/api.json"),
    getJSON("https://openrouter.ai/api/v1/models").catch(() => ({ data: [] })),
  ]);

  // OpenRouter: 컨텍스트/가격 보조 소스
  const orIndex = new Map();
  for (const m of (or.data || [])) {
    const pid = String(m.id || "").split("/")[0];
    orIndex.set(String(m.id || "").toLowerCase(), m);
  }

  const usage = await getOpenRouterUsage().catch(() => []);
  const spend = await getTaskSpend();
  const spendBySlug = new Map();
  const taskAgg = {};
  if (spend) {
    for (const tk of (spend.tasks || [])) {
      let ours = null;
      for (const [re, id] of TASK_SPEND_MAP) if (re.test(tk.tag)) { ours = id; break; }
      if (!ours) continue;
      for (const mm of (tk.models || [])) {
        const slug = slugify(baseSlug(mm.model));
        if (!spendBySlug.has(slug)) spendBySlug.set(slug, { tasks: {}, total: 0 });
        const e = spendBySlug.get(slug);
        e.tasks[ours] = (e.tasks[ours] || 0) + mm.share;
        e.total += mm.share;
        if (!taskAgg[ours]) taskAgg[ours] = {};
        const nm = mm.model.split("/")[1] || mm.model;
        taskAgg[ours][nm] = (taskAgg[ours][nm] || 0) + mm.share;
      }
    }
  }
  const usageNorm = usage.map(u => ({ ...u, n: normName(u.name) }));
  // 작업별 합계로 정규화 (0~1 지출 비중)
  const taskTotal = {};
  for (const e of spendBySlug.values()) for (const [k, v] of Object.entries(e.tasks)) taskTotal[k] = (taskTotal[k] || 0) + v;
  for (const e of spendBySlug.values()) for (const k of Object.keys(e.tasks)) e.tasks[k] = e.tasks[k] / (taskTotal[k] || 1);

  const notes = fs.existsSync(NOTES_FILE) ? JSON.parse(fs.readFileSync(NOTES_FILE, "utf8")) : {};
  const providers = [];
  const all = [];

  for (const p of PROVIDERS) {
    const raw = md[p.id];
    if (!raw || !raw.models) continue;
    const models = [];
    for (const [mid, m] of Object.entries(raw.models)) {
      if (p.match && !p.match.test(mid)) continue;
      const row = mapModel(p.id, mid, m, p.country, p.label);
      // OpenRouter 보조값 (없으면 무시)
      const orKey = (m.canonical_model_id || p.id + "/" + mid).toLowerCase();
      const o = orIndex.get(orKey);
      if (o) {
        if (!row.context && o.context_length) row.context = o.context_length;
        if (row.cost_in == null && o.pricing && o.pricing.prompt != null) row.cost_in = Math.round(parseFloat(o.pricing.prompt) * 1e6 * 100) / 100;
        if (row.cost_out == null && o.pricing && o.pricing.completion != null) row.cost_out = Math.round(parseFloat(o.pricing.completion) * 1e6 * 100) / 100;
      }
      // OpenRouter 실사용량 매칭 (별칭 + 정확 일치)
      const alias = OR_ALIAS[row.key] || [];
      let hit = null;

      for (const nm of alias) {
        const k = normName(nm);
        hit = usageNorm.find(u => u.n === k);
        if (hit) break;
      }
      if (!hit) hit = usageNorm.find(u => u.n === normName(row.name));
      if (!hit) hit = usageNorm.find(u => u.n === normName(row.name).replace(/(pro|flash|turbo|mini|nano|code)/g, ""));

      // 작업별 실사용 지출 비중
      let spSlug = slugify(PROV_SLUG[row.provider] + "/" + row.id);
      let sp = spendBySlug.get(spSlug);
      if (!sp) {
        for (const [k, v] of spendBySlug) { if (k.startsWith(spSlug) || spSlug.startsWith(k)) { sp = v; spSlug = k; break; } }
      }
      if (sp) { row.spend = sp.tasks; row.spend_total = sp.total; row.spend_slug = spSlug; row.spend_key = spSlug; }

      if (hit) {
        row.pop = hit.tokens;
        row.pop_rank = hit.rank;
        row.pop_chg = hit.chg;
        row.pop_name = hit.name;
      }
      const n = notes[row.key] || {};
      if (n.ko) {
        row.ko = n.ko;
        const cands = (n.strengths || []).filter(w => w && row.ko.includes(w));
        const KW = ["추론","코딩","에이전트","문서","리서치","분석","이미지","영상","음성","오픈웨이트","저렴","가격","빠른","장문","컨텍스트","멀티모달","비전","PDF","창작","요약","자율"];
        row.ko_hl = cands[0] || KW.find(k => row.ko.includes(k)) || "";
      }
      else { const a = autoKo(row); row.ko = a.ko; row.ko_hl = a.hl; }
      row.strengths = n.strengths || [];
      row.tasks = n.tasks || [];
      row.caution = n.caution || "";
      row.pick = !!n.pick;
      row.tier = n.tier || "";
      models.push(row);
    }
    models.sort((a, b) => String(b.release || "").localeCompare(String(a.release || "")) || a.name.localeCompare(b.name));
    providers.push({ id: p.id, name: p.label, country: p.country, doc: raw.doc || "", models });
    all.push(...models);
  }

  // 업데이트 이력: 이전 데이터와 비교
  const prevFile = path.join(DATA_DIR, "models.json");
  const historyFile = path.join(DATA_DIR, "updates.json");
  let history = fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile, "utf8")) : [];
  if (fs.existsSync(prevFile)) {
    try {
      const prev = JSON.parse(fs.readFileSync(prevFile, "utf8"));
      const prevKeys = new Set((prev.models || []).map((m) => m.key));
      const added = all.filter((m) => !prevKeys.has(m.key)).map((m) => m.key);
      if (added.length) {
        history.unshift({ at: new Date().toISOString(), added });
        history = history.slice(0, 60);
      }
    } catch (e) { /* ignore */ }
  }

  const out = {
    generated_at: new Date().toISOString(),
    sources: ["models.dev", "openrouter.ai"],
    providers,
    models: all,
    tasks: TASKS,
    spend_window_days: spend ? spend.windowDays : null,
    task_top: (() => {
      const nameOf = {};
      for (const m of all) if (m.spend_slug) nameOf[m.spend_slug] = m.name;
      const pretty = s => {
        const BR = { glm:"GLM", gpt:"GPT", ai:"AI", llm:"LLM", qwen:"Qwen", kimi:"Kimi", minimax:"MiniMax", deepseek:"DeepSeek" };
        return s.replace(/-\d{8}$/, "").split("/").pop().split("-").map(w => BR[w] || (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
      };
      const out = {};
      for (const [k, v] of Object.entries(taskAgg)) {
        const sum = Object.values(v).reduce((a, b) => a + b, 0) || 1;
        out[k] = Object.entries(v).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([slug, share]) => ({
          slug, name: nameOf[slug] || pretty(slug), share: share / sum
        }));
      }
      return out;
    })(),
    counts: { models: all.length, providers: providers.length },
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(prevFile, JSON.stringify(out, null, 1), "utf8");
  fs.writeFileSync(historyFile, JSON.stringify(history, null, 1), "utf8");
  console.log("models:", all.length, "providers:", providers.length, "size:", Math.round(fs.statSync(prevFile).size / 1024), "KB");
})();
