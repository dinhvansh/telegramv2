import { StitchWorkspace } from "@/components/stitch-workspace";
import { getStitchPageHtml } from "@/lib/stitch-pages";

export default function SpamPage() {
  return <StitchWorkspace html={getStitchPageHtml("spam")} />;
}
