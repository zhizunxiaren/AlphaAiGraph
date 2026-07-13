export type ResearchObjectKind = "project" | "codebase" | "pdf" | "document_collection" | "topic";
export type ResearchObjectStatus = "created" | "scanning" | "mapped" | "failed";

export interface ResearchObject {
  id: string;
  kind: ResearchObjectKind;
  title: string;
  description?: string;
  rootUri?: string;
  createdAt: string;
  updatedAt: string;
  status: ResearchObjectStatus;
  metadata: Record<string, string>;
}

export type ResearchSessionStatus = "active" | "paused" | "completed" | "archived";

export interface ResearchSession {
  id: string;
  objectId: string;
  title: string;
  goal?: string;
  activeMapId: string;
  activeThreadIds: string[];
  status: ResearchSessionStatus;
  createdAt: string;
  updatedAt: string;
}

export type ResearchThreadKind =
  | "main"
  | "source_analysis"
  | "node_deep_dive"
  | "parallel_batch"
  | "validation"
  | "comparison";
export type ResearchThreadStatus = "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
export type ResearchThreadMergePolicy = "manual_review" | "auto_attach_evidence" | "auto_create_candidates";

export interface ResearchThread {
  id: string;
  sessionId: string;
  mapId: string;
  parentThreadId?: string;
  kind: ResearchThreadKind;
  title: string;
  goal?: string;
  focusNodeIds: string[];
  sourceAssetIds: string[];
  jobIds: string[];
  mergePolicy: ResearchThreadMergePolicy;
  status: ResearchThreadStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchMap {
  id: string;
  sessionId: string;
  title: string;
  rootNodeId: string;
  nodes: ResearchNode[];
  edges: ResearchEdge[];
  createdAt: string;
  updatedAt: string;
}

export type ResearchNodeKind =
  | "root"
  | "module"
  | "section"
  | "file"
  | "concept"
  | "question"
  | "hypothesis"
  | "finding"
  | "risk"
  | "action"
  | "script"
  | "result"
  | "conclusion"
  | "evidence";
export type ResearchNodeStatus = "new" | "in_progress" | "understood" | "verified" | "deferred" | "blocked";
export type ResearchExpansionState = "not_expanded" | "expanding" | "expanded" | "failed";
export type ActorKind = "agent" | "user" | "system";

export interface ResearchNode {
  id: string;
  mapId: string;
  parentId?: string;
  kind: ResearchNodeKind;
  title: string;
  summary: string;
  detail?: string;
  depth: number;
  order: number;
  expansionState: ResearchExpansionState;
  status: ResearchNodeStatus;
  markers: AgentMarker[];
  evidenceIds: string[];
  actionIds: string[];
  inquiryIds: string[];
  conceptNoteIds: string[];
  createdBy: ActorKind;
  createdAt: string;
  updatedAt: string;
  provenance?: Provenance;
}

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
  kind: AgentMarkerKind;
  label: string;
  reason: string;
  confidence: number;
  severity?: "low" | "medium" | "high";
}

export type ResearchEdgeKind =
  | "decomposes_to"
  | "depends_on"
  | "relates_to"
  | "supports"
  | "contradicts"
  | "evidence_for"
  | "next_step"
  | "validates"
  | "produces"
  | "explains";

export interface ResearchEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: ResearchEdgeKind;
  label?: string;
  confidence: number;
  createdBy: ActorKind;
  createdAt: string;
  provenance?: Provenance;
}

export type SourceAssetKind =
  | "project_directory"
  | "file"
  | "pdf"
  | "pdf_page"
  | "document"
  | "web_page"
  | "command_output";

export interface SourceAsset {
  id: string;
  objectId: string;
  parentAssetId?: string;
  kind: SourceAssetKind;
  title: string;
  uri: string;
  analysisState: "not_analyzed" | "queued" | "analyzing" | "analyzed" | "failed";
  defaultMapId?: string;
  contentHash?: string;
  metadata: Record<string, string>;
  createdAt: string;
}

export interface EvidenceAnchor {
  id: string;
  objectId: string;
  sourceAssetId: string;
  uri: string;
  title?: string;
  quote?: string;
  text?: string;
  reason: string;
  page?: number;
  lineStart?: number;
  lineEnd?: number;
  createdAt: string;
}

