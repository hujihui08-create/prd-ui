import {
  AgentRoleSchema,
  ArtifactEnvelopeSchema,
  GateResultSchema,
} from "./contracts.js";
import { IaFindingsSchema, IaMapSchema, IaProposedSchema } from "./roles/ia.js";
import { InteractionSpecSchema, MotionSpecSchema } from "./roles/interaction.js";
import { VisualStyleSpecSchema } from "./roles/visual-style.js";

/**
 * Canonical M1 artifact schemas. Consumers (Spec Engineer, future tools) parse
 * the envelope and content together; the content fields are flattened onto the
 * envelope, matching the on-disk files.
 */
export const IaMapArtifactSchema = ArtifactEnvelopeSchema.extend(IaMapSchema.shape);
export const IaFindingsArtifactSchema = ArtifactEnvelopeSchema.extend(
  IaFindingsSchema.shape
);
export const IaProposedArtifactSchema = ArtifactEnvelopeSchema.extend(
  IaProposedSchema.shape
);
export const InteractionSpecArtifactSchema = ArtifactEnvelopeSchema.extend(
  InteractionSpecSchema.shape
);
export const MotionSpecArtifactSchema = ArtifactEnvelopeSchema.extend(
  MotionSpecSchema.shape
);
export const VisualStyleArtifactSchema = ArtifactEnvelopeSchema.extend(
  VisualStyleSpecSchema.shape
);
export const AgentGateArtifactSchema = ArtifactEnvelopeSchema.extend({
  role: AgentRoleSchema,
  gate: GateResultSchema,
});
