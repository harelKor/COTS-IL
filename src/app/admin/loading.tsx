import { Loading, PageSkeleton } from "@/components/skeleton";

/**
 * Under the admin tabs while a tab's page loads: the tabs (the layout) stay, and the
 * page's place shows a heading and rows at once instead of waiting blank for the server.
 */
export default function AdminLoading() {
  return (
    <Loading>
      <PageSkeleton rows={6} />
    </Loading>
  );
}
