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

// V2 knowledge system model. ProjectMode captures the user's intent while
// SubjectKind captures what the project is about. They are deliberately
// independent so a document, codebase, or topic can be understood,
// systematized, or researched without changing the knowledge model.
export type ProjectMode = "understand" | "systematize" | "research";
export type SubjectKind = "technology" | "document" | "paper" | "codebase" | "industry" | "topic" | "question";
/** @deprecated Use SubjectKind. Kept only for V2 stage-0 compatibility. */
export type KnowledgeSubjectKind = SubjectKind;
export type ProjectStatus = "draft" | "active" | "completed" | "reopened" | "archived";
export type ProjectWorkflowState =
  | { mode: "understand"; phase: "setup" | "mapping" | "exploring" | "reviewing" | "completed" }
  | { mode: "systematize"; phase: "inventory" | "structuring" | "validating" | "converging" | "completed" }
  | { mode: "research"; phase: "brief" | "planning" | "researching" | "verifying" | "synthesizing" | "completed" };
export type KnowledgeNodeKind =
  | "subject"
  | "topic"
  | "concept"
  | "fact"
  | "claim"
  | "evidence"
  | "question"
  | "hypothesis"
  | "inference"
  | "synthesis"
  | "conclusion"
  | "uncertainty"
  | "skill"
  | "practice"
  | "experience"
  | "goal"
  | "criterion"
  | "constraint"
  | "route_option"
  | "decision"
  | "route_step";
export type KnowledgeNodeStatus = "open" | "exploring" | "understood" | "verified" | "contested" | "archived";
export type EpistemicStatus =
  | "user_asserted"
  | "unverified"
  | "supported"
  | "contested"
  | "contradicted"
  | "outdated"
  | "context_dependent"
  | "superseded";
export type KnowledgeScopeKind = "universal" | "project" | "context_specific";
export interface KnowledgeScope {
  kind: KnowledgeScopeKind;
  description: string;
  contextIds: string[];
}
export type TemporalValidityStatus = "unknown" | "timeless" | "current" | "time_bound" | "expired";
export interface KnowledgeTemporalValidity {
  status: TemporalValidityStatus;
  observedAt?: string;
  validFrom?: string;
  validUntil?: string;
}
export type KnowledgeSourceStatus =
  | "not_applicable"
  | "unlinked"
  | "linked"
  | "verified"
  | "stale"
  | "conflicted";
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
  | "refines"
  | "corrects"
  | "supersedes"
  | "valid_in_context"
  | "derived_from"
  | "related_to";

export type KnowledgeSourceFormat = "markdown" | "text" | "pdf";

/** What kind of existing user knowledge an immutable source represents. */
export type KnowledgeInventoryItemKind = "note" | "document" | "bookmark_index" | "experience";

export type SourceLocator =
  | { kind: "text"; lineStart: number; lineEnd?: number; section?: string }
  | { kind: "pdf"; page: number; section?: string; boundingBox?: [number, number, number, number] }
  | { kind: "uri"; uri: string; fragment?: string };

export interface SourceAnchor {
  id: string;
  sourceId: string;
  locator: SourceLocator;
  quote?: string;
  contentHash?: string;
}

export interface KnowledgeSourceAsset {
  /** Version-specific immutable id; SourceAnchor.sourceId references this id. */
  id: string;
  /** Stable identity shared by every version of the same logical source. */
  logicalSourceId: string;
  version: number;
  previousVersionId?: string;
  spaceId: string;
  /** Missing only on documents persisted before KnowledgeInventory existed. */
  inventoryKind?: KnowledgeInventoryItemKind;
  format: KnowledgeSourceFormat;
  title: string;
  uri: string;
  mediaType?: string;
  /** Present when a Research search classified the captured source. */
  researchSourceKind?: SearchSourceKind;
  contentHash: string;
  byteLength: number;
  immutable: true;
  createdAt: string;
}

export interface IngestRequest {
  id: string;
  projectId: string;
  spaceId: string;
  /** Stable logical source id; ingest creates a version-specific asset id. */
  sourceId: string;
  /** Defaults to document for backwards-compatible callers. */
  inventoryKind?: KnowledgeInventoryItemKind;
  title: string;
  uri: string;
  format: KnowledgeSourceFormat;
  mediaType?: string;
  researchSourceKind?: SearchSourceKind;
  requestedAt: string;
}

