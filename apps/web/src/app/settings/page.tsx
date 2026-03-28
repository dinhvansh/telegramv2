import { StitchWorkspace } from "@/components/stitch-workspace";
import { getStitchPageHtml } from "@/lib/stitch-pages";

export default function SettingsPage() {
  return <StitchWorkspace html={getStitchPageHtml("settings")} />;
}
