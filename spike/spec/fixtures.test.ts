import { describe, expect, it } from "vitest";
import { z } from "zod";
import bSpec from "./page-spec.b-end.json";
import cSpec from "./page-spec.c-end.json";
import bProfile from "./profile.b-dense.json";
import cProfile from "./profile.c-expressive.json";
import type { SpecNode } from "../plan/types";

// Zod v4 requires an explicit key schema for z.record.
const SpecNodeSchema: z.ZodType<SpecNode> = z.lazy(() =>
  z.object({
    type: z.string(),
    props: z.record(z.string(), z.unknown()).optional(),
    children: z.array(SpecNodeSchema).optional(),
  })
);

const PageSpecSchema = z.object({
  meta: z.object({
    pageId: z.string(),
    name: z.string(),
    target: z.enum(["web", "mobile"]),
    profile: z.string(),
    archetype: z.string(),
  }),
  layout: SpecNodeSchema,
});

const ProfileSchema = z.object({
  name: z.string(),
  color: z.record(z.string(), z.string()),
  space: z.record(z.string(), z.string()),
  radius: z.record(z.string(), z.string()),
  typography: z.record(
    z.string(),
    z.object({
      fontFamily: z.string(),
      fontSize: z.number(),
      fontWeight: z.number(),
      lineHeight: z.number(),
    })
  ),
  components: z.record(
    z.string(),
    z.object({
      variants: z.record(
        z.string(),
        z.object({ fill: z.string(), text: z.string() })
      ),
    })
  ),
});

describe("fixtures", () => {
  it("b-end spec is valid", () => {
    expect(PageSpecSchema.parse(bSpec).meta.target).toBe("web");
  });
  it("c-end spec is valid", () => {
    expect(PageSpecSchema.parse(cSpec).meta.target).toBe("mobile");
  });
  it("profiles are valid", () => {
    expect(ProfileSchema.parse(bProfile).name).toBe("b-dense");
    expect(ProfileSchema.parse(cProfile).name).toBe("c-expressive");
  });
});
