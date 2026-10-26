/* Vibe Aid — showcase site. Plain JS, no build step. Data lives in Supabase (see SETUP.md). */
(() => {
"use strict";

const CFG = window.VIBE_AID_CONFIG || {};
const configured = !!(CFG.SUPABASE_URL && !CFG.SUPABASE_URL.startsWith("PASTE") && window.supabase);
const sb = configured ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const safeUrl = u => /^https?:\/\//i.test(u || "") ? u : "";
const icon = (n, cls = "") => `<svg class="${cls}" aria-hidden="true" width="24" height="24"><use href="#i-${n}"/></svg>`;

const CAUSES = {
  health:      { label: "Health & care",      icon: "care" },
  food:        { label: "Food security",      icon: "grow" },
  shelter:     { label: "Shelter & warmth",   icon: "community" },
  access:      { label: "Access & inclusion", icon: "community" },
  climate:     { label: "Climate & repair",   icon: "grow" },
  education:   { label: "Learning",           icon: "build" },
  refugees:    { label: "Refugees & migration", icon: "share" },
  "mutual-aid":{ label: "Mutual aid",         icon: "care" },
  civic:       { label: "Civic & local democracy", icon: "community" },
  safety:      { label: "Safety & emergencies", icon: "safeguard" },
  other:       { label: "Something else",     icon: "prompt" }
};
const TOOLS = ["Claude", "ChatGPT", "Gemini", "Cursor", "Replit", "Lovable", "v0", "Bolt", "Glide", "GitHub Copilot", "Windsurf", "Other"];
const BUILD_TIME = { "": "—", hours: "A few hours", "a-day": "A day", "a-week": "About a week", weeks: "A few weeks", months: "Months" };
const CHECKS = [
  ["personal_data", "Collects no personal data, or only with clear consent and a reason"],
  ["tested", "Tested with the people it's meant to help"],
  ["accessible", "Checked for accessibility (keyboard, contrast, plain language)"],
  ["not_replacement", "Signposts to professional help; doesn't replace it"]
];

let session = null, profile = null, isMod = false;
let projects = [], counts = {}, myUseful = new Set(), usingExamples = false, names = {};
let typedTimer = null;

/* ---------- small helpers ---------- */
function setStatus(text, kind = "info", ms = 4200) {
  const s = $("#status"); s.textContent = text; s.hidden = false;
  clearTimeout(setStatus.t); setStatus.t = setTimeout(() => { s.hidden = true; }, ms);
}
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
function slugify(t) { return String(t).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "project"; }
function redirectTo() { return location.origin + location.pathname; }
function shotUrl(p) {
  if (p.image_path && sb) return sb.storage.from("va-shots").getPublicUrl(p.image_path).data.publicUrl;
  return safeUrl(p.image_url);
}
function placeholder(p) {
  const c = CAUSES[p.cause] || CAUSES.other;
  return `<div class="ph c-${esc(p.cause || "other")}" role="img" aria-label="${esc(c.label)}">${icon(c.icon)}</div>`;
}
function by(p) { return p.team || names[p.created_by] || ""; }

/* ---------- theme ---------- */
function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const dark = t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  $("#themeBtn").textContent = dark ? "Light mode" : "Dark mode";
}
$("#themeBtn").addEventListener("click", () => {
  const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = cur === "dark" ? "light" : "dark"; store("va-theme", next); applyTheme(next);
});
applyTheme(store("va-theme"));

/* ---------- menu ---------- */
$("#menuBtn").addEventListener("click", () => {
  const m = $("#mobileNav"), open = !m.classList.contains("open");
  m.classList.toggle("open", open); $("#menuBtn").setAttribute("aria-expanded", String(open));
});
$("#mobileNav").addEventListener("click", e => { if (e.target.closest("a")) { $("#mobileNav").classList.remove("open"); $("#menuBtn").setAttribute("aria-expanded", "false"); } });

if (CFG.CONTACT_EMAIL) { $("#contactLi").hidden = false; $("#contactLink").href = "mailto:" + CFG.CONTACT_EMAIL; }

/* ---------- data ---------- */
async function loadMe() {
  profile = null; isMod = false; myUseful = new Set();
  if (sb && session) {
    const uid = session.user.id;
    const [{ data: p }, { data: m }, { data: u }] = await Promise.all([
      sb.from("va_profiles").select("*").eq("id", uid).maybeSingle(),
      sb.from("va_moderators").select("user_id").eq("user_id", uid).maybeSingle(),
      sb.from("va_useful").select("project_id").eq("user_id", uid)
    ]);
    profile = p || null; isMod = !!m; (u || []).forEach(r => myUseful.add(r.project_id));
  }
  $("#authBtn").textContent = session ? "Sign out" : "Sign in";
  $("#navMine").hidden = !session; $("#navMod").hidden = !isMod;
  $$(".needs-auth").forEach(a => a.hidden = !session); $$(".needs-mod").forEach(a => a.hidden = !isMod);
}

async function loadProjects() {
  usingExamples = false; counts = {};
  if (sb) {
    const { data, error } = await sb.from("va_projects").select("*").eq("status", "approved")
      .order("featured", { ascending: false }).order("created_at", { ascending: false }).limit(500);
    if (error) { setStatus("Couldn't load projects. Please try again shortly."); projects = []; }
    else projects = data || [];
    const { data: c } = await sb.from("va_useful_counts").select("*");
    (c || []).forEach(r => counts[r.project_id] = r.n);
    const ids = [...new Set(projects.map(p => p.created_by))].filter(id => !names[id]);
    if (ids.length) {
      const { data: ps } = await sb.from("va_profiles").select("id,display_name").in("id", ids);
      (ps || []).forEach(p => names[p.id] = p.display_name);
    }
  }
  if (!projects.length && CFG.SHOW_EXAMPLES_WHEN_EMPTY !== false) {
    projects = (window.VIBE_AID_EXAMPLES || []).map(p => ({ ...p, id: "ex-" + p.slug, example: true, created_at: "2026-10-01" }));
    usingExamples = projects.length > 0;
  }
  $("#demoNote").hidden = configured;
}

/* ---------- cards ---------- */
function card(p) {
  const c = CAUSES[p.cause] || CAUSES.other, img = shotUrl(p);
  const tags = [];
  if (p.example) tags.push(`<span class="va-tag va-tag-sun">Example</span>`);
  if (p.reviewed) tags.push(`<span class="va-tag va-tag-kelp">${icon("safeguard")}Reviewed</span>`);
  (p.tools || []).slice(0, 2).forEach(t => tags.push(`<span class="va-tag">${esc(t)}</span>`));
  return `<a class="va-card" href="#/p/${esc(p.slug)}">
    ${p.featured && !p.example ? `<span class="va-tag va-tag-sun ribbon">Featured</span>` : ""}
    <div class="va-card-shot">${img ? `<img src="${esc(img)}" alt="${esc(p.image_alt || "")}" loading="lazy">` : placeholder(p)}</div>
    <div class="va-card-body">
      <div class="va-card-cause">${esc(c.label)}</div>
      <h3 class="va-card-title">${esc(p.title)}</h3>
      <p class="va-card-line">${esc(p.tagline)}</p>
      <div class="va-card-meta">${tags.join("")}</div>
    </div></a>`;
}

/* ---------- views ---------- */
const main = $("#main");

function viewHome() {
  const places = new Set(projects.map(p => (p.location || "").split(",")[0].trim()).filter(Boolean));
  const causes = new Set(projects.map(p => p.cause));
  const featured = projects.slice(0, 6);
  main.innerHTML = `
  <section class="hero"><div class="wrap hero-grid">
    <div>
      <p class="eyebrow">Vibe coding for humanitarian &amp; social good</p>
      <h1 style="margin-top:16px">Build what your community <span class="hl">needs.</span> In your own words.</h1>
      <p class="lead">You don't need to be a programmer to make the tool your food bank, clinic or tenants' group keeps wishing it had. Describe it to an AI, build it, then share it here — with the prompt — so the next group can start from yours.</p>
      <div class="ctas">
        <a class="va-btn va-btn-primary" href="#/submit">Show your build</a>
        <a class="va-btn" href="#/projects">Browse ${usingExamples ? "examples" : "projects"}</a>
      </div>
    </div>
    <div class="hero-art" aria-hidden="true">
      <div class="bubble">
        <div class="typed-label"><span>SAY IT</span><span id="typedCause"></span></div>
        <div class="va-prompt"><span id="typed"></span><span class="va-cursor"></span></div>
      </div>
      <span class="sticker s1">No code needed</span>
      <div class="result"><span class="dot"></span><span id="typedResult">…</span></div>
      <span class="sticker s2">Share the prompt</span>
    </div>
  </div></section>

  <svg class="wave-rule wrap" viewBox="0 0 1200 24" preserveAspectRatio="none" aria-hidden="true"><path d="M0 12 Q 25 0 50 12 T 100 12 T 150 12 T 200 12 T 250 12 T 300 12 T 350 12 T 400 12 T 450 12 T 500 12 T 550 12 T 600 12 T 650 12 T 700 12 T 750 12 T 800 12 T 850 12 T 900 12 T 950 12 T 1000 12 T 1050 12 T 1100 12 T 1150 12 T 1200 12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>

  <section class="section" id="showcase"><div class="wrap">
    <div class="section-head">
      <div><p class="eyebrow">The showcase</p><h2 style="margin-top:8px">${usingExamples ? "What a build looks like" : "Recently shared"}</h2></div>
      <a class="va-btn" href="#/projects">See all</a>
    </div>
    <div class="grid">${featured.map(card).join("")}</div>
    <div class="stats">
      <div class="stat"><b>${projects.length}</b><span class="muted">${usingExamples ? "example builds" : "projects shared"}</span></div>
      <div class="stat"><b>${causes.size}</b><span class="muted">causes</span></div>
      <div class="stat"><b>${places.size}</b><span class="muted">places</span></div>
    </div>
  </div></section>

  <section class="section" id="how" style="padding-top:0"><div class="wrap">
    <div class="section-head"><div><p class="eyebrow">How it works</p><h2 style="margin-top:8px">Say it. Build it. Share it.</h2></div></div>
    <div class="steps">
      <div class="step"><span class="num">01</span><h3>Say it</h3><p>Describe the problem the way you'd explain it to a friend: who it's for, what's annoying now, what "better" looks like. That's your first prompt.</p></div>
      <div class="step"><span class="num">02</span><h3>Build it</h3><p>Use Claude, Lovable, Replit or whatever you like. Make something small that works this afternoon. Test it with the people it's for, and fix what they find.</p></div>
      <div class="step"><span class="num">03</span><h3>Share it</h3><p>Post it here with the prompt, the tools and what broke. Link the GitHub repo if there is one, so others can copy it for their town.</p></div>
    </div>
  </div></section>

  <section class="section band" id="principles"><div class="wrap">
    <div class="section-head"><div><p class="eyebrow">Principles</p><h2 style="margin-top:8px;color:var(--paper)">Small, useful, kind software.</h2></div></div>
    <ol class="principles">
      <li><div><strong>Say it plainly.</strong><span>If you can describe the need, you can start building. No jargon required.</span></div></li>
      <li><div><strong>Build with, not for.</strong><span>The people a tool serves are named, asked and involved — not "beneficiaries".</span></div></li>
      <li><div><strong>Ship small, ship kind.</strong><span>A working page beats a perfect plan. Start with the smallest thing that helps.</span></div></li>
      <li><div><strong>Show the receipts.</strong><span>Share the prompt, the tools and what went wrong. That's how the next group learns.</span></div></li>
      <li><div><strong>Do no harm.</strong><span>Personal data, safeguarding and accessibility get checked before anything goes public. Every project here is moderated.</span></div></li>
    </ol>
  </div></section>

  <section class="section"><div class="wrap" style="text-align:center;display:grid;gap:24px;justify-items:center">
    <svg viewBox="0 0 96 96" width="72" height="72" aria-hidden="true"><path d="M28 8H68A22 22 0 0 1 90 30V54A22 22 0 0 1 68 76H40L16 92L20 74A22 22 0 0 1 6 54V30A22 22 0 0 1 28 8Z" fill="var(--ember)"/><path d="M22 46C28 34 34 34 40 46S52 58 58 46" fill="none" stroke="#17161C" stroke-width="8" stroke-linecap="round"/><rect x="65" y="28" width="9" height="34" rx="3" fill="#17161C"/></svg>
    <h2 style="font-size:clamp(34px,5.5vw,60px);max-width:14em">Built something that helps? Show it.</h2>
    <p class="muted" style="max-width:36em;font-size:18px">It doesn't need to be finished or polished. If it works for the people it's for, it belongs here.</p>
    <a class="va-btn va-btn-primary" href="#/submit">Show your build</a>
  </div></section>`;
  startTyping();
}

function startTyping() {
  clearTimeout(typedTimer);
  const pool = (window.VIBE_AID_EXAMPLES || []).filter(p => p.prompt);
  if (!pool.length) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let i = 0;
  const next = () => {
    const el = $("#typed"); if (!el) return;
    const p = pool[i % pool.length]; i++;
    $("#typedCause").textContent = (CAUSES[p.cause] || CAUSES.other).label.toUpperCase();
    $("#typedResult").textContent = "…";
    if (reduce) { el.textContent = p.prompt; $("#typedResult").textContent = p.title + " — " + BUILD_TIME[p.build_time].toLowerCase() + " later"; typedTimer = setTimeout(next, 7000); return; }
    let n = 0; el.textContent = "";
    const step = () => {
      if (!$("#typed")) return;
      n += 2; el.textContent = p.prompt.slice(0, n);
      if (n < p.prompt.length) typedTimer = setTimeout(step, 28);
      else { $("#typedResult").textContent = "Built: " + p.title + " · " + BUILD_TIME[p.build_time].toLowerCase(); typedTimer = setTimeout(next, 3800); }
    };
    step();
  };
  next();
}

function viewProjects(q = {}) {
  const tools = [...new Set(projects.flatMap(p => p.tools || []))].sort();
  main.innerHTML = `<section class="section" style="padding-top:40px"><div class="wrap">
    <div class="section-head"><div><p class="eyebrow">The showcase</p><h1 style="font-size:clamp(40px,6vw,64px);margin-top:8px">${usingExamples ? "Example builds" : "Projects"}</h1></div>
      <a class="va-btn va-btn-primary" href="#/submit">Show your build</a></div>
    <div class="toolbar">
      <label class="sr" for="q">Search projects</label>
      <input class="search" id="q" type="search" placeholder="Search: food bank, translation, rota…" value="${esc(q.q || "")}">
      <label class="sr" for="toolSel">Filter by tool</label>
      <select class="sel" id="toolSel"><option value="">Any tool</option>${tools.map(t => `<option ${q.tool === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
      <label class="sr" for="sortSel">Sort</label>
      <select class="sel" id="sortSel"><option value="new">Newest</option><option value="useful" ${q.sort === "useful" ? "selected" : ""}>Most useful</option></select>
    </div>
    <div class="chips" role="group" aria-label="Filter by cause">
      <button class="chip" type="button" data-cause="" aria-pressed="${!q.cause}">All</button>
      ${Object.entries(CAUSES).filter(([k]) => projects.some(p => p.cause === k)).map(([k, c]) => `<button class="chip" type="button" data-cause="${k}" aria-pressed="${q.cause === k}">${esc(c.label)}</button>`).join("")}
    </div>
    <p class="muted" id="resultCount" aria-live="polite" style="margin-bottom:16px"></p>
    <div class="grid" id="results"></div>
  </div></section>`;
  const state = { q: q.q || "", cause: q.cause || "", tool: q.tool || "", sort: q.sort || "new" };
  const draw = () => {
    const term = state.q.trim().toLowerCase();
    let list = projects.filter(p => (!state.cause || p.cause === state.cause) && (!state.tool || (p.tools || []).includes(state.tool)) &&
      (!term || [p.title, p.tagline, p.helps, p.problem, p.what_it_does, p.prompt, p.location, p.team, (p.tools || []).join(" ")].join(" ").toLowerCase().includes(term)));
    if (state.sort === "useful") list = list.slice().sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
    $("#results").innerHTML = list.length ? list.map(card).join("") :
      `<div class="empty" style="grid-column:1/-1"><h3>Nothing here yet</h3><p class="muted">Be the first: <a href="#/submit">show your build</a>.</p></div>`;
    $("#resultCount").textContent = `${list.length} ${list.length === 1 ? "project" : "projects"}`;
  };
  $("#q").addEventListener("input", e => { state.q = e.target.value; draw(); });
  $("#toolSel").addEventListener("change", e => { state.tool = e.target.value; draw(); });
  $("#sortSel").addEventListener("change", e => { state.sort = e.target.value; draw(); });
  $$(".chip").forEach(b => b.addEventListener("click", () => {
    state.cause = b.dataset.cause; $$(".chip").forEach(x => x.setAttribute("aria-pressed", String(x === b))); draw();
  }));
  draw();
}

async function findProject(slug) {
  let p = projects.find(x => x.slug === slug);
  if (!p && sb) {
    const { data } = await sb.from("va_projects").select("*").eq("slug", slug).maybeSingle();
    if (data) {
      p = data;
      if (!names[p.created_by]) { const { data: pr } = await sb.from("va_profiles").select("id,display_name").eq("id", p.created_by).maybeSingle(); if (pr) names[pr.id] = pr.display_name; }
    }
  }
  return p;
}

async function viewProject(slug) {
  const p = await findProject(slug);
  if (!p) { main.innerHTML = `<section class="section"><div class="wrap"><div class="empty"><h3>We couldn't find that project</h3><p class="muted">It may be waiting for approval or have been removed. <a href="#/projects">Browse projects</a>.</p></div></div></section>`; return; }
  document.title = `${p.title} — Vibe Aid`;
  const c = CAUSES[p.cause] || CAUSES.other, img = shotUrl(p);
  const mine = session && p.created_by === session.user.id;
  const live = safeUrl(p.live_url), repo = safeUrl(p.repo_url);
  const n = counts[p.id] || 0, marked = myUseful.has(p.id);
  const statusNote = p.status && p.status !== "approved"
    ? `<div class="callout warn" style="margin-bottom:16px"><strong>${p.status === "pending" ? "Awaiting approval." : "Hidden by a moderator."}</strong> Only you${isMod ? " and moderators" : ""} can see this page.${p.mod_note ? " Note: " + esc(p.mod_note) : ""}</div>` : "";
  main.innerHTML = `<article class="wrap">
    <div class="pj-head">
      ${statusNote}
      ${p.example ? `<div class="callout" style="margin-bottom:16px"><strong>Example project.</strong> This shows what a showcase entry looks like; it isn't a real build.</div>` : ""}
      <a href="#/projects" class="muted" style="font-size:14px">← All projects</a>
      <p class="eyebrow" style="margin-top:20px">${esc(c.label)}${p.location ? " · " + esc(p.location) : ""}</p>
      <h1>${esc(p.title)}</h1>
      <p class="tagline">${esc(p.tagline)}</p>
      <div class="pj-actions">
        ${live ? `<a class="va-btn va-btn-primary" href="${esc(live)}" target="_blank" rel="noopener">Try it ↗</a>` : ""}
        ${repo ? `<a class="va-btn" href="${esc(repo)}" target="_blank" rel="noopener">${icon("build")} Code on GitHub</a>` : ""}
        ${!p.example ? `<button class="va-btn" id="usefulBtn" type="button" aria-pressed="${marked}">${icon("care")} ${marked ? "Marked useful" : "This is useful"} · ${n}</button>` : ""}
        <button class="va-btn va-btn-ghost" id="copyBtn" type="button">Copy link</button>
        ${mine ? `<a class="va-btn va-btn-ghost" href="#/edit/${esc(p.slug)}">Edit</a>` : ""}
      </div>
    </div>
    <div class="pj-shot">${img ? `<img src="${esc(img)}" alt="${esc(p.image_alt || "Screenshot of " + p.title)}">` : placeholder(p)}</div>
    <div class="pj-layout">
      <div class="pj-body">
        ${p.problem ? `<h2>The problem</h2><p>${esc(p.problem)}</p>` : ""}
        ${p.what_it_does ? `<h2>What it does</h2><p>${esc(p.what_it_does)}</p>` : ""}
        ${p.prompt ? `<h2>The prompt that started it</h2><div class="va-prompt">${esc(p.prompt)}<span class="va-cursor"></span></div>
          <p style="margin-top:12px"><button class="va-btn va-btn-sm" id="copyPrompt" type="button">${icon("prompt")} Copy prompt</button></p>` : ""}
        ${p.lessons ? `<h2>What broke, and what we learned</h2><p>${esc(p.lessons)}</p>` : ""}
      </div>
      <aside class="facts" aria-label="Project details">
        <dl style="display:grid;gap:16px;margin:0">
          ${p.helps ? `<div><dt>Who it helps</dt><dd>${esc(p.helps)}</dd></div>` : ""}
          ${by(p) ? `<div><dt>Built by</dt><dd>${esc(by(p))}</dd></div>` : ""}
          ${(p.tools || []).length ? `<div><dt>Built with</dt><dd style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${p.tools.map(t => `<span class="va-tag">${esc(t)}</span>`).join("")}</dd></div>` : ""}
          ${p.build_time ? `<div><dt>Time to first version</dt><dd>${esc(BUILD_TIME[p.build_time] || "")}</dd></div>` : ""}
          ${p.licence ? `<div><dt>Licence</dt><dd>${esc(p.licence)}</dd></div>` : ""}
        </dl>
        <div><p class="eyebrow" style="color:var(--kelp);margin-bottom:10px">${p.reviewed ? "Reviewed by Vibe Aid" : "Builder's checklist"}</p>
          <ul class="checks">${CHECKS.map(([k, label]) => { const ok = (p.checks || {})[k]; return `<li class="${ok ? "" : "no"}">${icon(ok ? "ship" : "dash")}<span>${ok ? "" : "<span class='sr'>Not yet: </span>"}${esc(label)}</span></li>`; }).join("")}</ul>
        </div>
        <p class="muted" style="font-size:13px">Checks are declared by the builder${p.reviewed ? " and reviewed by a moderator" : ""}. Always check a tool with your own safeguarding or data-protection lead before using it with people.</p>
      </aside>
    </div>
    ${isMod && !p.example ? modControls(p) : ""}
  </article>`;
  $("#copyBtn").addEventListener("click", () => copy(location.href, "Link copied."));
  if ($("#copyPrompt")) $("#copyPrompt").addEventListener("click", () => copy(p.prompt, "Prompt copied. Go build something."));
  if ($("#usefulBtn")) $("#usefulBtn").addEventListener("click", () => toggleUseful(p));
  if (isMod && !p.example) wireMod(p);
}

async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); setStatus(msg); } catch (e) { setStatus("Couldn't copy — select and copy it instead."); }
}

async function toggleUseful(p) {
  if (!sb) return;
  if (!session) return openAuth("Sign in to mark projects as useful.");
  if (p.created_by === session.user.id) return setStatus("You can't mark your own project — but we're sure it's useful.");
  const on = myUseful.has(p.id);
  const { error } = on ? await sb.from("va_useful").delete().eq("user_id", session.user.id).eq("project_id", p.id)
                       : await sb.from("va_useful").insert({ project_id: p.id });
  if (error) return setStatus("That didn't work. Please try again.");
  on ? myUseful.delete(p.id) : myUseful.add(p.id);
  counts[p.id] = (counts[p.id] || 0) + (on ? -1 : 1);
  viewProject(p.slug);
}

/* ---------- submit / edit ---------- */
async function viewSubmit(editSlug) {
  if (!configured) {
    main.innerHTML = `<section class="section"><div class="wrap" style="max-width:760px"><p class="eyebrow">Show your build</p>
      <h1 style="font-size:clamp(40px,6vw,64px);margin:8px 0 16px">Submissions open soon.</h1>
      <p class="muted" style="font-size:18px">The showcase database is being connected. In the meantime, have a look at the <a href="#/projects">example builds</a> to see what an entry includes.</p></div></section>`;
    return;
  }
  if (!session) {
    main.innerHTML = `<section class="section"><div class="wrap" style="max-width:760px"><p class="eyebrow">Show your build</p>
      <h1 style="font-size:clamp(40px,6vw,64px);margin:8px 0 16px">Share what you made.</h1>
      <p class="muted" style="font-size:18px;margin-bottom:24px">Sign in first so you can come back and edit your project. It takes ten seconds${CFG.GITHUB_SIGNIN ? " with GitHub or" : " with"} an email link.</p>
      <button class="va-btn va-btn-primary" id="signInToPost" type="button">Sign in to continue</button></div></section>`;
    $("#signInToPost").addEventListener("click", () => openAuth("Sign in to share your build."));
    return;
  }
  if (!profile) { openProfile(); }
  let p = null;
  if (editSlug) {
    p = await findProject(editSlug);
    if (!p || (p.created_by !== session.user.id && !isMod)) { main.innerHTML = `<section class="section"><div class="wrap"><div class="empty"><h3>You can't edit that project</h3></div></div></section>`; return; }
  }
  const v = p || { tools: [], checks: {} };
  main.innerHTML = `<section class="section" style="padding-top:40px"><div class="wrap">
    <p class="eyebrow">${p ? "Edit your build" : "Show your build"}</p>
    <h1 style="font-size:clamp(40px,6vw,64px);margin:8px 0 12px">${p ? esc(p.title) : "Share what you made."}</h1>
    <p class="muted" style="font-size:18px;max-width:36em;margin-bottom:32px">${p ? "Saving sends your changes back for a quick moderator check." : "A moderator checks every project before it goes public — usually within a few days. Rough is fine. Honest is better."}</p>
    <form class="form" id="pform" novalidate>
      ${p ? "" : `<div class="gh-import">
        <p class="eyebrow">Start from GitHub (optional)</p>
        <p>Paste your repository link and we'll fill in what we can from its description and README.</p>
        <div class="row"><label class="sr" for="ghUrl">GitHub repository link</label>
          <input id="ghUrl" type="url" placeholder="https://github.com/you/your-project" inputmode="url">
          <button class="va-btn" type="button" id="ghFetch">Fetch details</button></div>
        <p class="msg" id="ghMsg" role="status"></p>
      </div>`}

      <fieldset class="fieldset"><legend>The basics</legend>
        <div class="field"><label for="fTitle">Project name</label><input type="text" id="fTitle" maxlength="80" required value="${esc(v.title || "")}"></div>
        <div class="field"><label for="fTagline">One line: what it does and for whom</label><span class="hint">10–160 characters. e.g. "Food-bank volunteers see open shifts and sign up in two taps."</span><input type="text" id="fTagline" maxlength="160" required value="${esc(v.tagline || "")}"></div>
        <div class="two">
          <div class="field"><label for="fCause">Cause</label><select id="fCause" required>${Object.entries(CAUSES).map(([k, c]) => `<option value="${k}" ${v.cause === k ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</select></div>
          <div class="field"><label for="fLoc">Where <span class="muted">(town or region)</span></label><input type="text" id="fLoc" maxlength="80" value="${esc(v.location || profile?.location || "")}"></div>
        </div>
        <div class="field"><label for="fTeam">Built by <span class="muted">(people or group, optional)</span></label><span class="hint">Leave blank to show your name.</span><input type="text" id="fTeam" maxlength="200" value="${esc(v.team || "")}"></div>
      </fieldset>

      <fieldset class="fieldset"><legend>The story</legend>
        <div class="field"><label for="fHelps">Who it helps</label><input type="text" id="fHelps" maxlength="300" value="${esc(v.helps || "")}"></div>
        <div class="field"><label for="fProblem">The problem</label><span class="hint">What was hard or broken before?</span><textarea id="fProblem" maxlength="2000">${esc(v.problem || "")}</textarea></div>
        <div class="field"><label for="fWhat">What it does</label><textarea id="fWhat" maxlength="2000">${esc(v.what_it_does || "")}</textarea></div>
        <div class="field"><label for="fPrompt">The prompt that started it</label><span class="hint">Paste your first (or best) prompt, as you wrote it. Remove any names or personal details.</span><textarea id="fPrompt" class="mono" maxlength="4000">${esc(v.prompt || "")}</textarea></div>
        <div class="field"><label for="fLessons">What broke, and what you learned</label><textarea id="fLessons" maxlength="2000">${esc(v.lessons || "")}</textarea></div>
      </fieldset>

      <fieldset class="fieldset"><legend>How you built it</legend>
        <div class="field"><span class="lbl" id="toolsLbl">Tools you used</span><div class="tool-opts" role="group" aria-labelledby="toolsLbl">
          ${TOOLS.map(t => `<label><input type="checkbox" name="tools" value="${esc(t)}" ${(v.tools || []).includes(t) ? "checked" : ""}> ${esc(t)}</label>`).join("")}</div></div>
        <div class="two">
          <div class="field"><label for="fTime">Time to first working version</label><select id="fTime">${Object.entries(BUILD_TIME).map(([k, l]) => `<option value="${k}" ${v.build_time === k ? "selected" : ""}>${k ? esc(l) : "Choose…"}</option>`).join("")}</select></div>
          <div class="field"><label for="fLicence">Licence <span class="muted">(optional)</span></label><input type="text" id="fLicence" maxlength="60" placeholder="e.g. MIT, CC BY 4.0" value="${esc(v.licence || "")}"></div>
        </div>
        <div class="two">
          <div class="field"><label for="fLive">Link to try it</label><input type="url" id="fLive" placeholder="https://" value="${esc(v.live_url || "")}"></div>
          <div class="field"><label for="fRepo">Code repository</label><input type="url" id="fRepo" placeholder="https://github.com/…" value="${esc(v.repo_url || "")}"></div>
        </div>
      </fieldset>

      <fieldset class="fieldset"><legend>Screenshot</legend>
        <div class="field"><label for="fShot">Upload a screenshot <span class="muted">(PNG, JPG or WebP, up to 5 MB)</span></label><span class="hint">Make sure it shows no real people's names or data.</span><input type="file" id="fShot" accept="image/png,image/jpeg,image/webp,image/gif"></div>
        <div class="field"><label for="fImgUrl">…or an image link</label><span class="hint">We'll use your GitHub repo's preview card if you leave both blank.</span><input type="url" id="fImgUrl" placeholder="https://" value="${esc(v.image_url || "")}"></div>
        <div class="field"><label for="fAlt">Describe the screenshot</label><span class="hint">For people using screen readers: what does the screen show?</span><input type="text" id="fAlt" maxlength="300" value="${esc(v.image_alt || "")}"></div>
      </fieldset>

      <fieldset class="fieldset"><legend>Do no harm</legend>
        <p class="muted">Tick what's true today. Unticked is fine — honesty helps others.</p>
        ${CHECKS.map(([k, label]) => `<label class="check"><input type="checkbox" name="checks" value="${k}" ${(v.checks || {})[k] ? "checked" : ""}> <span>${esc(label)}</span></label>`).join("")}
        <hr style="border:0;border-top:1px solid var(--line);width:100%">
        <label class="check"><input type="checkbox" id="fConsent" required ${p ? "checked" : ""}> <span>I made this (or have permission to share it), the screenshot and prompt contain no one's personal details, and I'm happy for it to be shown publicly. I've read the <a href="privacy.html" target="_blank">privacy page</a>.</span></label>
      </fieldset>

      <p class="msg" id="formMsg" role="alert"></p>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <button class="va-btn va-btn-primary" type="submit" id="fSubmit">${p ? "Save changes" : "Send for review"}</button>
        ${p ? `<button class="va-btn va-btn-ghost" type="button" id="fDelete">Delete project</button>` : ""}
      </div>
    </form>
  </div></section>`;
  if (!p) $("#ghFetch").addEventListener("click", importGitHub);
  $("#pform").addEventListener("submit", e => { e.preventDefault(); saveProject(p); });
  if (p) $("#fDelete").addEventListener("click", () => deleteProject(p));
}

async function importGitHub() {
  const msg = $("#ghMsg"), raw = $("#ghUrl").value.trim();
  const m = raw.match(/^https?:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:[\/#?].*)?$/);
  if (!m) { msg.className = "msg err"; msg.textContent = "That doesn't look like a GitHub repository link."; return; }
  const [, owner, repo] = m; msg.className = "msg"; msg.textContent = "Fetching…";
  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: { Accept: "application/vnd.github+json" } });
    if (r.status === 404) throw new Error("We couldn't see that repository. Is it public?");
    if (!r.ok) throw new Error("GitHub didn't answer just now (it limits how often we can ask). Fill the form in by hand, or try again later.");
    const d = await r.json();
    const fill = (id, val) => { const el = $(id); if (el && !el.value && val) el.value = val; };
    fill("#fTitle", d.name.replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
    fill("#fTagline", (d.description || "").slice(0, 160));
    fill("#fRepo", d.html_url);
    fill("#fLive", d.homepage && /^https?:\/\//.test(d.homepage) ? d.homepage : "");
    fill("#fLicence", d.license && d.license.spdx_id !== "NOASSERTION" ? d.license.spdx_id : "");
    try {
      const rr = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, { headers: { Accept: "application/vnd.github.raw" } });
      if (rr.ok) {
        const md = await rr.text();
        const paras = md.split(/\n\s*\n/).map(s => s.trim()).filter(s => s && !/^(#|!\[|\[!\[|<|```|\||-{3,})/.test(s));
        const text = paras.slice(0, 2).join("\n\n").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`]/g, "");
        fill("#fWhat", text.slice(0, 2000));
      }
    } catch (e) { /* README is optional */ }
    if (!$("#fImgUrl").value) $("#fImgUrl").dataset.ghPreview = `https://opengraph.githubassets.com/1/${owner}/${repo}`;
    msg.className = "msg ok"; msg.textContent = "Filled in what we could. Check it over and add the story.";
  } catch (e) { msg.className = "msg err"; msg.textContent = e.message; }
}

