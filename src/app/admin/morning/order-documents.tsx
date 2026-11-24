import { ExternalLink } from "lucide-react";
import { StatusTag } from "@/components/form";
import { Ltr } from "@/components/ltr";
import { formatDay } from "@/domain/display";
import { KIND_LABEL, creditRemaining } from "@/domain/morning";
import { formatIls } from "@/domain/pricing";
import { morningConfig } from "@/lib/morning";
import { orderDocuments, stuckDocumentIds, toIssuedDocs } from "@/lib/morning-documents";
import { getSettings } from "@/lib/settings";
import { issueQuoteDocument, retryDocument } from "./actions";
import { CreditForm, MorningButton } from "./morning-forms";

type QuoteRef = { id: string; version: number; status: string; morningQuoteNo: string | null; morningDealNo: string | null };

/**
 * P3: the order's Morning documents on the admin card: each with its number, amount and PDF, a
 * failed one with its error and "ניסיון חוזר", "הפקת זיכוי" on a חשבונית מס/קבלה, and the
 * הצעת מחיר / חשבון עסקה buttons when the automatic step was off or failed. Hidden while
 * Morning has no keys and the order has no documents.
 */
export async function OrderDocuments({ orderId, quotes }: { orderId: string; quotes: QuoteRef[] }) {
  const cfg = morningConfig();
  const [docs, stuckIds] = await Promise.all([orderDocuments(orderId), stuckDocumentIds(orderId)]);
  if (!cfg && docs.length === 0) return null;
  const steps = (await getSettings()).morning;
  const issued = toIssuedDocs(docs);
  const byId = new Map(docs.map((d) => [d.id, d]));
  const current = quotes.filter((q) => q.status !== "superseded").sort((a, b) => b.version - a.version)[0];
  const has = (kind: "quote" | "deal") => current && docs.some((d) => d.quoteId === current.id && d.kind === kind);
  const canQuote = cfg && current && !current.morningQuoteNo && !has("quote");
  const canDeal = cfg && current?.status === "approved" && !current.morningDealNo && !has("deal");

  return (
    <section className="card-surface flex flex-col gap-3 rounded-[18px] p-4" aria-label="מסמכים בחשבונית ירוקה">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-section font-semibold tracking-[-0.02em]">מסמכים</h2>
        {cfg?.env === "sandbox" && <StatusTag tone="warning">חשבון בדיקה</StatusTag>}
      </div>
      {docs.length === 0 ? (
        <p className="text-sm text-muted">עוד לא הופקו מסמכים בחשבונית ירוקה.</p>
      ) : (
        <ul className="flex flex-col">
          {docs.map((d) => {
            const label = KIND_LABEL[d.kind];
            const credited = d.creditsId ? byId.get(d.creditsId) : null;
            const remaining = d.kind === "invoice_receipt" && d.status === "issued" ? creditRemaining(issued.find((i) => i.id === d.id)!, issued) : 0;
            const stuck = stuckIds.has(d.id);
            return (
              <li key={d.id} className="flex flex-col gap-1 border-t border-line py-2 text-sm first:border-t-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-x-2">
                    <span className="font-medium">
                      {label}
                      {d.number && (
                        <>
                          {" "}
                          <Ltr>{d.number}</Ltr>
                        </>
                      )}
                    </span>
                    <span className="tabular-nums">{formatIls(Number(d.amountIls), { agorot: true })}</span>
                    {d.issuedAt && <Ltr>{formatDay(d.issuedAt)}</Ltr>}
                    {credited?.number && (
                      <span className="text-muted">
                        זיכוי ל-<Ltr>{credited.number}</Ltr>
                      </span>
                    )}
                    {d.status === "pending" && <StatusTag tone="brand">בהפקה</StatusTag>}
                    {d.status === "failed" && <StatusTag tone="danger">לא הופק</StatusTag>}
                    {d.kind === "invoice_receipt" && d.status === "issued" && remaining === 0 && <StatusTag tone="neutral">זוכה במלואה</StatusTag>}
                  </span>
                  {d.pdfUrlHe && (
                    <a href={d.pdfUrlHe} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-1 text-brand hover:underline">
                      <ExternalLink size={20} strokeWidth={1.75} aria-hidden />
                      PDF
                    </a>
                  )}
                </div>
                {d.error && d.status === "failed" && <p className="text-caption text-danger">{d.error}</p>}
                {cfg && (d.status === "failed" || stuck) && <MorningButton action={retryDocument} fields={{ documentId: d.id }} label="ניסיון חוזר" variant="ghost" />}
                {cfg && steps.credit && remaining > 0 && <CreditForm documentId={d.id} remaining={remaining} label={`${label} ${d.number}`} />}
              </li>
            );
          })}
        </ul>
      )}
      {(canQuote || canDeal) && (
        <div className="flex flex-wrap gap-2">
          {canQuote && <MorningButton action={issueQuoteDocument} fields={{ quoteId: current.id, kind: "quote" }} label={`הפקת ${KIND_LABEL.quote}`} />}
          {canDeal && <MorningButton action={issueQuoteDocument} fields={{ quoteId: current.id, kind: "deal" }} label={`הפקת ${KIND_LABEL.deal}`} />}
        </div>
      )}
    </section>
  );
}
