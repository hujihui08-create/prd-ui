import { describe, expect, it } from "vitest";
import { UiBriefSchema } from "@prd-ui/contracts";
import { compileProject } from "@prd-ui/compiler";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import briefJson from "../../../samples/projects/employee-app/ui-brief.json";
import { renderDocument } from "../src/index.js";

const brief = UiBriefSchema.parse(briefJson);
const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });
const byId = new Map(specs.map((spec) => [spec.meta.pageId, spec]));

describe("employee-app HTML renderer", () => {
  it("renders the today page with content and empty-state copy", () => {
    const spec = byId.get("today");
    expect(spec).toBeDefined();
    const html = renderDocument(spec!, getProfile("b-mobile"));

    expect(html).toContain("星光店");
    expect(html).toContain("快捷操作");
    expect(html).toContain("张女士");
    expect(html).toContain("小气泡");
    expect(html).toContain("待到店");
    expect(html).toContain("今天没有预约");
    expect(html).toContain("当场开单");
    expect(html).toContain('data-state="default"');
  });

  it("renders the inventory page with product cards and empty-state action", () => {
    const spec = byId.get("inventory-query");
    expect(spec).toBeDefined();
    const html = renderDocument(spec!, getProfile("b-mobile"));

    expect(html).toContain("库存查询");
    expect(html).toContain("搜索产品名称 / 规格");
    expect(html).toContain("医用面膜");
    expect(html).toContain("当前库存");
    expect(html).toContain("可用库存");
    expect(html).toContain("低库存");
    expect(html).toContain("没有匹配的产品");
    expect(html).toContain("清空筛选");
  });
});
