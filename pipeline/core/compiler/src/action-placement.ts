import type { ActionRef } from "@prd-ui/contracts";

export interface PlacementGroups {
  footer: ActionRef[];
  cardActions: ActionRef[];
  overflow: ActionRef[];
  inline: ActionRef[];
}

const MAX_CARD_ACTIONS = 3;

/**
 * Resolve action placement. Explicit values win; unplaced actions cascade:
 * first -> footer, next three -> card-actions, the rest -> overflow.
 * An explicit footer suppresses the positional footer so authors can move the
 * primary action without also marking every preceding action.
 */
export function resolveActionPlacements(actions: ActionRef[]): PlacementGroups {
  const groups: PlacementGroups = {
    footer: [],
    cardActions: [],
    overflow: [],
    inline: [],
  };
  const hasExplicitFooter = actions.some((action) => action.placement === "footer");
  let footerAssigned = false;
  let cardSlots = 0;

  for (const action of actions) {
    if (action.placement === "footer") {
      groups.footer.push(action);
      footerAssigned = true;
      continue;
    }
    if (action.placement === "card-actions") {
      groups.cardActions.push(action);
      continue;
    }
    if (action.placement === "overflow") {
      groups.overflow.push(action);
      continue;
    }
    if (action.placement === "inline") {
      groups.inline.push(action);
      continue;
    }
    if (!hasExplicitFooter && !footerAssigned) {
      groups.footer.push(action);
      footerAssigned = true;
      continue;
    }
    if (cardSlots < MAX_CARD_ACTIONS) {
      groups.cardActions.push(action);
      cardSlots += 1;
      continue;
    }
    groups.overflow.push(action);
  }

  if (groups.footer.length > 1) {
    throw new Error(
      `ACTION_PLACEMENT_CONFLICT: ${groups.footer.length} footer actions`
    );
  }
  if (groups.cardActions.length > MAX_CARD_ACTIONS) {
    throw new Error(
      `ACTION_PLACEMENT_CONFLICT: ${groups.cardActions.length} card-actions`
    );
  }
  if (actions.length > 0 && groups.footer.length === 0) {
    throw new Error("ACTION_PLACEMENT_CONFLICT: no footer action");
  }

  return groups;
}
