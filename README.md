# Gitmap

Gitmap is a single-page tool that turns a GitHub repo’s commit history into a visual roadmap with stats, insights, and a lightweight health snapshot.

It started while I was working on my main project and thinking about my own repo history — what I had actually built from the beginning, how it evolved, and whether Git history could be turned into a clearer roadmap. That became Gitmap.

## How to use
1. Paste a repo as `owner/repo` or a full GitHub URL.
2. (Optional) Add a GitHub token for private repos or higher rate limits.
3. Click **Generate Roadmap**.

## Token usage
Tokens are optional and used only for the current session. They are never stored in the browser.

## Roadmap inference (high level)
- Builds phases using branch patterns and semantic signals (PR metadata when available, dominant file paths, merge/release cues), with time gaps as fallback.
- Labels phases using PR titles, dominant folders, and commit-topic summaries.
- Shows commit types, contributors, and summary health signals.

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
Built as a standalone React project inspired by my own repo mess