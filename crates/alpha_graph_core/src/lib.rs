use std::collections::HashMap;

use serde::{Deserialize, Serialize};

pub const KNOWLEDGE_AGENT_SCHEMA_VERSION: &str = "1.0";
pub const KNOWLEDGE_WORKSPACE_SCHEMA_VERSION: u32 = 2;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchObjectKind {
    Project,
    Codebase,
    Pdf,
    DocumentCollection,
    Topic,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchObjectStatus {
    Created,
    Scanning,
    Mapped,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchSessionStatus {
    Active,
    Paused,
    Completed,
    Archived,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchThreadKind {
    Main,
    SourceAnalysis,
    NodeDeepDive,
    ParallelBatch,
    Validation,
    Comparison,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchThreadStatus {
    Queued,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchThreadMergePolicy {
    ManualReview,
    AutoAttachEvidence,
    AutoCreateCandidates,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchNodeKind {
    Root,
    Module,
    Section,
    File,
    Concept,
    Question,
    Hypothesis,
    Finding,
    Risk,
    Action,
    Script,
    Result,
    Conclusion,
    Evidence,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchNodeStatus {
    New,
    InProgress,
    Understood,
    Verified,
    Deferred,
    Blocked,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchExpansionState {
    NotExpanded,
    Expanding,
    Expanded,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActorKind {
    Agent,
    User,
    System,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentMarkerKind {
    Focus,
    Difficulty,
    Risk,
    RecommendedDrilldown,
    NeedsValidation,
    LowPriority,
    Uncertain,
    CoreEntry,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentMarkerSeverity {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchEdgeKind {
    DecomposesTo,
    DependsOn,
    RelatesTo,
    Supports,
    Contradicts,
    EvidenceFor,
    NextStep,
    Validates,
    Produces,
    Explains,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Provenance {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub job_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_node_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_asset_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMarker {
    pub id: String,
    pub kind: AgentMarkerKind,
    pub label: String,
    pub reason: String,
    pub confidence: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub severity: Option<AgentMarkerSeverity>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchObject {
    pub id: String,
    pub kind: ResearchObjectKind,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub root_uri: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub status: ResearchObjectStatus,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSession {
    pub id: String,
    pub object_id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub goal: Option<String>,
    pub active_map_id: String,
    pub active_thread_ids: Vec<String>,
    pub status: ResearchSessionStatus,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchThread {
    pub id: String,
    pub session_id: String,
    pub map_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_thread_id: Option<String>,
    pub kind: ResearchThreadKind,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub goal: Option<String>,
    pub focus_node_ids: Vec<String>,
    pub source_asset_ids: Vec<String>,
    pub job_ids: Vec<String>,
    pub merge_policy: ResearchThreadMergePolicy,
    pub status: ResearchThreadStatus,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchNode {
    pub id: String,
    pub map_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    pub kind: ResearchNodeKind,
    pub title: String,
    pub summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    pub depth: u32,
    pub order: f64,
    pub expansion_state: ResearchExpansionState,
    pub status: ResearchNodeStatus,
    pub markers: Vec<AgentMarker>,
    pub evidence_ids: Vec<String>,
    pub action_ids: Vec<String>,
    pub inquiry_ids: Vec<String>,
    pub concept_note_ids: Vec<String>,
    pub created_by: ActorKind,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provenance: Option<Provenance>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchEdge {
    pub id: String,
    pub from_node_id: String,
    pub to_node_id: String,
    pub kind: ResearchEdgeKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub confidence: f32,
    pub created_by: ActorKind,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provenance: Option<Provenance>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchMap {
    pub id: String,
    pub session_id: String,
    pub title: String,
    pub root_node_id: String,
    pub nodes: Vec<ResearchNode>,
    pub edges: Vec<ResearchEdge>,
    pub created_at: String,
    pub updated_at: String,
}

// V2: ProjectMode captures user intent, while SubjectKind captures the object
// being understood, systematized, or researched. All projects reference the
// same durable knowledge graph instead of owning copies of knowledge data.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectMode {
    Understand,
    Systematize,
    Research,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubjectKind {
    Technology,
    Document,
    Paper,
    Codebase,
    Industry,
    Topic,
    Question,
}

#[deprecated(note = "use SubjectKind")]
pub type KnowledgeSubjectKind = SubjectKind;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectStatus {
    Draft,
    Active,
    Completed,
    Reopened,
    Archived,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UnderstandProjectPhase {
    Setup,
    Mapping,
    Exploring,
    Reviewing,
    Completed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SystematizeProjectPhase {
    Inventory,
    Structuring,
    Validating,
    Converging,
    Completed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchProjectPhase {
    Brief,
    Planning,
    Researching,
    Verifying,
    Synthesizing,
    Completed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "snake_case")]
pub enum ProjectWorkflowState {
    Understand { phase: UnderstandProjectPhase },
    Systematize { phase: SystematizeProjectPhase },
    Research { phase: ResearchProjectPhase },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSpace {
    pub id: String,
    pub title: String,
    pub graph_id: String,
    pub project_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSubject {
    pub id: String,
    pub kind: SubjectKind,
    pub title: String,
    pub description: String,
    pub root_node_id: String,
    pub source_asset_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub space_id: String,
    pub graph_id: String,
    pub mode: ProjectMode,
    pub title: String,
    pub goal: String,
    pub subject: ProjectSubject,
    pub status: ProjectStatus,
    pub workflow: ProjectWorkflowState,
    pub completion_criteria: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub derived_from_node_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeSourceFormat {
    Markdown,
    Text,
    Pdf,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeInventoryItemKind {
    Note,
    #[default]
    Document,
    BookmarkIndex,
    Experience,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum SourceLocator {
    Text {
        line_start: u32,
        #[serde(skip_serializing_if = "Option::is_none")]
        line_end: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        section: Option<String>,
    },
    Pdf {
        page: u32,
        #[serde(skip_serializing_if = "Option::is_none")]
        section: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        bounding_box: Option<[f64; 4]>,
    },
    Uri {
        uri: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        fragment: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceAnchor {
    pub id: String,
    pub source_id: String,
    pub locator: SourceLocator,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quote: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_hash: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSourceAsset {
    pub id: String,
    pub logical_source_id: String,
    pub version: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_version_id: Option<String>,
    pub space_id: String,
    #[serde(default)]
    pub inventory_kind: KnowledgeInventoryItemKind,
    pub format: KnowledgeSourceFormat,
    pub title: String,
    pub uri: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub research_source_kind: Option<SearchSourceKind>,
    pub content_hash: String,
    pub byte_length: u64,
    pub immutable: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeNodeKind {
    Subject,
    Topic,
    Concept,
    Fact,
    Claim,
    Evidence,
    Question,
    Hypothesis,
    Inference,
    Synthesis,
    Conclusion,
    Uncertainty,
    Skill,
    Practice,
    Experience,
    Goal,
    Criterion,
    Constraint,
    RouteOption,
    Decision,
    RouteStep,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeNodeStatus {
    Open,
    Exploring,
    Understood,
    Verified,
    Contested,
    Archived,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EpistemicStatus {
    UserAsserted,
    Unverified,
    Supported,
    Contested,
    Contradicted,
    Outdated,
    ContextDependent,
    Superseded,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeScopeKind {
    Universal,
    Project,
    ContextSpecific,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeScope {
    pub kind: KnowledgeScopeKind,
    pub description: String,
    pub context_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TemporalValidityStatus {
    Unknown,
    Timeless,
    Current,
    TimeBound,
    Expired,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeTemporalValidity {
    pub status: TemporalValidityStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub observed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub valid_from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub valid_until: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeSourceStatus {
    NotApplicable,
    Unlinked,
    Linked,
    Verified,
    Stale,
    Conflicted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSourceRef {
    pub source_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchor_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locator: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quote: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeRelationKind {
    Contains,
    Explains,
    DependsOn,
    Supports,
    Contradicts,
    Answers,
    Summarizes,
    Compares,
    Constrains,
    Recommends,
    Precedes,
    Refines,
    Corrects,
    Supersedes,
    ValidInContext,
    DerivedFrom,
    RelatedTo,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeNode {
    pub id: String,
    pub kind: KnowledgeNodeKind,
    pub title: String,
    pub summary: String,
    pub status: KnowledgeNodeStatus,
    pub epistemic_status: EpistemicStatus,
    pub scope: KnowledgeScope,
    pub temporal_validity: KnowledgeTemporalValidity,
    pub source_status: KnowledgeSourceStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
    pub depth: u32,
    pub tags: Vec<String>,
    pub source_refs: Vec<KnowledgeSourceRef>,
    pub created_by: ActorKind,
    pub creator_id: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived_by: Option<ActorKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archive_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEdge {
    pub id: String,
    pub from_node_id: String,
    pub to_node_id: String,
    pub kind: KnowledgeRelationKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rationale: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_by: Option<ActorKind>,
    pub confidence: f32,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGraph {
    pub id: String,
    pub title: String,
    pub root_node_ids: Vec<String>,
    pub nodes: Vec<KnowledgeNode>,
    pub edges: Vec<KnowledgeEdge>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeContextPolicy {
    SelectedNode,
    SelectedAndNeighbors,
    WholeSubject,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentActionKind {
    DrillDown,
    Ask,
    Summarize,
    Interview,
    Explore,
    Correct,
    Conclude,
    Route,
    RouteScenario,
    Reuse,
    Revise,
    Link,
    Status,
    Source,
    Archive,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentRequestStatus {
    Proposed,
    Running,
    Accepted,
    Rejected,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSelection {
    pub id: String,
    pub focus_node_id: String,
    pub node_ids: Vec<String>,
    pub source_ids: Vec<String>,
    pub context_policy: KnowledgeContextPolicy,
    pub depth: i32,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRequest {
    pub id: String,
    pub action: AgentActionKind,
    pub selection_id: String,
    pub prompt: String,
    pub status: AgentRequestStatus,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeConversation {
    pub id: String,
    pub node_id: String,
    pub question: String,
    pub answer_node_id: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphPatchOperationAudit {
    pub id: String,
    pub rationale: String,
    pub actor: ActorKind,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeNodeStatusSnapshot {
    pub status: KnowledgeNodeStatus,
    pub epistemic_status: EpistemicStatus,
    pub temporal_validity: KnowledgeTemporalValidity,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeNodeSourceSnapshot {
    pub source_refs: Vec<KnowledgeSourceRef>,
    pub source_status: KnowledgeSourceStatus,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeNodeArchiveSnapshot {
    pub status: KnowledgeNodeStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived_by: Option<ActorKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archive_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum GraphPatchOperation {
    CreateNode {
        node: KnowledgeNode,
        audit: GraphPatchOperationAudit,
    },
    CreateEdge {
        edge: KnowledgeEdge,
        audit: GraphPatchOperationAudit,
    },
    CreateConversation {
        conversation: NodeConversation,
        audit: GraphPatchOperationAudit,
    },
    ReviseNode {
        node_id: String,
        before: KnowledgeNode,
        after: KnowledgeNode,
        audit: GraphPatchOperationAudit,
    },
    LinkNodes {
        before: Option<KnowledgeEdge>,
        after: KnowledgeEdge,
        audit: GraphPatchOperationAudit,
    },
    UpdateNodeStatus {
        node_id: String,
        before: KnowledgeNodeStatusSnapshot,
        after: KnowledgeNodeStatusSnapshot,
        audit: GraphPatchOperationAudit,
    },
    UpdateNodeSources {
        node_id: String,
        before: KnowledgeNodeSourceSnapshot,
        after: KnowledgeNodeSourceSnapshot,
        audit: GraphPatchOperationAudit,
    },
    ArchiveNode {
        node_id: String,
        before: KnowledgeNodeArchiveSnapshot,
        after: KnowledgeNodeArchiveSnapshot,
        audit: GraphPatchOperationAudit,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CandidateGraphPatchStatus {
    PendingReview,
    Accepted,
    Rejected,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImpactCategory {
    Judgment,
    Method,
    Summary,
    Conclusion,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImpactPathSegment {
    pub edge_id: String,
    pub relation_kind: KnowledgeRelationKind,
    pub from_node_id: String,
    pub to_node_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImpactAssessmentItem {
    pub node_id: String,
    pub title: String,
    pub node_kind: KnowledgeNodeKind,
    pub category: ImpactCategory,
    pub distance: u32,
    pub path: Vec<ImpactPathSegment>,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImpactAssessmentCounts {
    pub judgment: u32,
    pub method: u32,
    pub summary: u32,
    pub conclusion: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImpactAssessment {
    pub id: String,
    pub patch_id: String,
    pub target_node_id: String,
    pub graph_updated_at: String,
    pub assessed_at: String,
    pub counts: ImpactAssessmentCounts,
    pub affected_items: Vec<ImpactAssessmentItem>,
    pub has_downstream_impact: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImpactReviewTaskStatus {
    PendingReview,
    Accepted,
    Modified,
    Rejected,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImpactReviewHistoryAction {
    Created,
    Accepted,
    ModificationProposed,
    Modified,
    ModificationRejected,
    Rejected,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImpactReviewRevisionSnapshot {
    pub title: String,
    pub summary: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImpactReviewHistoryEntry {
    pub id: String,
    pub action: ImpactReviewHistoryAction,
    pub actor: ActorKind,
    pub at: String,
    pub note: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub patch_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before: Option<ImpactReviewRevisionSnapshot>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after: Option<ImpactReviewRevisionSnapshot>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImpactReviewTask {
    pub id: String,
    pub source_correction_patch_id: String,
    pub impact_assessment_id: String,
    pub correction_target_node_id: String,
    pub corrected_node_id: String,
    pub node_id: String,
    pub category: ImpactCategory,
    pub reason: String,
    pub impact_path: Vec<ImpactPathSegment>,
    pub status: ImpactReviewTaskStatus,
    pub created_at: String,
    pub updated_at: String,
    pub history: Vec<ImpactReviewHistoryEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateGraphPatch {
    pub id: String,
    pub request_id: String,
    pub action: AgentActionKind,
    pub target_node_id: String,
    pub focus_node_id: String,
    pub title: String,
    pub summary: String,
    pub revision: u32,
    pub created_by: ActorKind,
    pub operations: Vec<GraphPatchOperation>,
    pub confidence: f32,
    pub status: CandidateGraphPatchStatus,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub impact_assessment: Option<ImpactAssessment>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reviewed_by: Option<ActorKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reviewed_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GraphPatchOperationKind {
    CreateNode,
    CreateEdge,
    CreateConversation,
    ReviseNode,
    LinkNodes,
    UpdateNodeStatus,
    UpdateNodeSources,
    ArchiveNode,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeAgentSourceContext {
    pub source: KnowledgeSourceAsset,
    pub anchors: Vec<SourceAnchor>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeAgentOutputConstraints {
    pub allowed_operation_kinds: Vec<GraphPatchOperationKind>,
    pub max_operations: u32,
    pub require_source_anchors: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeAgentInput {
    pub schema_version: String,
    pub request: AgentRequest,
    pub project: Project,
    pub selection: KnowledgeSelection,
    pub current_node: KnowledgeNode,
    pub neighbor_nodes: Vec<KnowledgeNode>,
    pub sources: Vec<KnowledgeAgentSourceContext>,
    pub unresolved_questions: Vec<KnowledgeNode>,
    pub constraints: KnowledgeAgentOutputConstraints,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeAgentOutput {
    pub schema_version: String,
    pub request_id: String,
    pub patch: CandidateGraphPatch,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTokenUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_input_tokens: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeAgentProviderMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<AgentTokenUsage>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeAgentProviderResponse {
    pub output: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<KnowledgeAgentProviderMetadata>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeAgentInvocationResult {
    pub output: KnowledgeAgentOutput,
    pub metadata: KnowledgeAgentProviderMetadata,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModelPricing {
    pub currency: String,
    pub input_per_million_tokens: f64,
    pub output_per_million_tokens: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_input_per_million_tokens: Option<f64>,
    pub source: String,
    pub effective_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCostEstimate {
    pub currency: String,
    pub input_cost: f64,
    pub output_cost: f64,
    pub cached_input_cost: f64,
    pub total_cost: f64,
    pub pricing_source: String,
    pub pricing_effective_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentRunAttemptStatus {
    Succeeded,
    Failed,
    TimedOut,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentRunStatus {
    Succeeded,
    Failed,
    TimedOut,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunAttempt {
    pub attempt: u32,
    pub status: AgentRunAttemptStatus,
    pub started_at: String,
    pub completed_at: String,
    pub duration_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<AgentTokenUsage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<AgentRunError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentRunEventKind {
    RunStarted,
    AttemptStarted,
    AttemptSucceeded,
    AttemptFailed,
    RetryScheduled,
    RunCompleted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunEvent {
    pub sequence: u32,
    pub at: String,
    pub kind: AgentRunEventKind,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRun {
    pub id: String,
    pub request_id: String,
    pub provider_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    pub schema_version: String,
    pub status: AgentRunStatus,
    pub max_attempts: u32,
    pub attempt_count: u32,
    pub started_at: String,
    pub completed_at: String,
    pub duration_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub patch_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<AgentTokenUsage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost: Option<AgentCostEstimate>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<AgentRunError>,
    pub attempts: Vec<AgentRunAttempt>,
    pub events: Vec<AgentRunEvent>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeViewKind {
    MindMap,
    Network,
    Evidence,
    Route,
    KnowledgeModules,
    SkillTree,
    LearningDependencies,
    LearningPath,
    PracticeManual,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeView {
    pub id: String,
    pub kind: KnowledgeViewKind,
    pub title: String,
    pub root_node_id: String,
    pub focus_node_id: String,
    pub visible_depth: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceAssetKind {
    ProjectDirectory,
    File,
    Pdf,
    PdfPage,
    Document,
    WebPage,
    CommandOutput,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceAssetAnalysisState {
    NotAnalyzed,
    Queued,
    Analyzing,
    Analyzed,
    Failed,
}

/// V1 compatibility record. New source provenance uses KnowledgeSourceAsset + SourceAnchor.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceAsset {
    pub id: String,
    pub object_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_asset_id: Option<String>,
    pub kind: SourceAssetKind,
    pub title: String,
    pub uri: String,
    pub analysis_state: SourceAssetAnalysisState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_map_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_hash: Option<String>,
    pub metadata: HashMap<String, String>,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchBriefStatus {
    Draft,
    Ready,
    Superseded,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchPlanStatus {
    Draft,
    Active,
    Completed,
    Cancelled,
    Superseded,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchTaskKind {
    Parse,
    Search,
    Extract,
    Analyze,
    Challenge,
    Verify,
    Synthesize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchTaskStatus {
    Queued,
    InProgress,
    Blocked,
    Completed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchAgentRole {
    Planner,
    Researcher,
    Analyst,
    Critic,
    Verifier,
    Synthesizer,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchRoundStatus {
    Planned,
    Active,
    Completed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchRoundOutcome {
    Advanced,
    InsufficientEvidence,
    NoMaterialProgress,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchQueryPurpose {
    PrimarySource,
    SupportingEvidence,
    Counterevidence,
    UpdateCheck,
    GapClosure,
    AlternativeExplanation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchQueryStatus {
    Draft,
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchSourceKind {
    Primary,
    Official,
    PeerReviewed,
    IndependentSecondary,
    Community,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VerificationCheckKind {
    IndependentSources,
    PrimarySourceTraceability,
    TemporalValidity,
    GeographyConsistency,
    UnitConsistency,
    MethodologyConsistency,
    ConflictOfInterest,
    SupportAndOpposition,
    InferenceScope,
    AlternativeExplanation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VerificationStatus {
    Pending,
    Passed,
    Failed,
    Inconclusive,
    NotApplicable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConflictOfInterestStatus {
    NoneDeclared,
    Declared,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResearchTimeScope {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub as_of: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchScope {
    pub description: String,
    pub time: ResearchTimeScope,
    pub geographies: Vec<String>,
    pub units: Vec<String>,
    pub inclusion_criteria: Vec<String>,
    pub exclusion_criteria: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchBrief {
    pub id: String,
    pub project_id: String,
    pub primary_question_node_id: String,
    pub secondary_question_node_ids: Vec<String>,
    pub objective: String,
    pub scope: ResearchScope,
    pub success_criteria: Vec<String>,
    pub seed_source_ids: Vec<String>,
    pub status: ResearchBriefStatus,
    pub revision: u32,
    pub created_by: ActorKind,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchPlan {
    pub id: String,
    pub project_id: String,
    pub brief_id: String,
    pub strategy: String,
    pub task_ids: Vec<String>,
    pub verification_requirements: Vec<VerificationCheckKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_rounds: Option<u32>,
    pub status: ResearchPlanStatus,
    pub revision: u32,
    pub created_by: ActorKind,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchTask {
    pub id: String,
    pub project_id: String,
    pub plan_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub round_id: Option<String>,
    pub kind: ResearchTaskKind,
    pub title: String,
    pub objective: String,
    pub role: ResearchAgentRole,
    pub status: ResearchTaskStatus,
    pub depends_on_task_ids: Vec<String>,
    pub input_node_ids: Vec<String>,
    pub input_source_ids: Vec<String>,
    pub output_node_ids: Vec<String>,
    pub output_source_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocked_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResearchRoundOutputs {
    pub source_ids: Vec<String>,
    pub fact_node_ids: Vec<String>,
    pub claim_node_ids: Vec<String>,
    pub hypothesis_node_ids: Vec<String>,
    pub inference_node_ids: Vec<String>,
    pub evidence_node_ids: Vec<String>,
    pub conflict_node_ids: Vec<String>,
    pub gap_node_ids: Vec<String>,
    pub synthesis_node_ids: Vec<String>,
    pub edge_ids: Vec<String>,
    pub verification_record_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResearchRoundBaseline {
    pub captured_at: String,
    pub graph_updated_at: String,
    pub node_ids: Vec<String>,
    pub edge_ids: Vec<String>,
    pub source_ids: Vec<String>,
    pub verification_record_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum ResearchRoundResult {
    InsufficientEvidence {
        target_node_ids: Vec<String>,
        blocking_verification_record_ids: Vec<String>,
        failed_check_kinds: Vec<VerificationCheckKind>,
        inconclusive_check_kinds: Vec<VerificationCheckKind>,
        source_ids: Vec<String>,
        evidence_node_ids: Vec<String>,
        opposing_evidence_node_ids: Vec<String>,
        gap_node_ids: Vec<String>,
        summary: String,
        assessed_by: ActorKind,
        assessed_at: String,
    },
    ReliableConclusion {
        accepted_patch_id: String,
        verification_target_node_id: String,
        verification_record_ids: Vec<String>,
        fact_node_ids: Vec<String>,
        inference_node_ids: Vec<String>,
        synthesis_node_id: String,
        conclusion_node_id: String,
        unresolved_question_node_ids: Vec<String>,
        confidence: f64,
        scope: KnowledgeScope,
        accepted_at: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchRound {
    pub id: String,
    pub project_id: String,
    pub plan_id: String,
    pub round_number: u32,
    pub objective: String,
    pub task_ids: Vec<String>,
    pub status: ResearchRoundStatus,
    pub baseline: ResearchRoundBaseline,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outcome: Option<ResearchRoundOutcome>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<ResearchRoundResult>,
    pub outputs: ResearchRoundOutputs,
    pub next_question_node_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQueryFilters {
    pub domains: Vec<String>,
    pub languages: Vec<String>,
    pub source_kinds: Vec<SearchSourceKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_to: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
    pub id: String,
    pub project_id: String,
    pub plan_id: String,
    pub task_id: String,
    pub round_id: String,
    pub query: String,
    pub purpose: SearchQueryPurpose,
    pub filters: SearchQueryFilters,
    pub status: SearchQueryStatus,
    pub result_source_ids: Vec<String>,
    pub deduplicated_source_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationRecord {
    pub id: String,
    pub project_id: String,
    pub plan_id: String,
    pub round_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    pub target_node_id: String,
    pub check_kind: VerificationCheckKind,
    pub status: VerificationStatus,
    pub source_ids: Vec<String>,
    pub evidence_node_ids: Vec<String>,
    pub opposing_evidence_node_ids: Vec<String>,
    #[serde(default)]
    pub evidence_profiles: Vec<VerificationEvidenceProfile>,
    #[serde(default)]
    pub alternative_explanation_node_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finding: Option<String>,
    pub checked_by: ActorKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checked_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationEvidenceProfile {
    pub evidence_node_id: String,
    pub geographies: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub methodology: Option<String>,
    pub conflict_of_interest_status: ConflictOfInterestStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflict_of_interest_disclosure: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResearchOrchestration {
    pub briefs: Vec<ResearchBrief>,
    pub plans: Vec<ResearchPlan>,
    pub tasks: Vec<ResearchTask>,
    pub rounds: Vec<ResearchRound>,
    pub search_queries: Vec<SearchQuery>,
    pub verification_records: Vec<VerificationRecord>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeWorkspaceSnapshot {
    pub space: KnowledgeSpace,
    pub project: Project,
    pub projects: Vec<Project>,
    pub subject: ProjectSubject,
    pub graph: KnowledgeGraph,
    pub views: Vec<KnowledgeView>,
    pub active_view_id: String,
    pub selected_node_id: String,
    pub selection: KnowledgeSelection,
    pub agent_requests: Vec<AgentRequest>,
    pub agent_runs: Vec<AgentRun>,
    pub candidate_patches: Vec<CandidateGraphPatch>,
    #[serde(default)]
    pub impact_review_tasks: Vec<ImpactReviewTask>,
    #[serde(default)]
    pub research_orchestration: ResearchOrchestration,
    pub conversations: Vec<NodeConversation>,
    pub knowledge_source_assets: Vec<KnowledgeSourceAsset>,
    pub source_anchors: Vec<SourceAnchor>,
    pub source_assets: Vec<SourceAsset>,
}

/// Versioned durable envelope shared with the TypeScript persistence boundary.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeWorkspaceDocument<T = KnowledgeWorkspaceSnapshot> {
    pub schema_version: u32,
    pub saved_at: String,
    pub workspace: T,
}

pub fn build_smoke_object() -> (ResearchObject, ResearchNode) {
    let now = "2026-05-09T00:00:00.000Z".to_string();
    (
        ResearchObject {
            id: "object-alpha-ai-graph".to_string(),
            kind: ResearchObjectKind::Project,
            title: "AlphaAiGraph".to_string(),
            description: Some("AI Agent 驱动的渐进式研究图谱产品。".to_string()),
            root_uri: None,
            created_at: now.clone(),
            updated_at: now.clone(),
            status: ResearchObjectStatus::Mapped,
            metadata: HashMap::new(),
        },
        ResearchNode {
            id: "node-root".to_string(),
            map_id: "map-main".to_string(),
            parent_id: None,
            kind: ResearchNodeKind::Root,
            title: "AlphaAiGraph 研究对象".to_string(),
            summary: "先生成高层研究地图。".to_string(),
            detail: None,
            depth: 0,
            order: 0.0,
            expansion_state: ResearchExpansionState::Expanded,
            status: ResearchNodeStatus::New,
            markers: vec![AgentMarker {
                id: "marker-core-entry".to_string(),
                kind: AgentMarkerKind::CoreEntry,
                label: "核心入口".to_string(),
                reason: "根节点承载当前研究对象。".to_string(),
                confidence: 0.9,
                severity: Some(AgentMarkerSeverity::High),
            }],
            evidence_ids: Vec::new(),
            action_ids: Vec::new(),
            inquiry_ids: Vec::new(),
            concept_note_ids: Vec::new(),
            created_by: ActorKind::Agent,
            created_at: now.clone(),
            updated_at: now,
            provenance: None,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn constructs_research_object_and_root_node() {
        let (object, node) = build_smoke_object();

        assert_eq!(object.kind, ResearchObjectKind::Project);
        assert_eq!(node.kind, ResearchNodeKind::Root);
        assert_eq!(node.markers[0].kind, AgentMarkerKind::CoreEntry);
    }

    #[test]
    fn serializes_enums_as_snake_case() {
        let marker = serde_json::to_string(&AgentMarkerKind::RecommendedDrilldown).unwrap();
        let node = serde_json::to_string(&ResearchNodeKind::Action).unwrap();
        assert_eq!(marker, "\"recommended_drilldown\"");
        assert_eq!(node, "\"action\"");
    }

    #[test]
    fn serializes_extended_cognitive_node_kinds() {
        let kinds = vec![
            KnowledgeNodeKind::Fact,
            KnowledgeNodeKind::Hypothesis,
            KnowledgeNodeKind::Inference,
            KnowledgeNodeKind::Conclusion,
            KnowledgeNodeKind::Uncertainty,
            KnowledgeNodeKind::Skill,
            KnowledgeNodeKind::Practice,
            KnowledgeNodeKind::Experience,
        ];
        let json = serde_json::to_value(kinds).unwrap();

        assert_eq!(json, serde_json::json!([
            "fact",
            "hypothesis",
            "inference",
            "conclusion",
            "uncertainty",
            "skill",
            "practice",
            "experience"
        ]));
    }

    #[test]
    fn serializes_systematize_artifact_view_kinds() {
        let kinds = vec![
            KnowledgeViewKind::KnowledgeModules,
            KnowledgeViewKind::SkillTree,
            KnowledgeViewKind::LearningDependencies,
            KnowledgeViewKind::LearningPath,
            KnowledgeViewKind::PracticeManual,
        ];
        let json = serde_json::to_value(kinds).unwrap();

        assert_eq!(json, serde_json::json!([
            "knowledge_modules",
            "skill_tree",
            "learning_dependencies",
            "learning_path",
            "practice_manual"
        ]));
    }

    #[test]
    fn serializes_research_orchestration_as_typescript_contract() {
        let orchestration = serde_json::to_value(ResearchOrchestration::default()).unwrap();
        let outputs = serde_json::to_value(ResearchRoundOutputs::default()).unwrap();
        let baseline = serde_json::to_value(ResearchRoundBaseline::default()).unwrap();
        let insufficient_result = serde_json::to_value(ResearchRoundResult::InsufficientEvidence {
            target_node_ids: vec!["claim-1".to_string()],
            blocking_verification_record_ids: vec!["verification-1".to_string()],
            failed_check_kinds: vec![VerificationCheckKind::SupportAndOpposition],
            inconclusive_check_kinds: vec![VerificationCheckKind::ConflictOfInterest],
            source_ids: vec!["source-1".to_string()],
            evidence_node_ids: vec!["evidence-1".to_string()],
            opposing_evidence_node_ids: vec![],
            gap_node_ids: vec!["question-1".to_string()],
            summary: "当前资料不足以支持可靠结论。".to_string(),
            assessed_by: ActorKind::System,
            assessed_at: "2026-07-15T00:00:00.000Z".to_string(),
        })
        .unwrap();
        let reliable_result = serde_json::to_value(ResearchRoundResult::ReliableConclusion {
            accepted_patch_id: "patch-conclusion-1".to_string(),
            verification_target_node_id: "claim-1".to_string(),
            verification_record_ids: vec!["verification-1".to_string()],
            fact_node_ids: vec!["fact-1".to_string()],
            inference_node_ids: vec!["inference-1".to_string()],
            synthesis_node_id: "synthesis-1".to_string(),
            conclusion_node_id: "conclusion-1".to_string(),
            unresolved_question_node_ids: vec!["question-1".to_string()],
            confidence: 0.82,
            scope: KnowledgeScope {
                kind: KnowledgeScopeKind::Project,
                description: "当前 Research Project。".to_string(),
                context_ids: vec!["project-1".to_string()],
            },
            accepted_at: "2026-07-15T00:00:00.000Z".to_string(),
        })
        .unwrap();

        assert_eq!(orchestration["briefs"], serde_json::json!([]));
        assert_eq!(orchestration["searchQueries"], serde_json::json!([]));
        assert_eq!(orchestration["verificationRecords"], serde_json::json!([]));
        assert_eq!(outputs["hypothesisNodeIds"], serde_json::json!([]));
        assert_eq!(outputs["inferenceNodeIds"], serde_json::json!([]));
        assert_eq!(baseline["graphUpdatedAt"], "");
        assert_eq!(baseline["verificationRecordIds"], serde_json::json!([]));
        assert_eq!(insufficient_result["kind"], "insufficient_evidence");
        assert_eq!(
            insufficient_result["blockingVerificationRecordIds"],
            serde_json::json!(["verification-1"])
        );
        assert_eq!(insufficient_result["assessedBy"], "system");
        assert_eq!(reliable_result["kind"], "reliable_conclusion");
        assert_eq!(reliable_result["conclusionNodeId"], "conclusion-1");
        assert_eq!(
            serde_json::to_string(&AgentActionKind::Conclude).unwrap(),
            "\"conclude\""
        );
        assert_eq!(
            serde_json::to_string(&AgentActionKind::Route).unwrap(),
            "\"route\""
        );
        assert_eq!(
            serde_json::to_string(&AgentActionKind::RouteScenario).unwrap(),
            "\"route_scenario\""
        );
        assert_eq!(
            serde_json::to_string(&AgentActionKind::Reuse).unwrap(),
            "\"reuse\""
        );
        assert_eq!(
            serde_json::to_string(&VerificationCheckKind::PrimarySourceTraceability).unwrap(),
            "\"primary_source_traceability\""
        );
        assert_eq!(
            serde_json::to_string(&SearchQueryPurpose::Counterevidence).unwrap(),
            "\"counterevidence\""
        );
        assert_eq!(
            serde_json::to_string(&SearchSourceKind::PeerReviewed).unwrap(),
            "\"peer_reviewed\""
        );
        assert_eq!(
            serde_json::to_string(&ConflictOfInterestStatus::NoneDeclared).unwrap(),
            "\"none_declared\""
        );
    }

    #[test]
    fn serializes_struct_fields_as_typescript_camel_case() {
        let (object, node) = build_smoke_object();
        let object_json = serde_json::to_value(object).unwrap();
        let node_json = serde_json::to_value(node).unwrap();

        assert_eq!(object_json["createdAt"], "2026-05-09T00:00:00.000Z");
        assert_eq!(object_json["status"], "mapped");
        assert_eq!(node_json["mapId"], "map-main");
        assert_eq!(node_json["expansionState"], "expanded");
        assert_eq!(node_json["createdBy"], "agent");
    }

    #[test]
    fn models_one_primary_knowledge_graph() {
        let now = "2026-07-13T00:00:00.000Z".to_string();
        let graph = KnowledgeGraph {
            id: "graph-webassembly".to_string(),
            title: "WebAssembly Component Model".to_string(),
            root_node_ids: vec!["node-root".to_string()],
            nodes: vec![KnowledgeNode {
                id: "node-root".to_string(),
                kind: KnowledgeNodeKind::Subject,
                title: "WebAssembly Component Model".to_string(),
                summary: "技术分析对象".to_string(),
                status: KnowledgeNodeStatus::Open,
                epistemic_status: EpistemicStatus::Unverified,
                scope: KnowledgeScope {
                    kind: KnowledgeScopeKind::Project,
                    description: "仅适用于当前 Project 上下文。".to_string(),
                    context_ids: vec!["project-understand-webassembly".to_string()],
                },
                temporal_validity: KnowledgeTemporalValidity {
                    status: TemporalValidityStatus::Unknown,
                    observed_at: None,
                    valid_from: None,
                    valid_until: None,
                },
                source_status: KnowledgeSourceStatus::NotApplicable,
                confidence: None,
                depth: 0,
                tags: vec!["technology".to_string()],
                source_refs: Vec::new(),
                created_by: ActorKind::Agent,
                creator_id: "alpha-ai-graph".to_string(),
                created_at: now.clone(),
                updated_at: now.clone(),
                archived_at: None,
                archived_by: None,
                archive_reason: None,
            }],
            edges: Vec::new(),
            created_at: now.clone(),
            updated_at: now,
        };

        let json = serde_json::to_value(graph).unwrap();
        assert_eq!(json["nodes"][0]["kind"], "subject");
        assert_eq!(json["nodes"][0]["epistemicStatus"], "unverified");
        assert_eq!(json["nodes"][0]["scope"]["kind"], "project");
        assert_eq!(json["nodes"][0]["temporalValidity"]["status"], "unknown");
        assert_eq!(json["nodes"][0]["sourceStatus"], "not_applicable");
        assert_eq!(json["nodes"][0]["creatorId"], "alpha-ai-graph");
        assert_eq!(json["rootNodeIds"][0], "node-root");
    }

    #[test]
    fn serializes_epistemic_and_temporal_enums_as_snake_case() {
        assert_eq!(
            serde_json::to_string(&EpistemicStatus::ContextDependent).unwrap(),
            "\"context_dependent\""
        );
        assert_eq!(
            serde_json::to_string(&TemporalValidityStatus::TimeBound).unwrap(),
            "\"time_bound\""
        );
        assert_eq!(
            serde_json::to_string(&KnowledgeSourceStatus::NotApplicable).unwrap(),
            "\"not_applicable\""
        );
        assert_eq!(
            serde_json::to_string(&KnowledgeRelationKind::ValidInContext).unwrap(),
            "\"valid_in_context\""
        );
        assert_eq!(
            serde_json::to_string(&KnowledgeRelationKind::DerivedFrom).unwrap(),
            "\"derived_from\""
        );
    }

    #[test]
    fn serializes_immutable_source_versions_with_camel_case_contract() {
        let source = KnowledgeSourceAsset {
            id: "guide@v2-bbbbbbbbbbbb".to_string(),
            logical_source_id: "guide".to_string(),
            version: 2,
            previous_version_id: Some("guide@v1-aaaaaaaaaaaa".to_string()),
            space_id: "space-main".to_string(),
            inventory_kind: KnowledgeInventoryItemKind::BookmarkIndex,
            format: KnowledgeSourceFormat::Markdown,
            title: "Architecture guide".to_string(),
            uri: "file:///workspace/architecture.md".to_string(),
            media_type: Some("text/markdown".to_string()),
            research_source_kind: Some(SearchSourceKind::Primary),
            content_hash: "sha256:bbbb".to_string(),
            byte_length: 42,
            immutable: true,
            created_at: "2026-07-14T01:00:00.000Z".to_string(),
        };

        let json = serde_json::to_value(&source).unwrap();
        assert_eq!(json["logicalSourceId"], "guide");
        assert_eq!(json["previousVersionId"], "guide@v1-aaaaaaaaaaaa");
        assert_eq!(json["inventoryKind"], "bookmark_index");
        assert_eq!(json["format"], "markdown");
        assert_eq!(json["researchSourceKind"], "primary");
        assert_eq!(json["byteLength"], 42);
        assert_eq!(json["immutable"], true);

        let anchor = SourceAnchor {
            id: "guide-anchor-1".to_string(),
            source_id: source.id,
            locator: SourceLocator::Text {
                line_start: 3,
                line_end: Some(5),
                section: Some("Architecture".to_string()),
            },
            quote: Some("Graph patches are reviewed.".to_string()),
            content_hash: Some(source.content_hash),
        };
        let anchor_json = serde_json::to_value(anchor).unwrap();
        assert_eq!(anchor_json["sourceId"], "guide@v2-bbbbbbbbbbbb");
        assert_eq!(anchor_json["locator"]["kind"], "text");
        assert_eq!(anchor_json["locator"]["lineStart"], 3);
        assert_eq!(anchor_json["locator"]["lineEnd"], 5);
    }

    #[test]
    fn round_trips_the_shared_typescript_project_contract_fixture() {
        let fixture = include_str!("../../../src/knowledge/fixtures/project-contract.json");
        let expected: serde_json::Value = serde_json::from_str(fixture).unwrap();
        let project: Project = serde_json::from_str(fixture).unwrap();
        let actual = serde_json::to_value(project).unwrap();

        assert_eq!(actual, expected);
        assert_eq!(actual["mode"], "understand");
        assert_eq!(actual["workflow"]["phase"], "mapping");
        assert_eq!(actual["subject"]["kind"], "technology");
    }

    #[test]
    fn serializes_candidate_graph_patch_for_human_review() {
        let now = "2026-07-13T00:00:00.000Z".to_string();
        let patch = CandidateGraphPatch {
            id: "patch-1".to_string(),
            request_id: "request-1".to_string(),
            action: AgentActionKind::Summarize,
            target_node_id: "node-root".to_string(),
            focus_node_id: "node-summary".to_string(),
            title: "总结根节点".to_string(),
            summary: "接受后写入图谱".to_string(),
            revision: 1,
            created_by: ActorKind::Agent,
            operations: Vec::new(),
            confidence: 0.78,
            status: CandidateGraphPatchStatus::PendingReview,
            created_at: now,
            impact_assessment: None,
            review_task_id: None,
            reviewed_by: None,
            reviewed_at: None,
        };
        let json = serde_json::to_value(&patch).unwrap();

        assert_eq!(json["action"], "summarize");
        assert_eq!(json["status"], "pending_review");
        assert_eq!(json["revision"], 1);
        assert_eq!(json["createdBy"], "agent");
        assert_eq!(json["targetNodeId"], "node-root");

        let output = KnowledgeAgentOutput {
            schema_version: "1.0".to_string(),
            request_id: "request-1".to_string(),
            patch,
        };
        let output_json = serde_json::to_value(output).unwrap();
        assert_eq!(output_json["schemaVersion"], "1.0");
        assert_eq!(output_json["requestId"], "request-1");
        assert_eq!(output_json["patch"]["status"], "pending_review");
    }

    #[test]
    fn serializes_impact_assessment_for_correction_review() {
        let assessment = ImpactAssessment {
            id: "impact-patch-correct-1".to_string(),
            patch_id: "patch-correct-1".to_string(),
            target_node_id: "old-claim".to_string(),
            graph_updated_at: "2026-07-14T00:00:00.000Z".to_string(),
            assessed_at: "2026-07-14T00:00:00.000Z".to_string(),
            counts: ImpactAssessmentCounts {
                judgment: 1,
                method: 0,
                summary: 0,
                conclusion: 1,
            },
            affected_items: vec![ImpactAssessmentItem {
                node_id: "dependent-conclusion".to_string(),
                title: "Dependent conclusion".to_string(),
                node_kind: KnowledgeNodeKind::Conclusion,
                category: ImpactCategory::Conclusion,
                distance: 1,
                path: vec![ImpactPathSegment {
                    edge_id: "claim-supports-conclusion".to_string(),
                    relation_kind: KnowledgeRelationKind::Supports,
                    from_node_id: "old-claim".to_string(),
                    to_node_id: "dependent-conclusion".to_string(),
                }],
                reason: "Depends on corrected knowledge".to_string(),
            }],
            has_downstream_impact: true,
        };
        let json = serde_json::to_value(assessment).unwrap();

        assert_eq!(json["patchId"], "patch-correct-1");
        assert_eq!(json["counts"]["judgment"], 1);
        assert_eq!(json["affectedItems"][0]["nodeKind"], "conclusion");
        assert_eq!(json["affectedItems"][0]["category"], "conclusion");
        assert_eq!(json["affectedItems"][0]["path"][0]["relationKind"], "supports");
        assert_eq!(json["hasDownstreamImpact"], true);
    }

    #[test]
    fn serializes_durable_impact_review_task_history() {
        let task = ImpactReviewTask {
            id: "impact-review-correction-summary".to_string(),
            source_correction_patch_id: "correction-patch".to_string(),
            impact_assessment_id: "impact-correction-patch".to_string(),
            correction_target_node_id: "old-claim".to_string(),
            corrected_node_id: "corrected-claim".to_string(),
            node_id: "downstream-summary".to_string(),
            category: ImpactCategory::Summary,
            reason: "Summary depends on the corrected claim".to_string(),
            impact_path: vec![ImpactPathSegment {
                edge_id: "summary-edge".to_string(),
                relation_kind: KnowledgeRelationKind::Summarizes,
                from_node_id: "old-claim".to_string(),
                to_node_id: "downstream-summary".to_string(),
            }],
            status: ImpactReviewTaskStatus::Modified,
            created_at: "2026-07-14T00:00:00Z".to_string(),
            updated_at: "2026-07-14T01:00:00Z".to_string(),
            history: vec![ImpactReviewHistoryEntry {
                id: "review-history-1".to_string(),
                action: ImpactReviewHistoryAction::Modified,
                actor: ActorKind::User,
                at: "2026-07-14T01:00:00Z".to_string(),
                note: "Accepted revised summary".to_string(),
                patch_id: Some("review-patch".to_string()),
                before: Some(ImpactReviewRevisionSnapshot {
                    title: "Old summary".to_string(),
                    summary: "Old content".to_string(),
                }),
                after: Some(ImpactReviewRevisionSnapshot {
                    title: "Revised summary".to_string(),
                    summary: "Revised content".to_string(),
                }),
            }],
        };
        let json = serde_json::to_value(&task).unwrap();

        assert_eq!(json["sourceCorrectionPatchId"], "correction-patch");
        assert_eq!(json["status"], "modified");
        assert_eq!(json["history"][0]["action"], "modified");
        assert_eq!(json["history"][0]["patchId"], "review-patch");
        assert_eq!(json["history"][0]["after"]["title"], "Revised summary");
    }

    #[test]
    fn serializes_audited_graph_patch_operations() {
        let now = "2026-07-14T00:00:00.000Z".to_string();
        let before = KnowledgeNodeStatusSnapshot {
            status: KnowledgeNodeStatus::Open,
            epistemic_status: EpistemicStatus::Unverified,
            temporal_validity: KnowledgeTemporalValidity {
                status: TemporalValidityStatus::Unknown,
                observed_at: None,
                valid_from: None,
                valid_until: None,
            },
        };
        let operation = GraphPatchOperation::UpdateNodeStatus {
            node_id: "node-1".to_string(),
            before: before.clone(),
            after: KnowledgeNodeStatusSnapshot {
                status: KnowledgeNodeStatus::Exploring,
                ..before
            },
            audit: GraphPatchOperationAudit {
                id: "audit-status-1".to_string(),
                rationale: "开始探索".to_string(),
                actor: ActorKind::Agent,
                created_at: now,
            },
        };
        let json = serde_json::to_value(operation).unwrap();

        assert_eq!(json["kind"], "update_node_status");
        assert_eq!(json["nodeId"], "node-1");
        assert_eq!(json["before"]["status"], "open");
        assert_eq!(json["after"]["status"], "exploring");
        assert_eq!(json["audit"]["actor"], "agent");
        assert_eq!(
            serde_json::to_string(&AgentActionKind::Archive).unwrap(),
            "\"archive\""
        );
        assert_eq!(
            serde_json::to_string(&AgentActionKind::Interview).unwrap(),
            "\"interview\""
        );
        assert_eq!(
            serde_json::to_string(&AgentActionKind::Explore).unwrap(),
            "\"explore\""
        );
        assert_eq!(
            serde_json::to_string(&AgentActionKind::Correct).unwrap(),
            "\"correct\""
        );
        assert_eq!(
            serde_json::to_string(&KnowledgeNodeStatus::Archived).unwrap(),
            "\"archived\""
        );
        let constraints = KnowledgeAgentOutputConstraints {
            allowed_operation_kinds: vec![
                GraphPatchOperationKind::CreateNode,
                GraphPatchOperationKind::ReviseNode,
                GraphPatchOperationKind::ArchiveNode,
            ],
            max_operations: 24,
            require_source_anchors: true,
        };
        let constraints_json = serde_json::to_value(constraints).unwrap();
        assert_eq!(constraints_json["allowedOperationKinds"][1], "revise_node");
        assert_eq!(constraints_json["maxOperations"], 24);
        assert_eq!(constraints_json["requireSourceAnchors"], true);
    }

    #[test]
    fn serializes_agent_run_usage_cost_and_attempt_log() {
        let now = "2026-07-14T00:00:00.000Z".to_string();
        let usage = AgentTokenUsage {
            input_tokens: 1_000,
            output_tokens: 200,
            total_tokens: 1_200,
            cached_input_tokens: Some(400),
        };
        let run = AgentRun {
            id: "agent-run-1".to_string(),
            request_id: "agent-request-1".to_string(),
            provider_id: "deepseek/deepseek-v4-pro".to_string(),
            model: Some("deepseek-v4-pro".to_string()),
            schema_version: KNOWLEDGE_AGENT_SCHEMA_VERSION.to_string(),
            status: AgentRunStatus::Succeeded,
            max_attempts: 3,
            attempt_count: 1,
            started_at: now.clone(),
            completed_at: now.clone(),
            duration_ms: 42,
            patch_id: Some("patch-1".to_string()),
            usage: Some(usage.clone()),
            cost: Some(AgentCostEstimate {
                currency: "USD".to_string(),
                input_cost: 0.0012,
                output_cost: 0.0016,
                cached_input_cost: 0.0002,
                total_cost: 0.003,
                pricing_source: "dated-test-pricing".to_string(),
                pricing_effective_at: now.clone(),
            }),
            error: None,
            attempts: vec![AgentRunAttempt {
                attempt: 1,
                status: AgentRunAttemptStatus::Succeeded,
                started_at: now.clone(),
                completed_at: now.clone(),
                duration_ms: 42,
                provider_request_id: Some("provider-request-1".to_string()),
                usage: Some(usage),
                error: None,
            }],
            events: vec![AgentRunEvent {
                sequence: 1,
                at: now,
                kind: AgentRunEventKind::RunCompleted,
                message: "Agent run completed with status succeeded".to_string(),
            }],
        };
        let json = serde_json::to_value(run).unwrap();

        assert_eq!(json["status"], "succeeded");
        assert_eq!(json["providerId"], "deepseek/deepseek-v4-pro");
        assert_eq!(json["usage"]["cachedInputTokens"], 400);
        assert_eq!(json["cost"]["pricingSource"], "dated-test-pricing");
        assert_eq!(json["attempts"][0]["providerRequestId"], "provider-request-1");
        assert_eq!(json["events"][0]["kind"], "run_completed");
    }

    #[test]
    fn serializes_the_versioned_workspace_document_envelope() {
        let document = KnowledgeWorkspaceDocument {
            schema_version: KNOWLEDGE_WORKSPACE_SCHEMA_VERSION,
            saved_at: "2026-07-14T06:00:00.000Z".to_string(),
            workspace: serde_json::json!({
                "space": { "id": "space-main" },
                "graph": { "id": "graph-main" }
            }),
        };
        let json = serde_json::to_value(document).unwrap();

        assert_eq!(json["schemaVersion"], 2);
        assert_eq!(json["savedAt"], "2026-07-14T06:00:00.000Z");
        assert_eq!(json["workspace"]["space"]["id"], "space-main");
    }
}
