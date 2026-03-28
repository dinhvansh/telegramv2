import { StitchWorkspace } from "@/components/stitch-workspace";
import { getStitchPageHtml } from "@/lib/stitch-pages";

export default function RolesPage() {
  return <StitchWorkspace html={getStitchPageHtml("roles")} />;
}
