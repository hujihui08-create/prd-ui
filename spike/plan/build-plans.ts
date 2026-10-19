import { writeFileSync } from "node:fs";
import bSpec from "../spec/page-spec.b-end.json";
import cSpec from "../spec/page-spec.c-end.json";
import bProfile from "../spec/profile.b-dense.json";
import cProfile from "../spec/profile.c-expressive.json";
import { compilePlan } from "./compile-plan";
import type { PageSpec, Profile } from "./types";

writeFileSync(
  "spec/figma-plan.b-end.json",
  JSON.stringify(
    compilePlan(bSpec as PageSpec, bProfile as Profile),
    null,
    2
  )
);
writeFileSync(
  "spec/figma-plan.c-end.json",
  JSON.stringify(
    compilePlan(cSpec as PageSpec, cProfile as Profile),
    null,
    2
  )
);

console.log("Wrote spec/figma-plan.b-end.json and spec/figma-plan.c-end.json");
