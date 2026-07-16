import type {
  KnowledgeGraph,
  KnowledgeNode,
  KnowledgeSourceAsset,
  KnowledgeSourceRef,
  SourceAnchor
} from "../types";
import { knowledgeNodeKindDefinitions } from "./knowledgeNodeKinds";
import { validateKnowledgeMetadata } from "./knowledgeMetadata";
import { formatSourceLocator } from "./sourceOutline";

export type ProvenanceIssueCode =
  | "invalid_node_metadata"
  | "invalid_source_ref"
  | "evidence_without_source"
  | "fact_without_source"
  | "verified_claim_without_evidence"
  | "verified_inference_without_evidence"
  | "verified_conclusion_without_evidence"
  | "verified_decision_without_evidence";

export interface ProvenanceIssue {
  code: ProvenanceIssueCode;
  nodeId: string;
  message: string;
}

export interface ProvenanceContext {
  sources?: readonly KnowledgeSourceAsset[];
  anchors?: readonly SourceAnchor[];
}

/** Validates one durable node reference against its immutable SourceAnchor. */
export function validateKnowledgeSourceReference(
  ref: KnowledgeSourceRef,
  context: ProvenanceContext = {}
): string | undefined {
  if (Boolean(context.sources) !== Boolean(context.anchors)) {
    throw new Error("Provenance validation requires sources and anchors together");
  }
  return validateSourceRef(
    ref,
    new Map((context.sources ?? []).map((source) => [source.id, source])),
    new Map((context.anchors ?? []).map((anchor) => [anchor.id, anchor])),
    Boolean(context.sources && context.anchors)
  );
}

/** Reports whether a node reaches a verified immutable source through supports/derived_from. */
export function isKnowledgeNodeGroundedInSources(
  graph: KnowledgeGraph,
  nodeId: string,
  context: ProvenanceContext = {}
): boolean {
  if (Boolean(context.sources) !== Boolean(context.anchors)) {
    throw new Error("Provenance validation requires sources and anchors together");
  }
  if (!graph.nodes.some((node) => node.id === nodeId)) return false;
  const sourceById = new Map((context.sources ?? []).map((source) => [source.id, source]));
  const anchorById = new Map((context.anchors ?? []).map((anchor) => [anchor.id, anchor]));
  const deepValidation = Boolean(context.sources && context.anchors);
  const nodeHasValidSource = new Map(graph.nodes.map((node) => [
    node.id,
    node.sourceStatus === "verified" && node.sourceRefs.some((ref) =>
      !validateSourceRef(ref, sourceById, anchorById, deepValidation))
  ]));
  return isGrounded(nodeId, graph, nodeHasValidSource, new Set());
}

/**
 * Enforces the minimum epistemic boundary:
 * - Evidence is only evidence when at least one source locator is valid.
 * - An unverified Claim may remain source-free while it is being explored.
 * - A verified Claim needs a direct valid source or a supporting Evidence node.
 */
export function validateKnowledgeProvenance(
  graph: KnowledgeGraph,
  context: ProvenanceContext = {}
): ProvenanceIssue[] {
  if (Boolean(context.sources) !== Boolean(context.anchors)) {
    throw new Error("Provenance validation requires sources and anchors together");
  }
  const sourceById = new Map((context.sources ?? []).map((source) => [source.id, source]));
  const anchorById = new Map((context.anchors ?? []).map((anchor) => [anchor.id, anchor]));
  const deepValidation = Boolean(context.sources && context.anchors);
  const issues: ProvenanceIssue[] = [];
  const nodeHasValidSource = new Map<string, boolean>();

  for (const node of graph.nodes) {
    for (const metadataIssue of validateKnowledgeMetadata(node)) {
      issues.push({
        code: "invalid_node_metadata",
        nodeId: node.id,
        message: `[${metadataIssue.code}] ${metadataIssue.message}`
      });
    }
    let hasValidSource = false;
    for (const ref of node.sourceRefs) {
      const error = validateSourceRef(ref, sourceById, anchorById, deepValidation);
      if (error) {
        issues.push({ code: "invalid_source_ref", nodeId: node.id, message: error });
      } else {
        hasValidSource = true;
      }
    }
    nodeHasValidSource.set(node.id, hasValidSource && node.sourceStatus === "verified");
  }

  for (const node of graph.nodes) {
    const sourcePolicy = knowledgeNodeKindDefinitions[node.kind].sourcePolicy;
    if (sourcePolicy === "required" && !nodeHasValidSource.get(node.id)) {
      issues.push({
        code: node.kind === "evidence" ? "evidence_without_source" : "fact_without_source",
        nodeId: node.id,
        message: `${node.kind} node ${node.id} must reference at least one valid source locator`
      });
    }
    if (sourcePolicy === "required_when_verified" && node.status === "verified") {
      if (!isGrounded(node.id, graph, nodeHasValidSource, new Set())) {
        const code = `verified_${node.kind}_without_evidence` as ProvenanceIssueCode;
        issues.push({
          code,
          nodeId: node.id,
          message: `Verified ${node.kind} ${node.id} needs a valid direct source or grounded support chain`
        });
      }
    }
  }
  return issues;
}