export interface ParsedSourceSection {
  id: string;
  title?: string;
  text: string;
  anchor: SourceAnchor;
}

export interface SourceParserInput {
  sourceId: string;
  title: string;
  uri: string;
  format: KnowledgeSourceFormat;
  mediaType?: string;
  content: string | Uint8Array;
}

export interface SourceParserOutput {
  parserId: string;
  sections: ParsedSourceSection[];
  warnings: string[];
  metadata: Record<string, string | number | boolean>;
}

export interface SourceParser {
  id: string;
  supportedFormats: readonly KnowledgeSourceFormat[];
  parse(input: SourceParserInput): Promise<SourceParserOutput>;
}

export interface IngestResult {
  requestId: string;
  status: "parsed" | "failed" | "unsupported";
  source?: KnowledgeSourceAsset;
  sections: ParsedSourceSection[];
  parserId?: string;
  warnings: string[];
  error?: string;
}

export type KnowledgeInventoryReviewState = "unmapped" | "pending_review" | "mapped";

/**
 * A rebuildable projection over immutable sources and their graph references.
 * It is deliberately not persisted as a second knowledge model.
 */
export interface KnowledgeInventoryItem {
  logicalSourceId: string;
  latestSourceId: string;
  kind: KnowledgeInventoryItemKind;
  title: string;
  uri: string;
  format: KnowledgeSourceFormat;
  versionCount: number;
  latestVersion: number;
  importedAt: string;
  reviewState: KnowledgeInventoryReviewState;
  linkedNodeIds: string[];
  pendingNodeIds: string[];
  anchorCount: number;
}

export interface KnowledgeInventory {
  projectId: string;
  items: KnowledgeInventoryItem[];
  counts: Record<KnowledgeInventoryItemKind, number>;
  mappedItemCount: number;
  pendingReviewItemCount: number;
  unmappedItemCount: number;
}

export interface KnowledgeSourceRef {
  sourceId: string;
  anchorId?: string;
  locator?: string;
  quote?: string;
}

export interface KnowledgeNode {
  id: string;
  kind: KnowledgeNodeKind;
  title: string;
  summary: string;
  /** Workflow/progress status; epistemicStatus separately records what is believed. */
  status: KnowledgeNodeStatus;
  epistemicStatus: EpistemicStatus;
  scope: KnowledgeScope;
  temporalValidity: KnowledgeTemporalValidity;
  sourceStatus: KnowledgeSourceStatus;
  /** Optional epistemic confidence; trustworthy Research conclusions require it. */
  confidence?: number;
  depth: number;
  tags: string[];
  sourceRefs: KnowledgeSourceRef[];
  createdBy: ActorKind;
  creatorId: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  archivedBy?: ActorKind;
  archiveReason?: string;
}

export interface KnowledgeEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: KnowledgeRelationKind;
  label?: string;
  /** Required by governance for cognitive-evolution relations. */
  rationale?: string;
  createdBy?: ActorKind;
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

