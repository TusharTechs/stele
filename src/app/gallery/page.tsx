import { buildGallery } from "@/core/library";
import { SiteHeader } from "@/components/SiteHeader";
import { Empty } from "@/components/ui";
import { GalleryGrid } from "./GalleryGrid";

export const dynamic = "force-dynamic";

/**
 * Everything this studio has made.
 *
 * Ordered by attempt rather than grouped by production, so it reads as a body of work. Each frame
 * carries what the machine knew when it made it, which is the only reason a gallery belongs in this
 * particular product rather than being decoration.
 */
export default async function GalleryPage() {
  const items = await buildGallery();

  const cuts = items.filter((i) => i.kind === "cut" || i.kind === "stamped").length;
  const shots = items.filter((i) => i.kind === "shot").length;
  const frames = items.filter((i) => i.kind === "keyframe").length;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-bone-500">Gallery</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-bone-50">
          Everything this studio has made
        </h1>
        <p className="mt-3 max-w-2xl text-bone-400">
          Every cut, shot and keyframe, newest first. Each one says what the render that produced it
          knew at the time.
        </p>

        <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-3 font-mono text-[11px]">
          <Stat label="cuts" value={cuts} />
          <Stat label="shots" value={shots} />
          <Stat label="keyframes" value={frames} />
        </dl>

        <div className="mt-8">
          {items.length === 0 ? (
            <Empty>Nothing rendered yet.</Empty>
          ) : (
            <GalleryGrid items={items} />
          )}
        </div>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="uppercase tracking-wider text-bone-500">{label}</dt>
      <dd className="mt-1 text-xl tabular-nums text-bone-200">{value}</dd>
    </div>
  );
}
