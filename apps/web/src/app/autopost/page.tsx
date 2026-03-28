import { StitchWorkspace } from "@/components/stitch-workspace";
import { getStitchPageHtml } from "@/lib/stitch-pages";

export default function AutopostPage() {
  return <StitchWorkspace html={getStitchPageHtml("autopost")} />;
}
