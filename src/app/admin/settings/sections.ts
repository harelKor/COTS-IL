/** Every S16 section; the ones not built yet show as disabled tabs (S16b–d). */
export const SECTIONS = [
  { href: "/admin/settings/business", label: "פרטי העסק" },
  { href: "/admin/settings/pricing", label: "תמחור" },
  { href: "/admin/settings/admins", label: "מנהלים" },
  { href: null, label: "ספקים" },
  { href: null, label: "מוצרים" },
  { href: null, label: "קטגוריות" },
  { href: null, label: "תוכן האתר" },
  { href: null, label: "מערכת" },
] as const;
