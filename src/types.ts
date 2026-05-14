export type IsoDateTime = string;

export type ResearchObjectKind = "project" | "repository" | "pdf" | "document_set" | "technical_plan" | "knowledge_question";
export type ResearchObjectStatus = "new" | "scanning" | "ready" | "archived";

export interface ResearchObject {
  id: string;
  kind: ResearchObjectKind;
  title: string;
  status: ResearchObjectStatus;
  sourceAssetIds: string[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type ResearchSessionStatus = "active" | "paused" | "completed" | "archived";

export interface ResearchSession {
  id: string;
  objectId: string;
  title: string;
  status: ResearchSessionStatus;
  activeThreadId: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type ResearchThreadKind = "main" | "branch" | "parallel";
export type ResearchThreadStatus = "queued" | "active" | "blocked" | "completed" | "cancelled";

export interface ResearchThread {
  id: string;
  sessionId: string;
  title: string;
  kind: ResearchThreadKind;
  status: ResearchThreadStatus;
  mapId: string;
  parentThreadId?: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ResearchMap {
  id: string;
  sessionId: string;
  threadId: string;
  rootNodeId: string;
  nodes: ResearchNode[];
  edges: ResearchEdge[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type ResearchNodeKind =
  | "root"
  | "module"
  | "section"
  | "concept"
  | "question"
  | "hypothesis"
  | "finding"
  | "action"
  | "script"
  | "result"
  | "conclusion"
  | "evidence";

export type ResearchNodeStatus = "open" | "active" | "under_review" | "verified" | "deferred" | "closed";
export type ResearchExpansionState = "collapsed" | "expanded" | "leaf";

export interface ResearchNode {
  id: string;
  mapId: string;
  parentNodeId?: string;
  kind: ResearchNodeKind;
  title: string;
  summary: string;
  depth: number;
  status: ResearchNodeStatus;
  expansionState: ResearchExpansionState;
  markerIds: string[];
  evidenceIds: string[];
  actionIds: string[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  provenance?: Provenance;
}

export type ResearchEdgeKind = "contains" | "depends_on" | "supports" | "challenges" | "validates" | "leads_to";

export interface ResearchEdge {
  id: string;
  mapId: string;
  fromNodeId: string;
  toNodeId: string;
  kind: ResearchEdgeKind;
  confidence: number;
  createdAt: IsoDateTime;
  provenance?: Provenance;
}

/**
 * Agent markers are guidance signals, not executable work items.
 * `recommended_drilldown` and `needs_validation` explain why an action is suggested;
 * the clickable or queueable next step must still be represented as `ResearchAction`.
 * `core_entry` means the node is an agent-identified entry point for understanding
 * the current object/session, not a separate entry-point list membership.
 */
export type AgentMarkerKind =
  | "focus"
  | "difficulty"
  | "risk"
  | "recommended_drilldown"
  | "needs_validation"
  | "low_priority"
  | "uncertain"
  | "core_entry";

export interface AgentMarker {
  id: string;
  nodeId: string;
  kind: AgentMarkerKind;
  label: string;
  rationale: string;
  confidence: number;
}

export type SourceAssetKind = "file" | "pdf" | "document" | "web_page" | "command_output" | "repository";

export interface SourceAsset {
  id: string;
  kind: SourceAssetKind;
  title: string;
  path: string;
  summary: string;
  createdAt: IsoDateTime;
}

export interface EvidenceAnchor {
  id: string;
  sourceAssetId: string;
  title: string;
  quote: string;
  locator: {
    kind: "file" | "page" | "line" | "section" | "command";
    path?: string;
    page?: number;
    lineStart?: number;
    lineEnd?: number;
    section?: string;
  };
  createdAt: IsoDateTime;
}

export type ResearchActionKind =
  | "drill_down"
  | "inspect_source"
  | "create_side_inquiry"
  | "run_validation"
  | "study"
  | "synthesis"
  | "export";

export interface ResearchAction {
  id: string;
  nodeId: string;
  kind: ResearchActionKind;
  title: string;
  description: string;
  createdAt: IsoDateTime;
}

export type AgentJobKind = "source_scan" | "map_generation" | "parallel_extraction" | "validation" | "side_inquiry";
export type AgentJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface AgentJob {
  id: string;
  kind: AgentJobKind;
  status: AgentJobStatus;
  title: string;
  nodeIds: string[];
  sourceAssetIds: string[];
  outputIds: string[];
  groupId?: string;
  previousJobId?: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type ParallelAnalysisMode = "fan_out" | "compare" | "sweep";
export type CandidateStatus = "pending_review" | "needs_review" | "merged" | "dismissed";

export interface ParallelAnalysisGroup {
  id: string;
  mode: ParallelAnalysisMode;
  mergePolicy: "manual_review";
  status: "queued" | "running" | "completed" | "partially_failed" | "cancelled";
  nodeIds: string[];
  jobIds: string[];
  candidateNodeIds: string[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CandidateResearchNode {
  id: string;
  groupId: string;
  jobId: string;
  node: ResearchNode;
  status: CandidateStatus;
  conflictReason?: string;
}

export interface ExecutionRun {
  id: string;
  nodeId: string;
  actionId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  command: string;
  output: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type InquiryContextPolicy = "local_node" | "current_branch" | "whole_project";

export interface SideInquirySession {
  id: string;
  nodeId: string;
  status: "open" | "resolved" | "discarded" | "promoted";
  contextPolicy: InquiryContextPolicy;
  question: string;
  messageIds: string[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface InquiryMessage {
  id: string;
  inquiryId: string;
  role: "user" | "agent";
  content: string;
  createdAt: IsoDateTime;
}

export interface ConceptNote {
  id: string;
  title: string;
  body: string;
  sourceInquiryId?: string;
  relatedNodeIds: string[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface KnowledgeDigest {
  id: string;
  title: string;
  summary: string;
  includedNodeIds: string[];
  includedNoteIds: string[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type RelationshipGraphNodeKind =
  | "research_object"
  | "research_node"
  | "evidence"
  | "execution_run"
  | "concept_note"
  | "knowledge_digest";

export interface RelationshipGraphNode {
  id: string;
  kind: RelationshipGraphNodeKind;
  sourceId: string;
  title: string;
  summary?: string;
  tags: string[];
}

export interface RelationshipGraphEdge {
  id: string;
  sourceId: string;
  fromNodeId: string;
  toNodeId: string;
  relation:
    | "contains"
    | "research_flow"
    | "depends_on"
    | "supports"
    | "challenges"
    | "validates"
    | "leads_to"
    | "references"
    | "validated_by"
    | "explains"
    | "derived_from";
  confidence?: number;
}

export interface RelationshipGraph {
  id: string;
  sourceObjectId: string;
  generatedAt: IsoDateTime;
  nodes: RelationshipGraphNode[];
  edges: RelationshipGraphEdge[];
}

export interface Provenance {
  groupId?: string;
  jobId?: string;
  candidateId?: string;
  sourceNodeIds?: string[];
}

export interface ResearchWorkspace {
  object: ResearchObject;
  session: ResearchSession;
  thread: ResearchThread;
  map: ResearchMap;
  sourceAssets: SourceAsset[];
  markers: AgentMarker[];
  evidenceAnchors: EvidenceAnchor[];
  actions: ResearchAction[];
  jobs: AgentJob[];
  parallelGroups: ParallelAnalysisGroup[];
  candidateNodes: CandidateResearchNode[];
  executionRuns: ExecutionRun[];
  sideInquiries: SideInquirySession[];
  inquiryMessages: InquiryMessage[];
  conceptNotes: ConceptNote[];
  knowledgeDigests: KnowledgeDigest[];
}

export interface KnowledgeAppState {
  researchObject: ResearchObject;
  researchSession: ResearchSession;
  researchThread: ResearchThread;
  researchMap: ResearchMap;
  sourceAssets: SourceAsset[];
  markers: AgentMarker[];
  evidenceAnchors: EvidenceAnchor[];
  actions: ResearchAction[];
  jobs: AgentJob[];
  parallelGroups: ParallelAnalysisGroup[];
  candidateNodes: CandidateResearchNode[];
  executionRuns: ExecutionRun[];
  sideInquiries: SideInquirySession[];
  inquiryMessages: InquiryMessage[];
  conceptNotes: ConceptNote[];
  knowledgeDigests: KnowledgeDigest[];
  selectedNodeId?: string;
  canvasMode: "research_map" | "relationship_graph";
  warnings: string[];
}
