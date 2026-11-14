import { describe, expect, it } from "vitest";
import { bodyFrom, eventLabel, eventTokens, factTokens, fillHtml, fillText, subjectFrom, templateKey, unknownEmailTokens } from "./email-overrides";

const values = eventTokens({ orderNumber: 1071, teamName: "אורביט <1690>", totalIls: 1240, reason: null, email: "a@b.co" });

describe("email tokens", () => {
  it("makes tokens from the event's fields, leaving empty ones out", () => {
    expect(Object.keys(values).sort()).toEqual(["דוא״ל", "מספר הזמנה", "סכום", "קבוצה"].sort());
    expect(values["מספר הזמנה"]).toEqual({ value: "1071", ltr: true });
    expect(values["סכום"].value).toContain("1,240");
  });

  it("fills plain text and blanks an unknown name", () => {
    expect(fillText("הזמנה {מספר הזמנה} של {קבוצה}{x}.", values)).toBe("הזמנה 1071 של אורביט <1690>.");
  });

  it("escapes values in HTML and sets left-to-right ones apart", () => {
    const html = fillHtml("הזמנה {מספר הזמנה} של {קבוצה} <b>", values);
    expect(html).toContain('<bdi dir="ltr" style="unicode-bidi:isolate">1071</bdi>');
    expect(html).toContain("אורביט &lt;1690&gt;");
    expect(html).toContain("&lt;b&gt;");
    expect(html).not.toContain("<b>");
  });

  it("lists the names no token offers", () => {
    expect(unknownEmailTokens("{קבוצה} {x} {y}", ["קבוצה"])).toEqual(["x", "y"]);
  });

  it("carries the business facts, empty while unset", () => {
    const f = factTokens({ legalName: null, phone: "03-1", email: null, handlingFee: "₪30", paymentTerms: null, returnPolicy: null });
    expect(f["טלפון העסק"]).toEqual({ value: "03-1", ltr: true });
    expect(f["תנאי תשלום"].value).toBe("");
  });
});

describe("subject and body overrides", () => {
  it("uses the subject with its tokens filled, or nothing when it has no words left", () => {
    expect(subjectFrom("הצעה {מספר הזמנה}  מוכנה\nמהר", values)).toBe("הצעה 1071 מוכנה מהר");
    expect(subjectFrom("{x}", values)).toBeNull();
    expect(subjectFrom("", values)).toBeNull();
    expect(subjectFrom(null, values)).toBeNull();
  });

  it("splits the body into paragraphs and drops one the tokens leave empty", () => {
    const body = bodyFrom("שלום {קבוצה},\nהזמנה {מספר הזמנה}.\n\n{סיבה}\n\nתודה", values)!;
    expect(body.text).toEqual(["שלום אורביט <1690>,\nהזמנה 1071.", "תודה"]);
    expect(body.html).toHaveLength(2);
    expect(body.html[0]).toContain("<br>");
    expect(body.html[0]).toContain("&lt;1690&gt;");
  });

  it("returns null for an empty body, so the built-in message stays", () => {
    expect(bodyFrom("  \n\n ", values)).toBeNull();
    expect(bodyFrom("{x}", values)).toBeNull();
    expect(bodyFrom(null, values)).toBeNull();
  });
});

describe("template keys and labels", () => {
  it("keys a template by event and audience", () => {
    expect(templateKey("request_received", "admin")).toBe("request_received:admin");
  });

  it("names an event, or shows its key when it has no name yet", () => {
    expect(eventLabel("quote_ready")).toBe("הצעת מחיר מוכנה");
    expect(eventLabel("brand_new" as never)).toBe("brand_new");
  });
});
