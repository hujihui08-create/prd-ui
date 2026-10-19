import type { Catalog, PageSpec, Profile, UiBrief } from "@prd-ui/contracts";
import type { ArchetypeDef } from "@prd-ui/design-system";
import { compilePageSpec } from "./compile-page-spec.js";

export interface CompileDeps {
  getProfile: (name: string) => Profile;
  getCatalog: (name: string) => Catalog;
  getArchetype: (id: string) => ArchetypeDef;
}

export function compileProject(brief: UiBrief, deps: CompileDeps): PageSpec[] {
  return brief.ia.pages.map((page) =>
    compilePageSpec({
      brief,
      page,
      profile: deps.getProfile(page.profile),
      catalog: deps.getCatalog(page.profile),
      archetype: deps.getArchetype(page.archetype),
    })
  );
}
