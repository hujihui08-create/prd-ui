import { z } from "zod";

/**
 * Page ids double as artifact filenames (`artifacts/page-spec/<pageId>.json`),
 * so they are restricted to a path-safe, lowercase kebab-case form.
 */
export const PAGE_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export const PageIdSchema = z
  .string()
  .regex(PAGE_ID_PATTERN, "page id must match ^[a-z][a-z0-9-]*$");

export type PageId = z.infer<typeof PageIdSchema>;