export type ResearchActionKind =
  | "drill_down"
  | "ask_question"
  | "inspect_source"
  | "analyze_source_asset"
  | "analyze_node_group"
  | "run_parallel_analysis"
  | "compare_sources"
  | "generate_script"
  | "run_command"
  | "summarize"
  | "mark_verified"
  | "create_side_inquiry";

export interface ResearchAction {
  id: string;
  nodeId: string;
  kind: ResearchActionKind;
  title: string;
  description: string;
  proposedCommand?: string;
  proposedScript?: string;
  status: "suggested" | "approved" | "running" | "completed" | "failed" | "dismissed";
  createdBy: ActorKind;
  createdAt: string;
  updatedAt: string;
}

export type AgentJobKind =
  | "scan_source"
  | "generate_map"
  | "expand_node"
  | "summarize_source"
  | "extract_concepts"
  | "extract_evidence"
  | "compare_sources"
  | "generate_script"
  | "run_command"
  | "create_digest";

export interface AgentJob {
  id: string;
  sessionId: string;
  threadId?: string;
  mapId?: string;
  nodeIds: string[];
  sourceAssetIds: string[];
  actionId?: string;
  kind: AgentJobKind;
  title: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  priority: "low" | "normal" | "high";
  dependsOnJobIds: string[];
  outputNodeIds: string[];
  outputEvidenceIds: string[];
  outputRunIds: string[];
  outputDigestIds: string[];
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
}

export type ParallelAnalysisMode = "fan_out" | "compare" | "validation_batch" | "evidence_sweep";

