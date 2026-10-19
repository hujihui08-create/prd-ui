import type { Finding, PageSpec, SpecNode } from "@prd-ui/contracts";
import {
  finalizeFindings,
  walkSpecNodes,
  type FindingDraft,
  type ValidationContext,
} from "./types.js";

interface AssetReference {
  ref: string;
  path: string;
}

/** node.assetRef plus any `assetRef` key nested in props. */
function collectAssetRefs(node: SpecNode): AssetReference[] {
  const refs: AssetReference[] = [];
  if (typeof node.assetRef === "string") {
    refs.push({ ref: node.assetRef, path: "assetRef" });
  }

  const scan = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => scan(item, `${path}[${index}]`));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      if (key === "assetRef" && typeof nested === "string") {
        refs.push({ ref: nested, path: `${path}.${key}` });
      } else {
        scan(nested, `${path}.${key}`);
      }
    }
  };
  scan(node.props ?? {}, "props");

  return refs;
}

/**
 * Asset-manifest checks.
 *
 * - `ASSET-PROFILE`: the manifest belongs to a different design profile.
 * - `ASSET-PROJECT`: the manifest belongs to a different project.
 * - `ASSET-MISSING`: a referenced asset id is not in the manifest.
 * - `ASSET-PLACEHOLDER`: placeholders remain (final-gate blocker).
 * - `ASSET-INCOMPLETE`: manifest is explicitly incomplete.
 * - `ASSET-ICON-SVG`: an icon asset has no `.svg` file.
 */
export function validateAsset(spec: PageSpec, ctx: ValidationContext): Finding[] {
  const drafts: FindingDraft[] = [];
  const manifest = ctx.manifest;

  const push = (
    ruleId: string,
    location: string,
    evidence: string,
    issue: string,
    severity: FindingDraft["severity"] = "blocker"
  ): void => {
    drafts.push({
      ruleId,
      severity,
      category: "asset",
      location,
      evidence,
      issue,
    });
  };

  const manifestIds = new Set(manifest.assets.map((asset) => asset.id));

  if (manifest.profile !== ctx.profile.meta.name) {
    push(
      "ASSET-PROFILE",
      "manifest.profile",
      manifest.profile,
      `Asset manifest profile "${manifest.profile}" does not match page profile "${ctx.profile.meta.name}".`
    );
  }

  if (manifest.project !== spec.meta.project) {
    push(
      "ASSET-PROJECT",
      "manifest.project",
      manifest.project,
      `Asset manifest project "${manifest.project}" does not match page project "${spec.meta.project}".`
    );
  }

  for (const { node, path } of walkSpecNodes(spec.layout)) {
    const seen = new Set<string>();
    for (const reference of collectAssetRefs(node)) {
      const key = `${reference.path}:${reference.ref}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!manifestIds.has(reference.ref)) {
        push(
          "ASSET-MISSING",
          `${path}.${reference.path}`,
          reference.ref,
          `Asset "${reference.ref}" is not present in the asset manifest.`
        );
      }
    }
  }

  for (const placeholder of manifest.placeholders) {
    push(
      "ASSET-PLACEHOLDER",
      "manifest.placeholders",
      placeholder,
      `Placeholder asset "${placeholder}" remains in the asset manifest; final delivery requires real assets.`
    );
  }

  if (manifest.complete === false) {
    push(
      "ASSET-INCOMPLETE",
      "manifest.complete",
      "false",
      "Asset manifest is marked incomplete.",
      "major"
    );
  }

  for (const asset of manifest.assets) {
    if (asset.kind !== "icon") continue;
    const hasSvg = asset.files.some(
      (file) => typeof file.path === "string" && file.path.toLowerCase().endsWith(".svg")
    );
    if (!hasSvg) {
      push(
        "ASSET-ICON-SVG",
        `manifest.assets.${asset.id}`,
        asset.files.map((file) => file.path).join(", ") || "(no files)",
        `Icon asset "${asset.id}" has no .svg file.`,
        "major"
      );
    }
  }

  return finalizeFindings(drafts);
}
