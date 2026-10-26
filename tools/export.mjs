// Writes the approved projects to data/projects.json (an open-data snapshot).
// Run by .github/workflows/export.yml every Monday; you can also run: node tools/export.mjs
import { readFileSync, writeFileSync } from "node:fs";
const cfg = readFileSync(new URL("../config.js", import.meta.url), "utf8");
const pick = k => (cfg.match(new RegExp(k + ':\\s*"([^"]*)"')) || [])[1] || "";
const url = pick("SUPABASE_URL"), key = pick("SUPABASE_ANON_KEY");
if (!url || url.startsWith("PASTE")) { console.log("Supabase not configured yet; nothing to export."); process.exit(0); }
const cols = "slug,title,tagline,cause,helps,problem,what_it_does,prompt,tools,build_time,lessons,live_url,repo_url,licence,location,team,reviewed,created_at,updated_at";
const r = await fetch(`${url}/rest/v1/va_projects?status=eq.approved&select=${cols}&order=created_at.desc`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
if (!r.ok) { console.error("Export failed:", r.status, await r.text()); process.exit(1); }
const rows = (await r.json()).map(p => ({ ...p, url: `https://vibeaid.andymiah.net/#/p/${p.slug}` }));
writeFileSync(new URL("../data/projects.json", import.meta.url), JSON.stringify(rows, null, 2) + "\n");
console.log(`Exported ${rows.length} projects.`);
