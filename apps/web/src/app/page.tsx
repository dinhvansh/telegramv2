import { StitchWorkspace } from "@/components/stitch-workspace";
import { getStitchPageHtml } from "@/lib/stitch-pages";

export default function Home() {
  return <StitchWorkspace entryMode html={getStitchPageHtml("dashboard")} />;
}
