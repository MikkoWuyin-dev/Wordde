/*
 * No-flash theme boot. Runs BEFORE the module bundle (plain script tag in
 * index.html), resolving next-themes' persisted choice ("light" | "dark" |
 * "system", localStorage key "theme") against the OS preference and setting
 * the class on <html> pre-paint. External file, because the CSP forbids
 * inline scripts (script-src 'self'). next-themes re-derives the same result
 * on hydration and takes ownership afterwards; if storage is blocked we do
 * nothing and the light default renders, corrected moments later.
 */
(function () {
  try {
    var theme = localStorage.getItem('theme') || 'system';
    var dark =
      theme === 'dark' ||
      (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var cl = document.documentElement.classList;
    cl.remove('light', 'dark');
    cl.add(dark ? 'dark' : 'light');
  } catch (e) {
    /* storage blocked — light default renders; next-themes corrects on boot */
  }
})();
