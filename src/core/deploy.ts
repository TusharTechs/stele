/**
 * Whether this instance can change anything.
 *
 * The hosted demo runs on a serverless platform with a read-only filesystem, no DKG node reachable
 * on localhost, and a function timeout measured in minutes against renders that take longer. Every
 * page that only reads works there perfectly; everything that writes cannot work at all.
 *
 * The failure mode worth avoiding is the dishonest one: a "Run next attempt" button that looks live,
 * is pressed by someone evaluating this, and dies on a filesystem error with no explanation. So the
 * instance knows what it is, the controls say so before they are pressed, and the API refuses with
 * a reason rather than a stack trace.
 *
 * Detected rather than declared, because the one deploy where somebody forgets to set the flag is
 * exactly the deploy that gets looked at. `STELE_READ_ONLY` overrides in either direction for
 * anyone running the container somewhere writable.
 */
export function isReadOnly(): boolean {
  const flag = process.env.STELE_READ_ONLY;
  if (flag !== undefined && flag !== "") {
    return flag !== "0" && flag.toLowerCase() !== "false";
  }
  return Boolean(process.env.VERCEL);
}

/** Said the same way in the interface and in the API, so the two never drift apart. */
export const READ_ONLY_REASON =
  "This is the hosted demo, which can read the record but not add to it. Renders take minutes and write to disk, neither of which a serverless host allows. Clone the repo and run it locally to produce a film.";

export function readOnlyResponse(): Response {
  // 503 rather than 403: nothing is wrong with the request, this deployment just cannot serve it.
  return Response.json({ error: READ_ONLY_REASON, readOnly: true }, { status: 503 });
}