export interface KnowledgeSpace {
  id: string;
  title: string;
  graphId: string;
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSubject {
  id: string;
  kind: SubjectKind;
  title: string;
  description: string;
  rootNodeId: string;
  sourceAssetIds: string[];
}

export interface Project {
  id: string;
  spaceId: string;
  graphId: string;
  mode: ProjectMode;
  title: string;
  goal: string;
  subject: ProjectSubject;
  status: ProjectStatus;
  workflow: ProjectWorkflowState;
  completionCriteria: string[];
  parentProjectId?: string;
  derivedFromNodeId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// Research orchestration coordinates work around the primary KnowledgeGraph.
// It only stores goals, execution state, and references; research knowledge
// itself must remain in KnowledgeNode/KnowledgeEdge and immutable sources.
export type ResearchBriefStatus = "draft" | "ready" | "superseded";
export type ResearchPlanStatus = "draft" | "active" | "completed" | "cancelled" | "superseded";
export type ResearchTaskKind = "parse" | "search" | "extract" | "analyze" | "challenge" | "verify" | "synthesize";
export type ResearchTaskStatus = "queued" | "in_progress" | "blocked" | "completed" | "cancelled";
export type ResearchAgentRole = "planner" | "researcher" | "analyst" | "critic" | "verifier" | "synthesizer";
export type ResearchRoundStatus = "planned" | "active" | "completed" | "cancelled";
export type ResearchRoundOutcome = "advanced" | "insufficient_evidence" | "no_material_progress";
export type SearchQueryPurpose =
  | "primary_source"
  | "supporting_evidence"
  | "counterevidence"
  | "update_check"
  | "gap_closure"
  | "alternative_explanation";
export type SearchQueryStatus = "draft" | "queued" | "running" | "completed" | "failed" | "cancelled";
export type SearchSourceKind = "primary" | "official" | "peer_reviewed" | "independent_secondary" | "community" | "other";
export type VerificationCheckKind =
  | "independent_sources"
  | "primary_source_traceability"
  | "temporal_validity"
  | "geography_consistency"
  | "unit_consistency"
  | "methodology_consistency"
  | "conflict_of_interest"
  | "support_and_opposition"
  | "inference_scope"
  | "alternative_explanation";
export type VerificationStatus = "pending" | "passed" | "failed" | "inconclusive" | "not_applicable";
export type ConflictOfInterestStatus = "none_declared" | "declared" | "unknown";

export interface ResearchTimeScope {
  from?: string;
  to?: string;
  asOf?: string;
}

export interface ResearchScope {
  description: string;
  time: ResearchTimeScope;
  geographies: string[];
  units: string[];
  inclusionCriteria: string[];
  exclusionCriteria: string[];
}

export interface ResearchBrief {
  id: string;
  projectId: string;
  primaryQuestionNodeId: string;
  secondaryQuestionNodeIds: string[];
  objective: string;
  scope: ResearchScope;
  successCriteria: string[];
  seedSourceIds: string[];
  status: ResearchBriefStatus;
  revision: number;
  createdBy: ActorKind;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchPlan {
  id: string;
  projectId: string;
  briefId: string;
  strategy: string;
  taskIds: string[];
  verificationRequirements: VerificationCheckKind[];
  maxRounds?: number;
  status: ResearchPlanStatus;
  revision: number;
  createdBy: ActorKind;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ResearchTask {
  id: string;
  projectId: string;
  planId: string;
  roundId?: string;
  kind: ResearchTaskKind;
  title: string;
  objective: string;
  role: ResearchAgentRole;
  status: ResearchTaskStatus;
  dependsOnTaskIds: string[];
  inputNodeIds: string[];
  inputSourceIds: string[];
  outputNodeIds: string[];
  outputSourceIds: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  blockedReason?: string;
}

export interface ResearchRoundOutputs {
  sourceIds: string[];
  factNodeIds: string[];
  claimNodeIds: string[];
  hypothesisNodeIds: string[];
  inferenceNodeIds: string[];
  evidenceNodeIds: string[];
  conflictNodeIds: string[];
  gapNodeIds: string[];
  synthesisNodeIds: string[];
  edgeIds: string[];
  verificationRecordIds: string[];
}

export interface ResearchRoundBaseline {
  capturedAt: string;
  graphUpdatedAt: string;
  nodeIds: string[];
  edgeIds: string[];
  sourceIds: string[];
  verificationRecordIds: string[];
}

export interface ResearchInsufficientEvidenceResult {
  kind: "insufficient_evidence";
  targetNodeIds: string[];
  blockingVerificationRecordIds: string[];
  failedCheckKinds: VerificationCheckKind[];
  inconclusiveCheckKinds: VerificationCheckKind[];
  sourceIds: string[];
  evidenceNodeIds: string[];
  opposingEvidenceNodeIds: string[];
  gapNodeIds: string[];
  summary: string;
  assessedBy: "system";
  assessedAt: string;
}

export interface ResearchReliableConclusionResult {
  kind: "reliable_conclusion";
  acceptedPatchId: string;
  verificationTargetNodeId: string;
  verificationRecordIds: string[];
  factNodeIds: string[];
  inferenceNodeIds: string[];
  synthesisNodeId: string;
  conclusionNodeId: string;
  unresolvedQuestionNodeIds: string[];
  confidence: number;
  scope: KnowledgeScope;
  acceptedAt: string;
}

export type ResearchRoundResult = ResearchInsufficientEvidenceResult | ResearchReliableConclusionResult;

export interface ResearchRound {
  id: string;
  projectId: string;
  planId: string;
  roundNumber: number;
  objective: string;
  taskIds: string[];
  status: ResearchRoundStatus;
  baseline: ResearchRoundBaseline;
  outcome?: ResearchRoundOutcome;
  result?: ResearchRoundResult;
  outputs: ResearchRoundOutputs;
  nextQuestionNodeIds: string[];
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchQueryFilters {
  domains: string[];
  languages: string[];
  sourceKinds: SearchSourceKind[];
  publishedFrom?: string;
  publishedTo?: string;
}

export interface SearchQuery {
  id: string;
  projectId: string;
  planId: string;
  taskId: string;
  roundId: string;
  query: string;
  purpose: SearchQueryPurpose;
  filters: SearchQueryFilters;
  status: SearchQueryStatus;
  resultSourceIds: string[];
  deduplicatedSourceIds: string[];
  createdAt: string;
  updatedAt: string;
  executedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface VerificationRecord {
  id: string;
  projectId: string;
  planId: string;
  roundId: string;
  taskId?: string;
  targetNodeId: string;
  checkKind: VerificationCheckKind;
  status: VerificationStatus;
  sourceIds: string[];
  evidenceNodeIds: string[];
  opposingEvidenceNodeIds: string[];
  evidenceProfiles: VerificationEvidenceProfile[];
  alternativeExplanationNodeIds: string[];
  finding?: string;
  checkedBy: ActorKind;
  checkedAt?: string;
  createdAt: string;
}

export interface VerificationEvidenceProfile {
  evidenceNodeId: string;
  geographies: string[];
  unit?: string;
  methodology?: string;
  conflictOfInterestStatus: ConflictOfInterestStatus;
  conflictOfInterestDisclosure?: string;
}

export interface ResearchOrchestration {
  briefs: ResearchBrief[];
  plans: ResearchPlan[];
  tasks: ResearchTask[];
  rounds: ResearchRound[];
  searchQueries: SearchQuery[];
  verificationRecords: VerificationRecord[];
}

/** @deprecated Use ProjectSubject through Project. */
export interface AnalysisSubject {
  id: string;
  kind: SubjectKind;
  title: string;
  description: string;
  rootNodeId: string;
  sourceAssetIds: string[];
  createdAt: string;
}

export type KnowledgeViewKind =
  | "mind_map"
  | "network"
  | "evidence"
  | "route"
  | "knowledge_modules"
  | "skill_tree"
  | "learning_dependencies"
  | "learning_path"
  | "practice_manual";

export interface KnowledgeView {
  id: string;
  kind: KnowledgeViewKind;
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

export type AgentActionKind = "drill_down" | "ask" | "summarize" | "interview" | "explore" | "correct" | "conclude" | "route" | "route_scenario" | "reuse" | "revise" | "link" | "status" | "source" | "archive";
export type AgentRequestStatus = "proposed" | "running" | "accepted" | "rejected" | "failed";

export interface AgentRequest {
  id: string;
  action: AgentActionKind;
  selectionId: string;
  prompt: string;
  status: AgentRequestStatus;
  createdAt: string;
}

export interface GraphPatchOperationAudit {
  id: string;
  rationale: string;
  actor: ActorKind;
  createdAt: string;
}

export interface KnowledgeNodeStatusSnapshot {
  status: KnowledgeNodeStatus;
  epistemicStatus: EpistemicStatus;
  temporalValidity: KnowledgeTemporalValidity;
}

export interface KnowledgeNodeSourceSnapshot {
  sourceRefs: KnowledgeSourceRef[];
  sourceStatus: KnowledgeSourceStatus;
}

export interface KnowledgeNodeArchiveSnapshot {
  status: KnowledgeNodeStatus;
  archivedAt?: string;
  archivedBy?: ActorKind;
  archiveReason?: string;
}

export type GraphPatchOperation =
  | { kind: "create_node"; node: KnowledgeNode; audit: GraphPatchOperationAudit }
  | { kind: "create_edge"; edge: KnowledgeEdge; audit: GraphPatchOperationAudit }
  | { kind: "create_conversation"; conversation: NodeConversation; audit: GraphPatchOperationAudit }
  | { kind: "revise_node"; nodeId: string; before: KnowledgeNode; after: KnowledgeNode; audit: GraphPatchOperationAudit }
  | { kind: "link_nodes"; before: KnowledgeEdge | null; after: KnowledgeEdge; audit: GraphPatchOperationAudit }
  | { kind: "update_node_status"; nodeId: string; before: KnowledgeNodeStatusSnapshot; after: KnowledgeNodeStatusSnapshot; audit: GraphPatchOperationAudit }
  | { kind: "update_node_sources"; nodeId: string; before: KnowledgeNodeSourceSnapshot; after: KnowledgeNodeSourceSnapshot; audit: GraphPatchOperationAudit }
  | { kind: "archive_node"; nodeId: string; before: KnowledgeNodeArchiveSnapshot; after: KnowledgeNodeArchiveSnapshot; audit: GraphPatchOperationAudit };

export type ImpactCategory = "judgment" | "method" | "summary" | "conclusion";

export interface ImpactPathSegment {
  edgeId: string;
  relationKind: KnowledgeRelationKind;
  fromNodeId: string;
  toNodeId: string;
}

export interface ImpactAssessmentItem {
  nodeId: string;
  title: string;
  nodeKind: KnowledgeNodeKind;
  category: ImpactCategory;
  distance: number;
  path: ImpactPathSegment[];
  reason: string;
}

export interface ImpactAssessment {
  id: string;
  patchId: string;
  targetNodeId: string;
  graphUpdatedAt: string;
  assessedAt: string;
  counts: Record<ImpactCategory, number>;
  affectedItems: ImpactAssessmentItem[];
  hasDownstreamImpact: boolean;
}

export type ImpactReviewTaskStatus = "pending_review" | "accepted" | "modified" | "rejected";
export type ImpactReviewHistoryAction =
  | "created"
  | "accepted"
  | "modification_proposed"
  | "modified"
  | "modification_rejected"
  | "rejected";

export interface ImpactReviewRevisionSnapshot {
  title: string;
  summary: string;
}

export interface ImpactReviewHistoryEntry {
  id: string;
  action: ImpactReviewHistoryAction;
  actor: ActorKind;
  at: string;
  note: string;
  patchId?: string;
  before?: ImpactReviewRevisionSnapshot;
  after?: ImpactReviewRevisionSnapshot;
}

export interface ImpactReviewTask {
  id: string;
  sourceCorrectionPatchId: string;
  impactAssessmentId: string;
  correctionTargetNodeId: string;
  correctedNodeId: string;
  nodeId: string;
  category: ImpactCategory;
  reason: string;
  impactPath: ImpactPathSegment[];
  status: ImpactReviewTaskStatus;
  createdAt: string;
  updatedAt: string;
  history: ImpactReviewHistoryEntry[];
}

export interface CandidateGraphPatch {
  id: string;
  requestId: string;
  action: AgentActionKind;
  targetNodeId: string;
  focusNodeId: string;
  title: string;
  summary: string;
  revision: number;
  createdBy: ActorKind;
  operations: GraphPatchOperation[];
  confidence: number;
  status: "pending_review" | "accepted" | "rejected";
  createdAt: string;
  impactAssessment?: ImpactAssessment;
  reviewTaskId?: string;
  reviewedBy?: ActorKind;
  reviewedAt?: string;
}

export type KnowledgeAgentSchemaVersion = "1.0";
export type GraphPatchOperationKind = GraphPatchOperation["kind"];

export interface KnowledgeAgentSourceContext {
  source: KnowledgeSourceAsset;
  anchors: SourceAnchor[];
}

export interface KnowledgeAgentOutputConstraints {
  allowedOperationKinds: GraphPatchOperationKind[];
  maxOperations: number;
  requireSourceAnchors: boolean;
}

/** Provider-neutral, serializable input. KnowledgeSelection is the visible Context Packet. */
export interface KnowledgeAgentInput {
  schemaVersion: KnowledgeAgentSchemaVersion;
  request: AgentRequest;
  project: Project;
  selection: KnowledgeSelection;
  currentNode: KnowledgeNode;
  neighborNodes: KnowledgeNode[];
  sources: KnowledgeAgentSourceContext[];
  unresolvedQuestions: KnowledgeNode[];
  constraints: KnowledgeAgentOutputConstraints;
}

/** The only accepted provider output is a reviewable CandidateGraphPatch envelope. */
export interface KnowledgeAgentOutput {
  schemaVersion: KnowledgeAgentSchemaVersion;
  requestId: string;
  patch: CandidateGraphPatch;
}

export interface KnowledgeAgentInvocationOptions {
  signal?: AbortSignal;
}

export interface AgentTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens?: number;
}

export interface KnowledgeAgentProviderMetadata {
  providerRequestId?: string;
  model?: string;
  usage?: AgentTokenUsage;
}

export interface KnowledgeAgentProviderResponse {
  output: unknown;
  metadata?: KnowledgeAgentProviderMetadata;
}

export interface KnowledgeAgentInvocationResult {
  output: KnowledgeAgentOutput;
  metadata: KnowledgeAgentProviderMetadata;
}

export interface KnowledgeAgentProvider {
  readonly id: string;
  invoke(input: KnowledgeAgentInput, options?: KnowledgeAgentInvocationOptions): Promise<KnowledgeAgentProviderResponse>;
}

export interface AgentModelPricing {
  currency: "USD";
  inputPerMillionTokens: number;
  outputPerMillionTokens: number;
  cachedInputPerMillionTokens?: number;
  source: string;
  effectiveAt: string;
}

export interface AgentCostEstimate {
  currency: "USD";
  inputCost: number;
  outputCost: number;
  cachedInputCost: number;
  totalCost: number;
  pricingSource: string;
  pricingEffectiveAt: string;
}

export type AgentRunAttemptStatus = "succeeded" | "failed" | "timed_out" | "cancelled";
export type AgentRunStatus = "succeeded" | "failed" | "timed_out" | "cancelled";

export interface AgentRunError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface AgentRunAttempt {
  attempt: number;
  status: AgentRunAttemptStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  providerRequestId?: string;
  usage?: AgentTokenUsage;
  error?: AgentRunError;
}

export interface AgentRunEvent {
  sequence: number;
  at: string;
  kind: "run_started" | "attempt_started" | "attempt_succeeded" | "attempt_failed" | "retry_scheduled" | "run_completed";
  message: string;
}

export interface AgentRun {
  id: string;
  requestId: string;
  providerId: string;
  model?: string;
  schemaVersion: KnowledgeAgentSchemaVersion;
  status: AgentRunStatus;
  maxAttempts: number;
  attemptCount: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  patchId?: string;
  usage?: AgentTokenUsage;
  cost?: AgentCostEstimate;
  error?: AgentRunError;
  attempts: AgentRunAttempt[];
  events: AgentRunEvent[];
}

export interface AgentRuntimeConfig {
  timeoutMs: number;
  maxAttempts: number;
  retryDelayMs: number;
  pricing?: AgentModelPricing;
  signal?: AbortSignal;
}

export interface KnowledgeWorkspaceSnapshot {
  space: KnowledgeSpace;
  project: Project;
  projects: Project[];
  /** @deprecated Use project.subject. This aliases the same in-memory object. */
  subject: ProjectSubject;
  graph: KnowledgeGraph;
  views: KnowledgeView[];
  activeViewId: string;
  selectedNodeId: string;
  selection: KnowledgeSelection;
  agentRequests: AgentRequest[];
  agentRuns: AgentRun[];
  candidatePatches: CandidateGraphPatch[];
  impactReviewTasks: ImpactReviewTask[];
  researchOrchestration: ResearchOrchestration;
  conversations: NodeConversation[];
  /** V2 immutable source registry; legacy sourceAssets remains migration-only. */
  knowledgeSourceAssets: KnowledgeSourceAsset[];
  sourceAnchors: SourceAnchor[];
  sourceAssets: SourceAsset[];
}

export const knowledgeWorkspaceSchemaVersion = 2 as const;
export type KnowledgeWorkspaceSchemaVersion = typeof knowledgeWorkspaceSchemaVersion;

/** Durable, provider-neutral persistence envelope for one complete knowledge space. */
export interface KnowledgeWorkspaceDocument {
  schemaVersion: KnowledgeWorkspaceSchemaVersion;
  savedAt: string;
  workspace: KnowledgeWorkspaceSnapshot;
}

/** Storage only owns opaque JSON. Migration and domain validation stay above adapters. */
export interface KnowledgeWorkspaceStore {
  save(spaceId: string, serializedDocument: string): Promise<void>;
  load(spaceId: string): Promise<string | null>;
}
