import { SiteNav } from "./SiteNav";
import { resolveDkgMode } from "@/dkg/client";
import { isReadOnly } from "@/core/deploy";

/**
 * The header, resolved on the server.
 *
 * The one fact it carries that a reader most needs and is least able to check is which knowledge
 * store this instance is actually running against, and that has to come from resolved configuration
 * rather than from anything the client could guess. Everything else about the bar — active section,
 * scroll state, the mobile panel — is interaction, so it lives in `SiteNav`.
 *
 * `overHero` is for pages whose first element is footage: the bar starts transparent and takes its
 * background once the page has moved.
 */
export function SiteHeader({
  children,
  overHero = false,
}: {
  children?: React.ReactNode;
  overHero?: boolean;
}) {
  return (
    <>
      <SiteNav mode={resolveDkgMode()} hosted={isReadOnly()} overHero={overHero} />
      {children}
    </>
  );
}
