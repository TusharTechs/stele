import { notFound } from "next/navigation";
import { loadProject } from "@/core/store";
import { offerInheritedLessons } from "@/core/intake";
import { isRunning } from "@/core/runner";
import { resolveDkgMode } from "@/dkg/client";
import { isReadOnly } from "@/core/deploy";
import { SiteHeader } from "@/components/SiteHeader";
import { StudioConsole } from "./StudioConsole";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) notFound();

  // Offered on first paint rather than after a round trip: a warm start is the thing most worth
  // noticing about a brand-new project, and it should be visible before anything is clicked.
  const offers = await offerInheritedLessons(project).catch(() => []);

  return (
    <>
      <SiteHeader />
      <StudioConsole
        initialProject={project}
        initialOffers={offers}
        initiallyRunning={isRunning(id)}
        dkgMode={resolveDkgMode()}
        readOnly={isReadOnly()}
      />
    </>
  );
}
