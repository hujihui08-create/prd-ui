import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PageSpecSchema, type PageSpec } from "@prd-ui/contracts";
import { getProfile } from "@prd-ui/design-system";
import { renderDocument, renderIndex } from "@prd-ui/renderer-html";

function valueOf(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const runDirArg = valueOf(args, "--run");
  if (!runDirArg) {
    console.error("Usage: pnpm render:html --run <runDir> [--out <dir>]");
    process.exitCode = 2;
    return;
  }

  const runDir = path.resolve(runDirArg);
  const outDir = path.resolve(valueOf(args, "--out") ?? path.join(process.cwd(), "out", "html"));
  const specsDir = path.join(runDir, "artifacts", "page-spec");
  const files = (await readdir(specsDir)).filter((file) => file.endsWith(".json")).sort();

  const pages: PageSpec[] = [];
  const pageNames: Record<string, string> = {};
  const pageRoutes: Record<string, string> = {};
  const pageArchetypes: Record<string, string> = {};
  await mkdir(outDir, { recursive: true });

  for (const file of files) {
    const raw = JSON.parse(await readFile(path.join(specsDir, file), "utf8")) as unknown;
    const spec = PageSpecSchema.parse(raw) as PageSpec;
    pageNames[spec.meta.pageId] = spec.meta.name;
    pageRoutes[spec.meta.pageId] = spec.meta.route;
    pageArchetypes[spec.meta.pageId] = spec.meta.archetype;
  }

  for (const file of files) {
    const raw = JSON.parse(await readFile(path.join(specsDir, file), "utf8")) as unknown;
    const spec = PageSpecSchema.parse(raw) as PageSpec;
    const profile = getProfile(spec.meta.profile);
    await writeFile(
      path.join(outDir, `${spec.meta.pageId}.html`),
      renderDocument(spec, profile, { pageNames, pageRoutes, pageArchetypes }),
      "utf8"
    );
    pages.push(spec);
    console.log(`rendered ${spec.meta.pageId} -> ${path.join(outDir, `${spec.meta.pageId}.html`)}`);
  }

  await writeFile(path.join(outDir, "index.html"), renderIndex(pages), "utf8");
  console.log(`rendered ${pages.length} page(s) -> ${path.join(outDir, "index.html")}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
