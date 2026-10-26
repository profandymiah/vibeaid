# Vibe Aid

Vibe coding for humanitarian and social good — a showcase and commons of tools people built with AI for their communities, and the prompts that made them.

Live at https://vibeaid.andymiah.net · Hosted on GitHub Pages (main, root) · Data in Supabase.

| File | What it is |
|---|---|
| `index.html`, `app.js`, `assets/` | The site (no build step) |
| `config.js` | Supabase URL and public key — **the only file you normally edit** |
| `data/examples.js` | Clearly-labelled example projects shown until real ones are published |
| `schema.sql` | Database, rules and screenshot storage (run once in Supabase) |
| `privacy.html` | Privacy, consent and removal |
| `tools/export.mjs`, `.github/workflows/export.yml` | Weekly open-data snapshot to `data/projects.json` |
| `CNAME` | `vibeaid.andymiah.net` |

See [SETUP.md](SETUP.md) to connect Supabase and the domain.
