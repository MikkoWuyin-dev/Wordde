import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "node:fs";
import crypto from "node:crypto";
import { componentTagger } from "lovable-tagger";

/**
 * PWA build-time inject (P1 offline delivery).
 *
 * pwa/sw.js precaches the whole app shell for offline use, but Vite's hashed
 * build assets (/assets/index-*.js|css) are unknowable at author time. This
 * plugin emits the worker into the bundle at closeBundle time (public/ files
 * are copied verbatim and never pass through Rollup, so the worker must live
 * outside public/ to be processed), parses the emitted index.html, and
 * prepends the discovered asset list via the `self.__WORDDE_PRECACHE__`
 * token. Static public/ files (Bible ZIPs, fonts, manifest) stay listed
 * statically in sw.js.
 */
function swPrecacheInject(): Plugin {
  return {
    name: "wordde:sw-precache-inject",
    apply: "build",
    closeBundle() {
      const distDir = path.resolve(__dirname, "dist");
      const srcPath = path.resolve(__dirname, "pwa", "sw.js");
      const swPath = path.join(distDir, "sw.js");
      if (!fs.existsSync(srcPath)) {
        this.warn("pwa/sw.js not found; skipping service worker emit");
        return;
      }
      const src = fs.readFileSync(srcPath, "utf8");

      // 1. Hashed build assets from the emitted index.html.
      const html = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
      const refs = new Set<string>();
      const re = /(?:src|href)="(\/assets\/[^"?]+|\/[A-Za-z0-9 _%-]+\.(?:png|ico|svg|webp))"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) refs.add(m[1].split("?")[0]);
      // Web-worker chunks (e.g. bibleDecodeWorker-*.js) are referenced
      // dynamically via new URL(...) and never appear in index.html. Precache
      // them so offline boots still decode in the worker; without this the
      // offline fallback silently drops to the main-thread decoder.
      const assetsDir = path.join(distDir, "assets");
      if (fs.existsSync(assetsDir)) {
        for (const f of fs.readdirSync(assetsDir)) {
          if (/Worker.*\.js$/.test(f)) refs.add(`/assets/${f}`);
        }
      }
      const token = `self.__WORDDE_PRECACHE__ = ${JSON.stringify([...refs])};\n`;

      // 2. Static precache URLs — parsed from the worker source itself so the
      //    list has exactly one home (pwa/sw.js) and cannot drift here.
      const staticUrls: string[] = [];
      const listMatch = src.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
      if (listMatch) {
        const litRe = /'(\/[^']*)'/g;
        let lm: RegExpExecArray | null;
        while ((lm = litRe.exec(listMatch[1])) !== null) staticUrls.push(lm[1]);
      }

      // 3. Derive CACHE_VERSION from the full precache manifest: every URL
      //    plus its content on disk. SPA routes ('/' and '/projection') serve
      //    index.html, so that file's content stands in for both. Any content
      //    change anywhere in the precache set — app code, data, fonts —
      //    automatically yields a new cache version; the manual bump
      //    discipline is gone (fails loudly instead of silently going stale).
      const hash = crypto.createHash("sha256");
      // The worker's own source participates in the hash: a logic change with
      // unchanged assets must still rotate the version so behavior and cache
      // move together. (The placeholder version below is a constant, so this
      // is not circular.)
      hash.update("sw-src\0");
      hash.update(src);
      hash.update("\0");
      const indexHtml = fs.readFileSync(path.join(distDir, "index.html"));
      for (const url of [...staticUrls, ...refs].sort()) {
        hash.update(url);
        hash.update("\0");
        if (url === "/" || url === "/projection") {
          hash.update(indexHtml);
        } else {
          const file = path.join(distDir, url);
          hash.update(fs.existsSync(file) ? fs.readFileSync(file) : Buffer.from("MISSING"));
        }
        hash.update("\0");
      }
      const version = `wordde-${hash.digest("hex").slice(0, 12)}`;

      const versioned = src.replace(
        /const CACHE_VERSION = '[^']*';/,
        `const CACHE_VERSION = '${version}';`,
      );
      if (!versioned.includes(`'${version}'`)) {
        // Fail the build loudly: shipping a stale placeholder version would
        // let clients keep serving an outdated cache (RI-059).
        this.error("pwa/sw.js: could not set CACHE_VERSION — placeholder declaration missing or renamed.");
        return;
      }
      fs.writeFileSync(swPath, token + versioned);
    },
  };
}

/**
 * Dev-only CSP relaxer (P0 #3).
 *
 * The shipped policy in index.html is strict (`script-src 'self'`). Vite's dev
 * server injects an inline React-refresh preamble and talks to the browser over
 * an HMR WebSocket — both would be blocked, killing `npm run dev`. This plugin
 * swaps the policy for a dev-equivalent one (adds 'unsafe-inline' scripts and
 * localhost ws/http connect targets) ONLY while `mode === "development"`.
 * Production builds and `vite preview` are untouched and serve the strict policy.
 */
function cspDevRelaxer(): Plugin {
  const DEV_CSP =
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "font-src 'self'; " +
    "img-src 'self' blob: data:; " +
    "media-src 'self' blob:; " +
    "connect-src 'self' ws: wss: http://localhost:* http://127.0.0.1:*; " +
    "worker-src 'self'; " +
    "base-uri 'self'; form-action 'self'; object-src 'none'";
  return {
    name: "wordde:csp-dev-relaxer",
    transformIndexHtml(html) {
      return html.replace(
        /(<meta[^>]+http-equiv="Content-Security-Policy"[^>]+content=")[^"]*(")/,
        `$1${DEV_CSP}$2`,
      );
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    swPrecacheInject(),
    mode === "development" && componentTagger(),
    mode === "development" && cspDevRelaxer(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