export interface ParallelAnalysisGroup {
  id: string;
  sessionId: string;
  mapId: string;
  threadId?: string;
  title: string;
  mode: ParallelAnalysisMode;
  inputNodeIds: string[];
  inputSourceAssetIds: string[];
  jobIds: string[];
  mergePolicy: ResearchThreadMergePolicy;
  status: "queued" | "running" | "ready_to_review" | "merged" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionRun {
  id: string;
  jobId?: string;
  actionId: string;
  nodeId: string;
  command?: string;
  script?: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "passed" | "failed" | "cancelled";
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  resultSummary: string;
  evidenceId?: string;
}

export type InquiryContextPolicy = "local_node" | "current_branch" | "whole_project";

export interface SideInquirySession {
  id: string;
  researchSessionId: string;
  sourceNodeId?: string;
  title: string;
  triggerText: string;
  initialQuestion: string;
  contextPolicy: InquiryContextPolicy;
  status: "open" | "resolved" | "discarded" | "promoted";
  messages: InquiryMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface InquiryMessage {
  id: string;
  inquiryId: string;
  role: "user" | "agent" | "system";
  content: string;
  createdAt: string;
}

export interface ConceptNote {
  id: string;
  objectId: string;
  sourceInquiryId?: string;
  title: string;
  summary: string;
  explanation: string;
  relatedNodeIds: string[];
  evidenceIds: string[];
  status: "draft" | "accepted" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeDigest {
  id: string;
  objectId: string;
  scope: "project" | "session" | "branch" | "node" | "inquiries";
  title: string;
  summary: string;
  conceptNoteIds: string[];
  researchNodeIds: string[];
  unresolvedQuestionIds: string[];
  createdAt: string;
}

export type RelationshipGraphNodeKind =
  | "research_object"
  | "research_node"
  | "source_asset"
  | "evidence"
  | "concept_note"
  | "execution_run"
  | "knowledge_digest";

export interface RelationshipGraphNode {
  id: string;
  sourceId: string;
  kind: RelationshipGraphNodeKind;
  title: string;
  summary?: string;
  weight?: number;
  tags: string[];
}

export interface RelationshipGraphEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relation:
    | "contains"
    | "references"
    | "supports"
    | "contradicts"
    | "explains"
    | "depends_on"
    | "derived_from"
    | "validated_by"
    | "related_to";
  confidence?: number;
}

export interface RelationshipGraph {
  id: string;
  objectId: string;
  sessionId?: string;
  generatedFromMapIds: string[];
  nodes: RelationshipGraphNode[];
  edges: RelationshipGraphEdge[];
  generatedAt: string;
}

export interface Provenance {
  groupId?: string;
  jobId?: string;
  sourceNodeId?: string;
  sourceAssetIds?: string[];
}

export interface CandidateResult {
  id: string;
  groupId: string;
  jobId: string;
  parentNodeId: string;
  node: ResearchNode;
  edge: ResearchEdge;
  status: "pending_review" | "needs_review" | "merged" | "dismissed";
  conflictReason?: string;
  createdAt: string;
}

export interface ResearchWorkspaceSnapshot {
  object: ResearchObject;
  session: ResearchSession;
  threads: ResearchThread[];
  map: ResearchMap;
  sourceAssets: SourceAsset[];
  evidenceAnchors: EvidenceAnchor[];
  actions: ResearchAction[];
  jobs: AgentJob[];
  parallelGroups: ParallelAnalysisGroup[];
  executionRuns: ExecutionRun[];
  sideInquiries: SideInquirySession[];
  conceptNotes: ConceptNote[];
  knowledgeDigests: KnowledgeDigest[];
  candidates: CandidateResult[];
}

// V2 knowledge system model. The knowledge graph is the source of truth;
// mind maps, route views and summaries are rooted views over this same graph.
export type KnowledgeSubjectKind = "technology" | "document" | "paper" | "codebase" | "question";
export type KnowledgeNodeKind =
  | "subject"
  | "topic"
  | "concept"
  | "claim"
  | "evidence"
  | "question"
  | "synthesis"
  | "goal"
  | "criterion"
  | "constraint"
  | "route_option"
  | "decision"
  | "route_step";
export type KnowledgeNodeStatus = "open" | "exploring" | "understood" | "verified" | "contested";
export type KnowledgeRelationKind =
  | "contains"
  | "explains"
  | "depends_on"
  | "supports"
  | "contradicts"
  | "answers"
  | "summarizes"
  | "compares"
  | "constrains"
  | "recommends"
  | "precedes"
  | "related_to";

export interface KnowledgeSourceRef {
  sourceId: string;
  locator?: string;
  quote?: string;
}

export interface KnowledgeNode {
  id: string;
  kind: KnowledgeNodeKind;
  title: string;
  summary: string;
  status: KnowledgeNodeStatus;
  depth: number;
  tags: string[];
  sourceRefs: KnowledgeSourceRef[];
  createdBy: ActorKind;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: KnowledgeRelationKind;
  label?: string;
  confidence: number;
  createdAt: string;
}

export interface KnowledgeGraph {
  id: string;
  title: string;
  rootNodeIds: string[];
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisSubject {
  id: string;
  kind: KnowledgeSubjectKind;
  title: string;
  description: string;
  rootNodeId: string;
  sourceAssetIds: string[];
  createdAt: string;
}

export interface KnowledgeView {
  id: string;
  kind: "mind_map" | "network" | "route";
  title: string;
  rootNodeId: string;
  focusNodeId: string;
  visibleDepth: number;
}

export interface NodeConversation {
  id: string;
  nodeId: string;
  question: string;
  answerNodeId: string;
  createdAt: string;
}

export type KnowledgeContextPolicy = "selected_node" | "selected_and_neighbors" | "whole_subject";

export interface KnowledgeSelection {
  id: string;
  focusNodeId: string;
  nodeIds: string[];
  sourceIds: string[];
  contextPolicy: KnowledgeContextPolicy;
  depth: number;
  updatedAt: string;
}

export type AgentActionKind = "drill_down" | "ask" | "summarize";
export type AgentRequestStatus = "proposed" | "accepted" | "rejected";

export interface AgentRequest {
  id: string;
  action: AgentActionKind;
  selectionId: string;
  prompt: string;
  status: AgentRequestStatus;
  createdAt: string;
}

export type GraphPatchOperation =
  | { kind: "create_node"; node: KnowledgeNode }
  | { kind: "create_edge"; edge: KnowledgeEdge }
  | { kind: "create_conversation"; conversation: NodeConversation };

export interface CandidateGraphPatch {
  id: string;
  requestId: string;
  action: AgentActionKind;
  targetNodeId: string;
  focusNodeId: string;
  title: string;
  summary: string;
  operations: GraphPatchOperation[];
  confidence: number;
  status: "pending_review" | "accepted" | "rejected";
  createdAt: string;
}

export interface KnowledgeWorkspaceSnapshot {
  subject: AnalysisSubject;
  graph: KnowledgeGraph;
  views: KnowledgeView[];
  activeViewId: string;
  selectedNodeId: string;
  selection: KnowledgeSelection;
  agentRequests: AgentRequest[];
  candidatePatches: CandidateGraphPatch[];
  conversations: NodeConversation[];
  sourceAssets: SourceAsset[];
}
