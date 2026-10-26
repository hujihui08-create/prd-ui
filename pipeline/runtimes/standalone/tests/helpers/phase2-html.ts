import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UiBriefSchema, type PageSpec } from "@prd-ui/contracts";
import { compileProject } from "@prd-ui/compiler";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import { renderDocument } from "@prd-ui/renderer-html";

export const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);

export async function renderPhase2Html(outDir: string): Promise<{
  specs: PageSpec[];
  pageNames: Record<string, string>;
  pageRoutes: Record<string, string>;
  pageArchetypes: Record<string, string>;
}> {
  const brief = UiBriefSchema.parse(
    JSON.parse(
      readFileSync(
        path.join(
          pipelineRoot,
          "samples",
          "projects",
          "employee-app-phase2",
          "ui-brief.json"
        ),
        "utf8"
      )
    )
  );
  const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });
  const pageNames: Record<string, string> = {};
  const pageRoutes: Record<string, string> = {};
  const pageArchetypes: Record<string, string> = {};
  for (const spec of specs) {
    pageNames[spec.meta.pageId] = spec.meta.name;
    pageRoutes[spec.meta.pageId] = spec.meta.route;
    pageArchetypes[spec.meta.pageId] = spec.meta.archetype;
  }
  await mkdir(outDir, { recursive: true });
  for (const spec of specs) {
    const html = renderDocument(spec, getProfile(spec.meta.profile), {
      pageNames,
      pageRoutes,
      pageArchetypes,
    });
    await writeFile(path.join(outDir, `${spec.meta.pageId}.html`), html, "utf8");
  }
  return { specs, pageNames, pageRoutes, pageArchetypes };
}
