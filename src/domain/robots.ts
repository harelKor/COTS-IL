/**
 * robots.txt, read the way the catalog sync needs: the group for our user-agent (or `*`),
 * its Allow/Disallow rules with `*` and `$`, longest match wins, and its Crawl-delay.
 */

export type RobotsRules = { allow: string[]; disallow: string[]; crawlDelaySeconds: number | null };

export function parseRobots(text: string, userAgent: string): RobotsRules {
  const ua = userAgent.toLowerCase();
  type Group = { agents: string[]; allow: string[]; disallow: string[]; delay: number | null };
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [], delay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "allow" && value) current.allow.push(value);
    else if (key === "disallow" && value) current.disallow.push(value);
    else if (key === "crawl-delay" && Number(value) >= 0) current.delay = Number(value);
  }
  const product = ua.split("/")[0];
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && product.includes(a)));
  const chosen = mine.length > 0 ? mine : groups.filter((g) => g.agents.includes("*"));
  return {
    allow: chosen.flatMap((g) => g.allow),
    disallow: chosen.flatMap((g) => g.disallow),
    crawlDelaySeconds: chosen.map((g) => g.delay).find((d) => d !== null) ?? null,
  };
}

function matches(rule: string, path: string): boolean {
  const anchored = rule.endsWith("$");
  const body = (anchored ? rule.slice(0, -1) : rule)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
}

/** Whether a path (with its query) may be fetched. The longest matching rule wins; Allow wins a tie. */
export function isAllowed(rules: RobotsRules, pathAndQuery: string): boolean {
  const longest = (list: string[]) => Math.max(-1, ...list.filter((r) => matches(r, pathAndQuery)).map((r) => r.length));
  const allow = longest(rules.allow);
  const disallow = longest(rules.disallow);
  return disallow < 0 || allow >= disallow;
}