async function saveProject(existing) {
  const msg = $("#formMsg"), btn = $("#fSubmit");
  if (!profile) { openProfile(); msg.className = "msg err"; msg.textContent = "Please add your name first."; return; }
  const val = id => $(id).value.trim();
  const row = {
    title: val("#fTitle"), tagline: val("#fTagline"), cause: val("#fCause"), location: val("#fLoc"), team: val("#fTeam"),
    helps: val("#fHelps"), problem: val("#fProblem"), what_it_does: val("#fWhat"), prompt: val("#fPrompt"), lessons: val("#fLessons"),
    tools: $$("input[name=tools]:checked").map(x => x.value), build_time: val("#fTime"), licence: val("#fLicence"),
    live_url: val("#fLive"), repo_url: val("#fRepo"), image_url: val("#fImgUrl"), image_alt: val("#fAlt"),
    checks: Object.fromEntries(CHECKS.map(([k]) => [k, $$("input[name=checks]:checked").some(x => x.value === k)]))
  };
  const problems = [];
  if (row.title.length < 2) problems.push("a project name");
  if (row.tagline.length < 10) problems.push("a one-line description (at least 10 characters)");
  if (row.live_url && !/^https?:\/\//i.test(row.live_url)) problems.push("a link to try it that starts with https://");
  if (row.repo_url && !/^https:\/\/(github\.com|gitlab\.com|codeberg\.org)\//i.test(row.repo_url)) problems.push("a GitHub, GitLab or Codeberg repository link");
  if (row.image_url && !/^https:\/\//i.test(row.image_url)) problems.push("an image link that starts with https://");
  if (!$("#fConsent").checked) problems.push("the consent tick");
  if (problems.length) { msg.className = "msg err"; msg.textContent = "Please add " + problems.join(", ") + "."; return; }
  if (!row.image_url && $("#fImgUrl").dataset.ghPreview && !$("#fShot").files[0]) row.image_url = $("#fImgUrl").dataset.ghPreview;
  if (!row.image_url && !$("#fShot").files[0] && /^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/.test(row.repo_url)) {
    const [, o, r] = row.repo_url.match(/^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/); row.image_url = `https://opengraph.githubassets.com/1/${o}/${r.replace(/\.git$/, "")}`;
  }
  btn.disabled = true; msg.className = "msg"; msg.textContent = "Saving…";
  try {
    const file = $("#fShot").files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) throw new Error("That screenshot is over 5 MB. Try a smaller one.");
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${session.user.id}/${Date.now()}.${ext}`;
      const { error } = await sb.storage.from("va-shots").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error("The screenshot didn't upload. Try a PNG or JPG under 5 MB.");
      row.image_path = path; row.image_url = "";
    }
    let saved;
    if (existing) {
      const { data, error } = await sb.from("va_projects").update(row).eq("id", existing.id).select().single();
      if (error) throw error; saved = data;
      if (row.image_path && existing.image_path) sb.storage.from("va-shots").remove([existing.image_path]);
    } else {
      row.slug = slugify(row.title) + "-" + Math.random().toString(36).slice(2, 6);
      const { data, error } = await sb.from("va_projects").insert(row).select().single();
      if (error) throw error; saved = data;
    }
    await loadProjects();
    location.hash = "#/p/" + saved.slug;
    setStatus(isMod ? "Saved." : "Thanks! A moderator will check it soon. You can see it under My builds.", "ok", 6000);
  } catch (e) {
    msg.className = "msg err"; msg.textContent = e.message || "Something went wrong. Please try again.";
  } finally { btn.disabled = false; }
}

async function deleteProject(p) {
  if (!confirm(`Delete "${p.title}"? This can't be undone.`)) return;
  const { error } = await sb.from("va_projects").delete().eq("id", p.id);
  if (error) return setStatus("Couldn't delete it. Please try again.");
  if (p.image_path) sb.storage.from("va-shots").remove([p.image_path]);
  await loadProjects(); location.hash = "#/mine"; setStatus("Deleted.");
}

/* ---------- mine ---------- */
async function viewMine() {
  if (!session) { location.hash = "#/"; return openAuth(); }
  const { data } = await sb.from("va_projects").select("*").eq("created_by", session.user.id).order("created_at", { ascending: false });
  const list = data || [];
  const label = { pending: ["Awaiting approval", "sun"], approved: ["Published", "kelp"], hidden: ["Hidden", "ember"] };
  main.innerHTML = `<section class="section" style="padding-top:40px"><div class="wrap">
    <div class="section-head"><div><p class="eyebrow">Your account</p><h1 style="font-size:clamp(40px,6vw,64px);margin-top:8px">My builds</h1></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="va-btn" id="editProf" type="button">Edit my details</button><a class="va-btn va-btn-primary" href="#/submit">Show another build</a></div></div>
    ${list.length ? `<div class="mod-list">${list.map(p => `<div class="mod-row"><div><span class="va-tag va-tag-${label[p.status][1]}">${label[p.status][0]}</span>
      <h3 style="font-size:22px;margin:10px 0 4px"><a href="#/p/${esc(p.slug)}" style="color:var(--ink)">${esc(p.title)}</a></h3><p class="muted">${esc(p.tagline)}</p>
      ${p.mod_note ? `<p style="margin-top:8px;font-size:14px"><strong>Moderator note:</strong> ${esc(p.mod_note)}</p>` : ""}</div>
      <div class="acts"><a class="va-btn va-btn-sm" href="#/edit/${esc(p.slug)}">Edit</a></div></div>`).join("")}</div>`
    : `<div class="empty"><h3>Nothing shared yet</h3><p class="muted"><a href="#/submit">Show your first build</a>.</p></div>`}
  </div></section>`;
  $("#editProf").addEventListener("click", openProfile);
}

/* ---------- moderation ---------- */
function modControls(p) {
  return `<section class="fieldset" style="margin:48px 0" aria-label="Moderation"><p class="eyebrow">Moderation</p>
    <div class="acts" style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="va-btn va-btn-sm ${p.status === "approved" ? "" : "va-btn-primary"}" data-act="approve">${p.status === "approved" ? "Published" : "Approve"}</button>
      <button class="va-btn va-btn-sm" data-act="hide">${p.status === "hidden" ? "Hidden" : "Hide"}</button>
      <button class="va-btn va-btn-sm" data-act="reviewed" aria-pressed="${p.reviewed}">${p.reviewed ? "✓ Reviewed" : "Mark reviewed"}</button>
      <button class="va-btn va-btn-sm" data-act="featured" aria-pressed="${p.featured}">${p.featured ? "✓ Featured" : "Feature"}</button>
    </div>
    <div class="field"><label for="modNote">Note to the builder (shown on their My builds page)</label><input type="text" id="modNote" maxlength="500" value="${esc(p.mod_note || "")}"></div>
    <button class="va-btn va-btn-sm" data-act="note" style="justify-self:start">Save note</button></section>`;
}
function wireMod(p, after) {
  $$("[data-act]").forEach(b => b.addEventListener("click", async () => {
    const act = b.dataset.act, patch = {};
    if (act === "approve") patch.status = "approved";
    if (act === "hide") patch.status = "hidden";
    if (act === "reviewed") patch.reviewed = !p.reviewed;
    if (act === "featured") patch.featured = !p.featured;
    if (act === "note") patch.mod_note = $("#modNote").value.trim();
    const { error } = await sb.from("va_projects").update(patch).eq("id", p.id);
    if (error) return setStatus("That didn't save: " + error.message);
    setStatus("Saved."); await loadProjects();
    after ? after() : viewProject(p.slug);
  }));
}

async function viewModerate() {
  if (!isMod) { location.hash = "#/"; return; }
  const { data } = await sb.from("va_projects").select("*").neq("status", "approved").order("created_at", { ascending: true });
  const list = data || [];
  const ids = [...new Set(list.map(p => p.created_by))];
  if (ids.length) { const { data: ps } = await sb.from("va_profiles").select("id,display_name").in("id", ids); (ps || []).forEach(x => names[x.id] = x.display_name); }
  main.innerHTML = `<section class="section" style="padding-top:40px"><div class="wrap">
    <div class="section-head"><div><p class="eyebrow">Moderation</p><h1 style="font-size:clamp(40px,6vw,64px);margin-top:8px">Waiting for review</h1></div></div>
    <div class="callout" style="margin-bottom:24px">Before approving: open the live link, check the screenshot and prompt contain no personal data, and that nothing could put someone at risk. Hide with a note if something needs fixing.</div>
    ${list.length ? `<div class="mod-list">${list.map(p => `<div class="mod-row"><div>
      <span class="va-tag ${p.status === "hidden" ? "va-tag-ember" : "va-tag-sun"}">${p.status === "hidden" ? "Hidden" : "Pending"}</span>
      <h3 style="font-size:22px;margin:10px 0 4px"><a href="#/p/${esc(p.slug)}" style="color:var(--ink)">${esc(p.title)}</a></h3>
      <p class="muted">${esc(p.tagline)}</p><p style="font-size:14px;margin-top:6px">By ${esc(names[p.created_by] || "someone")} · ${new Date(p.created_at).toLocaleDateString("en-GB")}</p></div>
      <div class="acts"><a class="va-btn va-btn-sm va-btn-primary" href="#/p/${esc(p.slug)}">Review</a></div></div>`).join("")}</div>`
    : `<div class="empty"><h3>All clear</h3><p class="muted">Nothing is waiting for review.</p></div>`}
  </div></section>`;
}

/* ---------- auth ---------- */
function openAuth(intro) {
  if (!sb) return setStatus("Sign-in opens once the database is connected.");
  $("#authForm").reset(); $("#authMsg").textContent = "";
  $("#authIntro").textContent = intro || "We'll email you a sign-in link. No password needed.";
  $("#ghBtn").hidden = $("#ghOr").hidden = !CFG.GITHUB_SIGNIN;
  $("#authDialog").showModal();
}
$("#authCancel").addEventListener("click", () => $("#authDialog").close());
$("#ghBtn").addEventListener("click", () => {
  store("va-return", location.hash);
  sb.auth.signInWithOAuth({ provider: "github", options: { redirectTo: redirectTo() } });
});
$("#authForm").addEventListener("submit", async e => {
  e.preventDefault();
  const msg = $("#authMsg"), btn = $("#authSubmit"), email = $("#aEmail").value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) { msg.className = "msg err"; msg.textContent = "Please enter an email address."; return; }
  btn.disabled = true; msg.className = "msg"; msg.textContent = "Sending…";
  store("va-return", location.hash);
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
  btn.disabled = false;
  if (error) { msg.className = "msg err"; msg.textContent = "We couldn't send the email: " + error.message; }
  else { msg.className = "msg ok"; msg.textContent = "Check your inbox for a link from Vibe Aid. You can close this."; }
});
$("#authBtn").addEventListener("click", async () => {
  if (session) { await sb.auth.signOut(); session = null; await loadMe(); await loadProjects(); route(); setStatus("You've signed out."); }
  else openAuth();
});

function openProfile() {
  const meta = session?.user?.user_metadata || {};
  $("#pName").value = profile?.display_name || meta.full_name || meta.name || "";
  $("#pOrg").value = profile?.organisation || "";
  $("#pLoc").value = profile?.location || "";
  $("#pGh").value = profile?.github || meta.user_name || "";
  $("#pOver16").checked = !!profile?.over_16;
  $("#profMsg").textContent = "";
  if (!$("#profileDialog").open) $("#profileDialog").showModal();
}
$("#profileForm").addEventListener("submit", async e => {
  e.preventDefault();
  const msg = $("#profMsg");
  const row = { id: session.user.id, display_name: $("#pName").value.trim(), organisation: $("#pOrg").value.trim(), location: $("#pLoc").value.trim(), github: $("#pGh").value.trim(), over_16: $("#pOver16").checked };
  if (!row.display_name) { msg.className = "msg err"; msg.textContent = "Please add a name to show."; return; }
  if (!row.over_16) { msg.className = "msg err"; msg.textContent = "You need to be 16 or over to share projects here."; return; }
  const { error } = await sb.from("va_profiles").upsert(row);
  if (error) { msg.className = "msg err"; msg.textContent = "That didn't save: " + error.message; return; }
  $("#profileDialog").close(); await loadMe(); setStatus("Saved. Welcome to Vibe Aid.");
  if (location.hash.startsWith("#/submit") || location.hash.startsWith("#/edit")) route();
});

/* ---------- router ---------- */
async function route() {
  clearTimeout(typedTimer);
  const h = location.hash || "#/";
  const [path, anchor] = h.slice(1).split("#");
  const parts = path.split("/").filter(Boolean);
  document.title = "Vibe Aid — vibe coding for humanitarian and social good";
  $$(".nav a").forEach(a => a.removeAttribute("aria-current"));
  const nav = parts[0] === "p" ? "projects" : (parts[0] || "");
  const cur = $(`.nav a[data-nav="${nav}"]`); if (cur) cur.setAttribute("aria-current", "page");
  if (!parts.length) viewHome();
  else if (parts[0] === "projects") viewProjects();
  else if (parts[0] === "p" && parts[1]) await viewProject(decodeURIComponent(parts[1]));
  else if (parts[0] === "submit") await viewSubmit();
  else if (parts[0] === "edit" && parts[1]) await viewSubmit(decodeURIComponent(parts[1]));
  else if (parts[0] === "mine") await viewMine();
  else if (parts[0] === "moderate") await viewModerate();
  else viewHome();
  if (anchor) { const el = document.getElementById(anchor); if (el) { el.scrollIntoView(); return; } }
  window.scrollTo(0, 0);
  if (parts.length) main.focus({ preventScroll: true });
}
window.addEventListener("hashchange", route);

/* ---------- start ---------- */
(async function start() {
  if (sb) {
    const { data } = await sb.auth.getSession(); session = data.session;
    sb.auth.onAuthStateChange(async (event, s) => {
      const was = !!session; session = s;
      if (event === "SIGNED_IN" && !was) {
        await loadMe();
        if (!profile) openProfile();
        const back = store("va-return"); if (back) { store("va-return", ""); if (back !== location.hash) { location.hash = back; return; } }
        route();
      }
    });
  }
  await loadMe();
  await loadProjects();
  if (sb && session && !profile) openProfile();
  route();
})();
})();
