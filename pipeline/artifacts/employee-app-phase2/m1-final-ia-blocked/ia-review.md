---
schemaVersion: "1.0"
project: "employee-app-phase2"
generatedAt: "2026-10-22T02:57:01.016Z"
model: "deepseek-flash"
promptHash: "sha256:68f760efa83f3e1d8235e6c71d0e28a1a066a0db7d1d8413062a4f4969dd7e96"
---

# IA Review — employee-app-phase2

**Verdict:** not ready to sign off. All 8 brief pages appear exactly once, `landingByRole` resolves to `today`, and no page is orphaned. The problems are mode/flow contracts, not page count.

**Blocker (1)**
- `appointment-form` only models `new` (unlocked) and `reschedule`; the PRD also needs a locked-customer new appointment from customer detail and `customer-search` in `picker` mode. Without this, list/calendar new and customer-detail new cannot both behave correctly.

**Major (7)**
- Appointment detail's customer-detail link is only modeled under 已到店, though PRD makes it status-independent.
- Customer detail's `查看预约` can only target the latest service record; multi-appointment customers have no route to other appointments.
- `today` has no tab anchor, so the declared home page and the 预约 tab lack a clear return relationship.
- Flows omit `today → appointment-form → today` and `customer-detail → callback-register → customer-detail`.
- Callback service provenance is undefined: `本单主服务项目` has no appointment context and no stable prefill contract.
- `treatment-notice` lacks the `暂无告知内容` content-empty state where confirm must be hidden.
- The all-role page lists do not encode feature-point gates or beautician customer scope, so hidden vs disabled permissions cannot be derived.

**Minor (1)**
- `:id` is reused for customer and appointment entities on nested notice routes; use `:customerId`/`:appointmentId` or document the mapping.

**Decisions still needed**
1. Confirm `today` is the 工作台 tab landing (recommended) versus a non-tab home.
2. Confirm `查看预约` means latest service record only, or define a customer appointment list outside this slice.
3. Confirm whether callbacks bind to an appointment and where `服务项目` comes from (Q-004).
4. Confirm `暂无告知内容` is an `empty` page state (Q-002).
5. Approve the third form variant (`new-from-customer`, locked customer, CTA 保存) and picker mode.

Q-003 is resolved: the calendar drawer is not a page; list rows go straight to detail. Q-005 and Q-007 are data/interaction decisions, not IA blockers.