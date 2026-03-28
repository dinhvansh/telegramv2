import { StitchWorkspace } from "@/components/stitch-workspace";
import { getStitchPageHtml } from "@/lib/stitch-pages";

export default function DashboardPage() {
  return <StitchWorkspace html={getStitchPageHtml("dashboard")} />;
}
