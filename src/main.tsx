import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// PWA offline delivery: register the service worker in production builds only
// (Vite's dev server must never be cached). Registration is fire-and-forget and
// fully guarded — an infra failure here must never affect app boot, the same
// rule the persistence layer obeys (RI-022). Wordde keeps working online even
// if registration fails.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("[pwa] Service worker registration failed (app continues online):", error);
    });
  });
}
