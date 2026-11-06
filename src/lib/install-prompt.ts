/**
 * Runs before hydration (layout.tsx inlines it): holds on to the browser's install prompt
 * so the button can show it later, and drops it once the app is installed.
 */
export const CAPTURE_INSTALL_PROMPT = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__installPrompt=e;window.dispatchEvent(new Event("installprompt:change"))});window.addEventListener("appinstalled",function(){window.__installPrompt=null;window.dispatchEvent(new Event("installprompt:change"))});`;
