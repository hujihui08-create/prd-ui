import type { Catalog, Profile } from "@prd-ui/contracts";
import { archetypes, type ArchetypeDef } from "./archetypes.js";
import { bDenseCatalog } from "./catalogs/b-dense.js";
import { cExpressiveCatalog } from "./catalogs/c-expressive.js";
import { bDenseProfile } from "./profiles/b-dense.js";
import { cExpressiveProfile } from "./profiles/c-expressive.js";

export { archetypes, type ArchetypeDef, type ArchetypeTarget } from "./archetypes.js";
export { bDenseCatalog, cExpressiveCatalog, bDenseProfile, cExpressiveProfile };

const profiles: Record<string, Profile> = {
  "b-dense": bDenseProfile,
  "c-expressive": cExpressiveProfile,
};

const catalogs: Record<string, Catalog> = {
  "b-dense": bDenseCatalog,
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
