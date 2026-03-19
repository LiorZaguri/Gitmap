# Gitmap

Gitmap is a single‑page tool that turns a GitHub repo’s commit history into a visual roadmap with stats, insights, and a lightweight health snapshot.

## How to use
1. Paste a repo as `owner/repo` or a full GitHub URL.
2. (Optional) Add a GitHub token for private repos or higher rate limits.
3. Click **Generate Roadmap**.

## Token usage
Tokens are optional and used only for the current session. They are never stored in the browser.

## Roadmap inference (high level)
- Groups commits into phases using branch patterns when present, otherwise time gaps.
- Labels phases and shows commit types, contributors, and summary health signals.

## Current limitations
- Analyzes up to the latest 500 commits.
- Compares up to 15 branches.
- Results are heuristic and may not reflect every nuance of the repo.

## Local setup
```bash
npm install
npm run dev
```

## Credits
Built as a standalone React project inspired by the `github-map.html` prototype.
