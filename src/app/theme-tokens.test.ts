import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { over, parseColour, ratio, type Rgba } from "@/domain/contrast";
import { THEME_COLOR } from "@/domain/theme";

/**
 * The two themes' tokens (LM1, docs/LIGHT-MODE-PLAN.md), read from globals.css: the dark :root
 * block (the site as it was on Nov 14, and what a browser without light-dark() gets) and the
 * light-dark(light, dark) block. The dark half must always equal the dark block, every themed token
 * needs a light value, and the text pairs must pass AA in both themes.
 */
const css = readFileSync(join(import.meta.dirname, "globals.css"), "utf8").replaceAll("\r\n", "\n");

function block(start: string): Map<string, string> {
  const at = css.indexOf(start);
  if (at === -1) throw new Error(`no block ${start}`);
  const open = css.indexOf("{", at + start.length - 1);
  let depth = 0;
  let end = open;
  for (; end < css.length; end++) {
    if (css[end] === "{") depth++;
    if (css[end] === "}" && --depth === 0) break;
  }
  const body = css.slice(open + 1, end).replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens.set(m[1], m[2].replace(/\s+/g, " ").trim());
  return tokens;
}

/** Each light-dark(a, b) replaced by one of its halves (nested parentheses and commas allowed). */
function half(value: string, which: 0 | 1): string {
  let out = "";
  let i = 0;
  while (i < value.length) {
    const at = value.indexOf("light-dark(", i);
    if (at === -1) return out + value.slice(i);
    out += value.slice(i, at);
    let depth = 0;
    let comma = -1;
    let j = at + "light-dark".length;
    for (; j < value.length; j++) {
      if (value[j] === "(") depth++;
      else if (value[j] === ")" && --depth === 0) break;
      else if (value[j] === "," && depth === 1 && comma === -1) comma = j;
    }
    const args = [value.slice(at + "light-dark(".length, comma), value.slice(comma + 1, j)];
    out += half(args[which].trim(), which);
    i = j + 1;
  }
  return out;
}

const dark = block(":root {");
const themed = block("@supports (color: light-dark(#000, #fff)) {\n  :root {");
const light = new Map([...themed].map(([k, v]) => [k, half(v, 0)]));
const darkHalf = new Map([...themed].map(([k, v]) => [k, half(v, 1)]));

/** Tokens that read the same in both themes, or that only point at other tokens. */
const SHARED = new Set([
  "--accent",
  "--glow",
  "--glow-strong",
  "--gradient-outline",
  "--ease-out",
  "--ease-spring",
  "--vendor-primary",
  "--vendor-primary-rgb",
  "--vendor-secondary",
  "--vendor-on-primary",
]);

describe("the theme tokens", () => {
  it("keep the dark theme exactly as it was: every dark half equals the dark :root block", () => {
    for (const [name, value] of darkHalf) expect(value, name).toBe(dark.get(name));
  });

  it("give every themed token a light value", () => {
    const missing = [...dark.keys()].filter((name) => !SHARED.has(name) && !themed.has(name));
    expect(missing).toEqual([]);
  });

  it("set the page's canvas to the browser chrome colours", () => {
    expect(light.get("--background")).toBe(THEME_COLOR.light);
    expect(dark.get("--background")).toBe(THEME_COLOR.dark);
  });
});

/** A token as an opaque colour, laid over `base` when it's translucent. */
function colour(tokens: Map<string, string>, name: string, base?: Rgba): Rgba {
  const value = tokens.get(name);
  const c = value ? parseColour(value) : null;
  if (!c) throw new Error(`${name} is not a plain colour: ${value}`);
  return c[3] < 1 ? over(c, base ?? colour(tokens, "--background")) : c;
}

const WHITE: Rgba = [255, 255, 255, 1];
const TEXT = ["--foreground", "--muted", "--brand", "--brand-strong", "--danger", "--success", "--warning", "--violet", "--teal", "--indigo", "--slate", "--vendor-text-accent"];

describe.each([
  ["light", light],
  ["dark", dark],
] as const)("contrast in the %s theme (AA, 4.5:1)", (_theme, tokens) => {
  const bg = () => colour(tokens, "--background");
  const surfaces: [string, () => Rgba][] = [
    ["background", bg],
    ["surface", () => colour(tokens, "--surface")],
    ["subtle on surface", () => colour(tokens, "--subtle", colour(tokens, "--surface"))],
    ["card", () => colour(tokens, "--card-fill", bg())],
    ["glass card", () => colour(tokens, "--glass-fill", bg())],
  ];

  it.each(TEXT)("%s reads on every surface", (text) => {
    for (const [name, surface] of surfaces) expect(ratio(colour(tokens, text), surface()), `${text} on ${name}`).toBeGreaterThanOrEqual(4.5);
  });

  it("the component inks read on their own fills", () => {
    const pairs: [string, string][] = [
      ["--chip-ink", "--chip-fill"],
      ["--pill-ink", "--pill-fill"],
      ["--tag-ink", "--tag-fill"],
      ["--arrow-ink", "--arrow-fill"],
      ["--prose", "--background"],
      ["--fire-ink", "--surface"],
      ["--fire-ink", "--background"],
    ];
    for (const [ink, fill] of pairs) expect(ratio(colour(tokens, ink), colour(tokens, fill, bg())), `${ink} on ${fill}`).toBeGreaterThanOrEqual(4.5);
  });
});

describe("white text on the deep fills", () => {
  const FILLS = ["--brand-fill", "--brand-fill-strong", "--danger-fill", "--success-fill", "--warning-fill"];
  it("is AA in the light theme", () => {
    for (const fill of FILLS) expect(ratio(WHITE, colour(light, fill)), fill).toBeGreaterThanOrEqual(4.5);
  });
  it("is at least 3:1 in the dark theme (its fills are the Nov 14 ones, unchanged)", () => {
    for (const fill of FILLS) expect(ratio(WHITE, colour(dark, fill)), fill).toBeGreaterThanOrEqual(3);
  });
});
