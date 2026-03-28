import { StitchWorkspace } from "@/components/stitch-workspace";
import { getStitchPageHtml } from "@/lib/stitch-pages";

export default function CampaignDetailPage() {
  return <StitchWorkspace html={getStitchPageHtml("campaign-detail")} />;
}
