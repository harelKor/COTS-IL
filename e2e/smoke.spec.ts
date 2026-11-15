import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

config({ path: ".env.local" });

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54424";
const ADMIN_EMAIL = "mentor@beniadam.test";

/** The newest 6-digit code Mailpit holds for this address (the subject carries it, the body too). */
async function emailCode(email: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const { messages } = (await res.json()) as { messages: { ID: string; Subject: string }[] };
    for (const m of messages ?? []) {
      const found = m.Subject.match(/\b(\d{6})\b/);
      if (found) return found[1];
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { Text: string };
      const inBody = full.Text.match(/\b(\d{6})\b/);
      if (inBody) return inBody[1];
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`no code email for ${email}`);
}

async function openCart(page: Page) {
  await page.getByRole("button", { name: /^הסל/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

/** Errors the page logs or throws; a failed third-party resource (a supplier photo) doesn't count. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`${page.url()}: ${m.text()}`);
  });
  return errors;
}

test("the theme follows the device, the welcome note says so, and a choice sticks", async ({ page }, info) => {
  const errors = watchErrors(page);
  const device = info.project.name as "light" | "dark";
  const other = device === "dark" ? "light" : "dark";
  const words = { light: "האתר במצב בהיר", dark: "האתר במצב כהה" };
  await page.goto("/catalog");
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-theme");
  // Once per session, under the header, saying which theme the site is in.
  const note = page.getByRole("status").filter({ hasText: words[device] });
  await expect(note).toBeVisible();
  const header = await page.locator("header.site-header").boundingBox();
  expect((await note.boundingBox())!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  // Its button switches the theme, and the choice is remembered on reload.
  await note.getByRole("button", { name: other === "dark" ? "למצב כהה" : "למצב בהיר" }).click();
  await expect(html).toHaveAttribute("data-theme", other);
  await expect(note).toBeHidden();
  const canvas = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const chosen = await canvas();
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", other);
  expect(await canvas()).toBe(chosen);
  // Not again in this session.
  await expect(page.getByRole("status").filter({ hasText: /האתר במצב/ })).toHaveCount(0);
  // "לפי המכשיר" in the menu clears the choice.
  await page.getByRole("button", { name: "תפריט" }).click();
  await page.getByRole("button", { name: "לפי המכשיר" }).click();
  await expect(html).not.toHaveAttribute("data-theme");
  expect(await canvas()).not.toBe(chosen);
  expect(errors).toEqual([]);
});

test("guest cart, sign in, send, admin quote, team approves", async ({ browser, page }) => {
  // The welcome note has its own test; here it would only sit over the page for 8 seconds.
  await page.addInitScript(() => sessionStorage.setItem("cots-theme-welcome", "1"));
  const errors = watchErrors(page);
  const stamp = Date.now();
  const email = `e2e${stamp}@beniadam.test`;
  const teamNumber = String(10000 + (stamp % 80000));

  // 1. A guest picks a vendor on the home page and adds a part that needs no options from its
  //    store (a one-variant, priced family): from "most wanted", else from one of its categories.
  const single = page.getByRole("button", { name: /^הוספה לסל:/ });
  await page.goto("/");
  await page.locator("#vendors a").first().click();
  await expect(page).toHaveURL(/\/v\/[a-z]+$/);
  const store = new URL(page.url()).pathname;
  let found = await single.first().waitFor({ timeout: 8000 }).then(() => true, () => false);
  const categories = await page.locator(`main a[href^="${store}?category="]`).evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  for (const href of categories) {
    if (found) break;
    await page.goto(href);
    found = await single.first().waitFor({ timeout: 8000 }).then(() => true, () => false);
  }
  expect(await single.count(), "a single-part card in the vendor's store (run npm run sync)").toBeGreaterThan(0);
  const vendorName = (await page.locator('nav[aria-label="ניווט"] bdi').first().innerText()).trim();
  await single.first().click();
  await expect(page.getByRole("button", { name: /^הסל, (1|פריט אחד)/ }).first()).toBeVisible();

  // 2. Signs in with the email code in the cart sheet.
  await openCart(page);
  const dialog = page.getByRole("dialog");
  // The footer shows one button; the sign-in step opens once it's pressed.
  await dialog.getByRole("button", { name: "שליחת בקשה", exact: true }).click();
  await dialog.getByLabel("דוא״ל").fill(email);
  await dialog.getByRole("button", { name: "שליחת קוד כניסה" }).click();
  const code = await emailCode(email);
  await dialog.getByLabel("קוד מהמייל").fill(code);

  // 3. Creates the team.
  await dialog.getByLabel("מספר קבוצה").fill(teamNumber);
  await dialog.getByLabel("שם הקבוצה").fill(`E2E ${teamNumber}`);
  await dialog.getByLabel("שם איש קשר").fill("בודק אוטומטי");
  await dialog.getByLabel("טלפון").fill("050-1234567");
  await dialog.getByRole("button", { name: "יצירת הקבוצה" }).click();

  // 4. Sends the request (pickup, so no address is needed).
  const send = dialog.getByRole("button", { name: "שליחת בקשה", exact: true });
  await expect(send).toBeVisible();
  const pickup = dialog.getByRole("button", { name: /איסוף/ });
  if (await pickup.count()) await pickup.first().click().catch(() => {});
  await send.click();
  await page.waitForURL(/\/orders\/[0-9a-f-]+/, { timeout: 60_000 }).catch(() => {});
  await page.goto("/orders");
  const orderLink = page.getByRole("link", { name: /^הזמנה \d+/ }).first();
  const orderNumber = (await orderLink.innerText()).match(/\d+/)?.[0];
  await orderLink.click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+/);
  // The request is divided by vendor: the store's vendor heads its section.
  await expect(page.locator("tbody th", { hasText: vendorName }).first()).toBeVisible();
  const orderUrl = page.url();
  expect(orderNumber).toBeTruthy();

  // The home page shows the last order; its X hides it, and it stays hidden after a reload.
  await page.goto("/");
  const lastOrder = page.getByText(`ההזמנה האחרונה: מס׳ ${orderNumber}`);
  await expect(lastOrder).toBeVisible();
  await page.getByRole("button", { name: "הסתרה" }).click();
  await expect(lastOrder).toBeHidden();
  await page.reload();
  await expect(page.getByRole("heading", { name: "מאיזה ספק קונים?" })).toBeVisible();
  await expect(lastOrder).toBeHidden();

  // 5. The admin approves the new team and sends the quote from "כל ההזמנות".
  const adminCtx = await browser.newContext({ baseURL: "http://localhost:3100", locale: "he-IL" });
  const admin = await adminCtx.newPage();
  await admin.goto("/login");
  await admin.getByText("כניסה עם סיסמה").click();
  await admin.locator("#email").fill(ADMIN_EMAIL);
  await admin.locator("input[name=password]").fill(process.env.SEED_PASSWORD!);
  await admin.locator("form:has(input[name=password]) button").last().click();
  await admin.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
  await admin.goto(`/admin?q=${orderNumber}&open=${orderUrl.split("/").pop()}`);
  const approveTeam = admin.getByRole("button", { name: "אישור הקבוצה" });
  if (await approveTeam.count()) await approveTeam.click();
  await admin.getByLabel("משלוח בישראל ₪").fill("0");
  await admin.getByRole("button", { name: "שליחת ההצעה לקבוצה" }).click();
  await expect(admin.getByText("קישורי אישור").first()).toBeVisible();

  // 6. Email is off locally, so the approval link comes from the WhatsApp link.
  const wa = await admin.locator('a[href*="wa.me"], a[href*="whatsapp"]').first().getAttribute("href");
  const link = decodeURIComponent(wa ?? "").match(/https?:\/\/\S*\/q\/[^\s&]+/)?.[0];
  expect(link, "approval link in the WhatsApp message").toBeTruthy();

  // 7. The team approves through the link, in a browser with no session.
  const guestCtx = await browser.newContext({ locale: "he-IL" });
  const guest = await guestCtx.newPage();
  await guest.goto(link!.replace(/^https?:\/\/[^/]+/, "http://localhost:3100"));
  await guest.getByRole("button", { name: "אישור ההצעה" }).click();
  await expect(guest.getByText("אושרה", { exact: false }).first()).toBeVisible();

  // 8. Both sides show it as approved.
  await page.goto(orderUrl);
  await expect(page.getByText("אושרה", { exact: false }).first()).toBeVisible();
  await admin.goto(`/admin?q=${orderNumber}`);
  await expect(admin.getByText("אושרה", { exact: false }).first()).toBeVisible();
  await adminCtx.close();
  await guestCtx.close();
  expect(errors).toEqual([]);
});