const groundedSupportKinds = new Set([
  "fact",
  "evidence",
  "claim",
  "inference",
  "synthesis",
  "conclusion",
  "route_option",
  "decision"
]);

function isGrounded(
  nodeId: string,
  graph: KnowledgeGraph,
  nodeHasValidSource: Map<string, boolean>,
  visiting: Set<string>
): boolean {
  if (nodeHasValidSource.get(nodeId)) return true;
  if (visiting.has(nodeId)) return false;
  const nextVisiting = new Set(visiting).add(nodeId);
  return graph.edges.some((edge) => {
    const supportNodeId = edge.kind === "supports" && edge.toNodeId === nodeId
      ? edge.fromNodeId
      : edge.kind === "derived_from" && edge.fromNodeId === nodeId
        ? edge.toNodeId
        : undefined;
    if (!supportNodeId) return false;
    const supportNode = graph.nodes.find((candidate) => candidate.id === supportNodeId);
    if (!supportNode || !groundedSupportKinds.has(supportNode.kind)) return false;
    if (supportNode.kind === "fact" || supportNode.kind === "evidence") {
      return Boolean(nodeHasValidSource.get(supportNode.id));
    }
    if (supportNode.status !== "verified") return false;
    return isGrounded(supportNode.id, graph, nodeHasValidSource, nextVisiting);
  });
}

export function assertKnowledgeProvenance(
  graph: KnowledgeGraph,
  context: ProvenanceContext = {}
): void {
  const issues = validateKnowledgeProvenance(graph, context);
  if (issues.length === 0) return;
  throw new Error(
    `Knowledge provenance validation failed: ${issues
      .map((issue) => `[${issue.code}] ${issue.message}`)
      .join("; ")}`
  );
}

function validateSourceRef(
  ref: KnowledgeSourceRef,
  sourceById: Map<string, KnowledgeSourceAsset>,
  anchorById: Map<string, SourceAnchor>,
  deepValidation: boolean
): string | undefined {
  if (!ref.sourceId.trim()) return "Source reference is missing sourceId";
  if (!ref.anchorId?.trim()) return `Source reference for ${ref.sourceId} is missing anchorId`;
  if (!ref.locator?.trim()) return `Source reference ${ref.anchorId} is missing locator`;
  if (!deepValidation) return undefined;

  const source = sourceById.get(ref.sourceId);
  if (!source) return `Source reference ${ref.anchorId} points to unknown source ${ref.sourceId}`;
  const anchor = anchorById.get(ref.anchorId);
  if (!anchor) return `Source reference points to unknown anchor ${ref.anchorId}`;
  if (anchor.sourceId !== source.id) {
    return `Anchor ${anchor.id} belongs to ${anchor.sourceId}, not ${source.id}`;
  }
  if (!anchor.contentHash || anchor.contentHash !== source.contentHash) {
    return `Anchor ${anchor.id} does not match immutable source version ${source.id}`;
  }
  const locatorError = validateLocator(anchor, source);
  if (locatorError) return locatorError;
  if (ref.locator !== formatSourceLocator(anchor.locator)) {
    return `Source reference ${anchor.id} locator has drifted from its anchor`;
  }
  if (anchor.quote !== undefined && ref.quote !== anchor.quote) {
    return `Source reference ${anchor.id} quote has drifted from its anchor`;
  }
  return undefined;
}

function validateLocator(anchor: SourceAnchor, source: KnowledgeSourceAsset): string | undefined {
  const locator = anchor.locator;
  if (locator.kind === "text") {
    if (!Number.isInteger(locator.lineStart) || locator.lineStart < 1) {
      return `Anchor ${anchor.id} has an invalid starting line`;
    }
    if (locator.lineEnd !== undefined
      && (!Number.isInteger(locator.lineEnd) || locator.lineEnd < locator.lineStart)) {
      return `Anchor ${anchor.id} has an invalid ending line`;
    }
    if (source.format === "pdf") return `PDF source ${source.id} requires a PDF locator`;
    return undefined;
  }
  if (locator.kind === "pdf") {
    if (source.format !== "pdf") return `Non-PDF source ${source.id} cannot use a PDF locator`;
    if (!Number.isInteger(locator.page) || locator.page < 1) {
      return `Anchor ${anchor.id} has an invalid PDF page`;
    }
    if (locator.boundingBox) {
      const [xMin, yMin, xMax, yMax] = locator.boundingBox;
      if (!locator.boundingBox.every(Number.isFinite) || xMax < xMin || yMax < yMin) {
        return `Anchor ${anchor.id} has an invalid PDF bounding box`;
      }
    }
    return undefined;
  }
  try {
    new URL(locator.uri);
  } catch {
    return `Anchor ${anchor.id} has an invalid absolute URI locator`;
  }
  return undefined;
}
