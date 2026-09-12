# Run doc — Scripture Ray preview

Vite + React + TypeScript + Tailwind/shadcn SPA (`vite_react_shadcn_ts`). Desktop-only app (refuses to render below 768 px viewport width). No backend, no env files, no generated artifacts.

## Reproduce artifacts

1. No `.env*` files exist in the main checkout — nothing to copy.
2. Install dependencies with npm (both `package-lock.json` and `bun.lock` exist; npm is what the environment uses):
   ```bash
   npm install --no-audit --no-fund
   ```
   Notes:
   - First run may fail with a transient `ECONNRESET` mid-reify; simply re-run the same command — cached packages make the retry fast.
   - `node_modules` is gitignored; a fresh worktree must always run this step.

## Run the server

```bash
npm run dev
```

- Vite serves on the project's default **port 8080** (pinned in `vite.config.ts` with `host: "::"`). Use `-- --port <free-port>` if 8080 is taken; no other config needs to change.  - Boot takes ~3 s; Vite prints one non-blocking advisory line on every boot
    ("Browserslist: browsers data (caniuse-lite) is 15 months old — run
    `npx update-browserslist-db@latest` to refresh"). That advisory does not
    block startup or the app and is safe to ignore during preview work; refresh
    it any time with the one-liner above (it touches only dev tooling metadata,
    never app source).
- Routes: `/` = operator screen (needs ≥ 768 px viewport, e.g. a widened Preview pane or external browser), `/projection` = audience screen (black, "Waiting for passage..." until a passage is committed).

## Windows detached start (Freebuff preview recipe)

```powershell
powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -RedirectStandardOutput '<log>' -RedirectStandardError '<log>.err' -WindowStyle Hidden -PassThru).Id"
```

stdout and stderr must go to different files (PowerShell fails otherwise). `Start-Process` may return before the child is fully up — poll `netstat -ano | grep :8080` / curl `http://localhost:8080/` instead of trusting the pid alone. The tool's 30 s timeout on this start command is not a failure signal; check the log.

While the server runs, the log file is held open by the process — reading tools may report it as `[BLOCKED]`. Read `.log.err` (usually empty) or use `Get-Content -Tail` instead; this is harmless, not a boot failure.
