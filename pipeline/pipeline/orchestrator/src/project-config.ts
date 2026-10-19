import { readFileSync } from "node:fs";
import path from "node:path";
import { ProjectConfigSchema, type ProjectConfig } from "@prd-ui/contracts";
import { parse as parseYaml } from "yaml";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Load and validate a project YAML file. `baseDir` is the directory of the
 * project file; the orchestrator resolves `brief`, each manifest path, and
 * `runsDir` relative to it.
 */
export function loadProjectConfig(projectPath: string): {
  config: ProjectConfig;
  baseDir: string;
} {
  const absolutePath = path.resolve(projectPath);

  let document: unknown;
  try {
    document = parseYaml(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Unable to read project config at ${absolutePath}: ${errorMessage(error)}`,
      { cause: error }
    );
  }

  const parsed = ProjectConfigSchema.safeParse(document);
  if (!parsed.success) {
    throw new Error(
      `Invalid project config at ${absolutePath}: ${parsed.error.message}`,
      { cause: parsed.error }
    );
  }

  return { config: parsed.data, baseDir: path.dirname(absolutePath) };
}
