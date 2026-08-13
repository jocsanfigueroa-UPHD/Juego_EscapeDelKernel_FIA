# AGENTS — AI Coding Agent Instructions

Project: EscapeDelKernel (simple browser game)

Purpose
- Help AI coding agents act as productive, safety-first contributors for this small HTML/CSS/JS project.

Quick summary
- Single-page browser game. Primary files: `index.html`, `script.js`, `style.css`.
- No build system, backend, or package manager in the repo by default.

What an agent should do first
1. Open [index.html](index.html) in a browser to inspect runtime behavior.
2. Inspect [script.js](script.js) for game logic and [style.css](style.css) for UI styles.
3. Make minimal, focused changes; test by reloading the page.

Local testing / serve
- It's fine to open the file directly, but to avoid CORS or module issues, run a local static server when needed:

```bash
python -m http.server 8000
# or
npx http-server -p 8000
```

Conventions and constraints
- Keep changes small and localized. This is a learning/demo game — avoid introducing heavy tooling (Webpack, TypeScript) unless asked.
- Preserve existing file names and structure unless there's a clear reason and user approval.
- Prefer cross-browser, plain JS solutions over framework additions.

Where to make edits
- Game logic: [script.js](script.js)
- Markup / entrypoint: [index.html](index.html)
- Styling: [style.css](style.css)

Pull request guidance for humans
- Small, single-concern PRs with a short description of behavior and steps to reproduce.

When to ask the user
- Before adding new dev tooling, CI, or changing project layout.
- When a change affects persistent storage, networking, or external services.

Next customizations to consider
- Add a short `README.md` describing how to run and test the game (if you want, I can create this).
