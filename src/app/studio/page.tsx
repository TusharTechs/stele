import Link from "next/link";
import { listProjects } from "@/core/store";
import { SiteHeader } from "@/components/SiteHeader";
import { Ago, Badge, Card, Empty, SectionTitle } from "@/components/ui";
import { NewProjectForm } from "./NewProjectForm";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const projects = await listProjects();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
          <section>
            <SectionTitle hint={`${projects.length} project${projects.length === 1 ? "" : "s"}`}>
              Productions
            </SectionTitle>

            {projects.length === 0 ? (
              <Empty>
                Nothing yet. Write a brief on the right. Stele decomposes it into a canon before
                it renders anything.
              </Empty>
            ) : (
              <ul className="grid gap-3">
                {projects.map((project) => {
                  const scored = project.runs.filter((run) => run.review);
                  const best = scored.reduce((max, run) => Math.max(max, run.review!.score), 0);
                  const first = scored[0]?.review?.score;
                  const active = project.lessons.filter(
                    (l) => l.status === "accepted" || l.status === "pinned"
                  ).length;

                  return (
                    <Card as="li" key={project.id} className="transition-colors hover:border-basalt-700">
                      <Link href={`/studio/${project.id}`} className="block p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate font-medium text-bone-50">{project.title}</h3>
                            <p className="mt-1 line-clamp-2 text-sm text-bone-400">{project.brief.goal}</p>
                            {project.note ? (
                              <p className="mt-2 border-l-2 border-bronze-400/40 pl-2.5 text-[13px] leading-snug text-bronze-300">
                                {project.note}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {project.seals.length > 0 ? <Badge tone="verified">sealed</Badge> : null}
                            {active > 0 ? <Badge tone="knowledge">{active} in canon</Badge> : null}
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-bone-500">
                          <span>
                            {project.runs.length} attempt{project.runs.length === 1 ? "" : "s"}
                          </span>
                          {scored.length > 0 ? (
                            <span>
                              best {best}/10
                              {/* The delta is the headline claim; show it only once there are two
                                  scored attempts to compare, and only when it actually moved. */}
                              {scored.length > 1 && first !== undefined && best !== first ? (
                                <span className={best > first ? " text-verdigris-400" : " text-terracotta-400"}>
                                  {" "}
                                  ({best > first ? "+" : ""}
                                  {(best - first).toFixed(best % 1 || first % 1 ? 1 : 0)} from first)
                                </span>
                              ) : null}
                            </span>
                          ) : null}
                          <span className="ml-auto">
                            <Ago at={project.updatedAt} />
                          </span>
                        </div>
                      </Link>
                    </Card>
                  );
                })}
              </ul>
            )}
          </section>

          <aside>
            <SectionTitle>New production</SectionTitle>
            <NewProjectForm
              canons={projects
                .filter((p) => p.constraints.length > 0)
                .map((p) => ({
                  id: p.id,
                  title: p.title,
                  rules: p.lessons.filter((l) => l.status === "accepted" || l.status === "pinned").length,
                  constraints: p.constraints.length,
                }))}
            />
          </aside>
        </div>
      </main>
    </>
  );
}
