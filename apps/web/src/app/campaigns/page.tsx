import { StitchWorkspace } from "@/components/stitch-workspace";
import { getStitchPageHtml } from "@/lib/stitch-pages";

export default function CampaignsPage() {
  return <StitchWorkspace html={getStitchPageHtml("campaigns")} />;
}
