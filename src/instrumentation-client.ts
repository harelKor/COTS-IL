import { initBotId } from "botid/client/core";

/**
 * BotID challenge for the public write paths. Server actions post to the page
 * they're used on (the cart sheet shows on every page, the part-request form on
 * the catalog), so every page's POSTs carry the challenge; only the four actions
 * that call checkHuman() in src/lib/botid.ts act on it.
 */
initBotId({
  protect: [
    { path: "/", method: "POST" },
    { path: "/*", method: "POST" },
  ],
});
