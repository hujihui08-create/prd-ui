import type { Catalog, Profile } from "@prd-ui/contracts";
import { archetypes, type ArchetypeDef } from "./archetypes.js";
import { bDenseCatalog } from "./catalogs/b-dense.js";
import { bMobileCatalog } from "./catalogs/b-mobile.js";
import { cExpressiveCatalog } from "./catalogs/c-expressive.js";
import { bDenseProfile } from "./profiles/b-dense.js";
import { bMobileProfile } from "./profiles/b-mobile.js";
import { cExpressiveProfile } from "./profiles/c-expressive.js";

export { archetypes, type ArchetypeDef, type ArchetypeTarget } from "./archetypes.js";
export {
  bDenseCatalog,
  bMobileCatalog,
  cExpressiveCatalog,
  bDenseProfile,
  bMobileProfile,
  cExpressiveProfile,
};
export { isLayoutPrimitive, layoutPrimitives } from "./primitives.js";
export {
  ACTION_KEYS,
  CARD_KEYS,
  QUICK_KEYS,
  kebab,
  semanticNodeId,
  type SemanticKind,
} from "./semantic-ids.js";

const profiles: Record<string, Profile> = {
  "b-dense": bDenseProfile,
  "b-mobile": bMobileProfile,
  "c-expressive": cExpressiveProfile,
};

const catalogs: Record<string, Catalog> = {
  "b-dense": bDenseCatalog,
  "b-mobile": bMobileCatalog,
  "c-expressive": cExpressiveCatalog,
};

export function getProfile(name: string): Profile {
  const profile = profiles[name];
  if (!profile) throw new Error(`Unknown profile: ${name}`);
  return profile;
}

export function getCatalog(name: string): Catalog {
  const catalog = catalogs[name];
  if (!catalog) throw new Error(`Unknown catalog: ${name}`);
  return catalog;
}

export function getArchetype(id: string): ArchetypeDef {
  const archetype = archetypes.find((candidate) => candidate.id === id);
  if (!archetype) throw new Error(`Unknown archetype: ${id}`);
  return archetype;
}
