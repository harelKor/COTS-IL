/** Every S16 section, in tab order, with the line at the top of its page saying what it controls. */
export const SECTIONS = [
  { href: "/admin/settings/business", label: "פרטי העסק", description: "פרטי העסק: שם, טלפון, כתובת איסוף, עמלות, זמני אספקה ומדיניות, כפי שהם מופיעים באתר ובהצעות." },
  { href: "/admin/settings/pricing", label: "תמחור", description: "תמחור: המקדם הכללי, מקדמים לפי ספק וקטגוריה, שער ידני, עיגול ומחיר מינימום." },
  { href: "/admin/settings/admins", label: "מנהלים", description: "מנהלים: מי יכול להיכנס לניהול. הוספה לפי מייל והסרה." },
  { href: "/admin/settings/suppliers", label: "ספקים", description: "ספקים: הוספה לפי כתובת, לוגו, זמן אספקה, מקדם, הסתרה, מחיקה וסנכרון עכשיו." },
  { href: "/admin/settings/products", label: "מוצרים", description: "מוצרים: עריכת חלקים לפי ספק, הסתרה, תמונות, מחירים, חלקים ידניים, איחוד והפרדה של משפחות." },
  { href: "/admin/settings/categories", label: "קטגוריות", description: "קטגוריות: שמות, סדר, קבוצות בדף הבית, תמונה והסתרה." },
  { href: "/admin/settings/content", label: "תוכן האתר", description: "תוכן האתר: דוגמאות חיפוש, הודעה בראש האתר, מוצרים מוצמדים (״מומלץ״) ועמודי המידע." },
  { href: "/admin/settings/system", label: "מערכת", description: "מערכת: סנכרון לפי ספק, דוח קיבוץ, שער הדולר, מיילים והפריסה האחרונה." },
] as const;
