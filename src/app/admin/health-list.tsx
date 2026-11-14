import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { StatusTag } from "@/components/form";
import { Ltr } from "@/components/ltr";
import type { HealthCheck, Level } from "@/domain/health";

const TAG: Record<Level, { tone: "danger" | "warning" | "success"; text: string }> = {
  red: { tone: "danger", text: "תקלה" },
  yellow: { tone: "warning", text: "לבדוק" },
  ok: { tone: "success", text: "תקין" },
};

/** One line of the health list: its tag, what's checked, its state, and a link to where it's fixed. */
function HealthRow({ check }: { check: HealthCheck }) {
  const external = check.href.startsWith("http");
  const body = (
    <>
      <span className="flex flex-wrap items-center gap-2">
        <StatusTag tone={TAG[check.level].tone}>{TAG[check.level].text}</StatusTag>
        <span className="font-medium">{check.label}</span>
        {external && <ExternalLink size={20} strokeWidth={1.75} aria-label="נפתח באתר חיצוני" className="text-muted" />}
      </span>
      <span className="text-callout text-muted">{check.line}</span>
      {check.detail && (
        <span className="text-caption break-words text-danger">
          <Ltr>{check.detail}</Ltr>
        </span>
      )}
    </>
  );
  const className = "flex min-h-11 flex-col gap-1 py-2 hover:text-brand";
  return (
    <li>
      {external ? (
        <a href={check.href} target="_blank" rel="noopener noreferrer" className={className}>
          {body}
        </a>
      ) : (
        <Link href={check.href} className={className}>
          {body}
        </Link>
      )}
    </li>
  );
}

export function HealthList({ checks }: { checks: readonly HealthCheck[] }) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {checks.map((c) => (
        <HealthRow key={c.key} check={c} />
      ))}
    </ul>
  );
}
