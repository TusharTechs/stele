import Link from "next/link";
import { listProjects } from "@/core/store";
import { SiteHeader } from "@/components/SiteHeader";
import { Ago, Badge, Empty } from "@/components/ui";
import { Composer } from "./Composer";
import { isReadOnly } from "@/core/deploy";

export const dynamic = "force-dynamic";

/**
 * The studio.
 *
 * Ordered the way the work is: make something, then look at what you have made. The brief used to
 * sit in a sidebar beside the list, which gave the one creative act on the page the same width as a
 * column of metadata and made the whole screen read as a settings panel.
 *
 * The productions below it lead with a frame rather than with a title, because this is a studio and
 * the output is pictures. Everything else on the card is the part a folder of files cannot tell
 * you: how many attempts it took, whether the score moved, and how much of its canon is now steering
 * the next render.
 */
export default async function StudioPage() {
  const projects = await listProjects();
  const readOnly = isReadOnly();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-bone-500">Studio</p>
        <h1 className="display mt-2 text-3xl text-bone-50">Brief it, then let it argue with itself</h1>
        <p className="mt-3 max-w-2xl text-bone-400">
          Every attempt reads the canon before it writes a prompt, a model watches what comes back,
          and what it learns waits for you to accept it.
        </p>

        <div className="mt-8">
          <Composer
            readOnly={readOnly}
            canons={projects
              .filter((p) => p.constraints.length > 0)
              .map((p) => ({
                id: p.id,
                title: p.title,
                rules: p.lessons.filter((l) => l.status === "accepted" || l.status === "pinned").length,
                constraints: p.constraints.length,
              }))}
          />
        </div>

        <section className="mt-14">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-basalt-800 pb-3">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-bone-400">
              Productions
            </h2>
            <span className="font-mono text-[11px] text-bone-500">
              {projects.length} in this studio
            </span>
          </div>

          {projects.length === 0 ? (
            <div className="mt-4">
              <Empty>
                Nothing yet. Write a brief above. Stele decomposes it into a canon before it renders
                anything.
              </Empty>
            </div>
          ) : (
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <ProductionCard key={project.id} project={project} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function ProductionCard({ project }: { project: Awaited<ReturnType<typeof listProjects>>[number] }) {
  const scored = project.runs.filter((run) => run.review);
  const best = scored.reduce((max, run) => Math.max(max, run.review!.score), 0);
  const first = scored[0]?.review?.score;
  const moved = scored.length > 1 && first !== undefined && best !== first ? best - first : undefined;
  const steering = project.lessons.filter((l) => l.status === "accepted" || l.status === "pinned").length;
  const awaiting = project.lessons.filter((l) => l.status === "proposed").length;

  // The newest frame this production has, which is the truest thumbnail available: what it looks
  // like now, not what it looked like on the attempt that happened to finish first.
  const still = project.runs
    .flatMap((run) => run.shots)
    .reverse()
    .find((shot) => shot.keyframeUrl)?.keyframeUrl;

  return (
    <li>
      <Link
        href={`/studio/${project.id}`}
        className="group flex h-full flex-col overflow-hidden rounded-lg border border-basalt-800 bg-basalt-900 transition-colors hover:border-basalt-700"
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-basalt-850">
          {still ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={still}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover opacity-80 transition-all duration-500 group-hover:scale-[1.03] group-hover:opacity-100"
            />
          ) : (
            <div className="flex h-full items-center justify-center font-mono text-[11px] text-bone-500">
              nothing rendered yet
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 flex items-end gap-2 bg-gradient-to-t from-basalt-950 via-basalt-950/70 to-transparent p-3 pt-10">
            <h3 className="min-w-0 flex-1 truncate font-medium text-bone-50">{project.title}</h3>
            {scored.length > 0 ? (
              <span className="shrink-0 font-mono text-sm tabular-nums text-bone-100">
                {best}
                <span className="text-bone-500">/{project.brief.targetScore}</span>
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <p className="line-clamp-2 text-[13px] leading-snug text-bone-400">{project.brief.goal}</p>

          {project.note ? (
            <p className="mt-2.5 line-clamp-3 border-l-2 border-bronze-400/40 pl-2.5 text-[12px] leading-snug text-bronze-300">
              {project.note}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {steering > 0 ? <Badge tone="knowledge">{steering} steering</Badge> : null}
            {awaiting > 0 ? <Badge tone="neutral">{awaiting} to review</Badge> : null}
            {project.seals.length > 0 ? <Badge tone="verified">sealed</Badge> : null}
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3.5 font-mono text-[11px] text-bone-500">
            <span>
              {project.runs.length} attempt{project.runs.length === 1 ? "" : "s"}
            </span>
            {moved !== undefined ? (
              <span className={moved > 0 ? "text-verdigris-400" : "text-terracotta-400"}>
                {moved > 0 ? "+" : ""}
                {moved.toFixed(moved % 1 ? 1 : 0)} from first
              </span>
            ) : null}
            <span className="ml-auto">
              <Ago at={project.updatedAt} />
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
