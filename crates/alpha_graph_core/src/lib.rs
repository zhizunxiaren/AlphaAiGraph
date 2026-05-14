use serde::{Deserialize, Serialize};

pub type IsoDateTime = String;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchObjectKind {
    Project,
    Repository,
    Pdf,
    DocumentSet,
    TechnicalPlan,
    KnowledgeQuestion,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchObjectStatus {
    New,
    Scanning,
    Ready,
    Archived,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResearchObject {
    pub id: String,
    pub kind: ResearchObjectKind,
    pub title: String,
    pub status: ResearchObjectStatus,
    pub source_asset_ids: Vec<String>,
    pub created_at: IsoDateTime,
    pub updated_at: IsoDateTime,
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
pub struct ResearchSession {
    pub id: String,
    pub object_id: String,
    pub title: String,
    pub status: ResearchSessionStatus,
    pub active_thread_id: String,
    pub created_at: IsoDateTime,
    pub updated_at: IsoDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchThreadKind {
    Main,
    Branch,
    Parallel,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchThreadStatus {
    Queued,
    Active,
    Blocked,
    Completed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResearchThread {
    pub id: String,
    pub session_id: String,
    pub title: String,
    pub kind: ResearchThreadKind,
    pub status: ResearchThreadStatus,
    pub map_id: String,
    pub parent_thread_id: Option<String>,
    pub created_at: IsoDateTime,
    pub updated_at: IsoDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchNodeKind {
    Root,
    Module,
    Section,
    Concept,
    Question,
    Hypothesis,
    Finding,
    Action,
    Script,
    Result,
    Conclusion,
    Evidence,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchNodeStatus {
    Open,
    Active,
    UnderReview,
    Verified,
    Deferred,
    Closed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchExpansionState {
    Collapsed,
    Expanded,
    Leaf,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Provenance {
    pub group_id: Option<String>,
    pub job_id: Option<String>,
    pub candidate_id: Option<String>,
    pub source_node_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResearchNode {
    pub id: String,
    pub map_id: String,
    pub parent_node_id: Option<String>,
    pub kind: ResearchNodeKind,
    pub title: String,
    pub summary: String,
    pub depth: u32,
    pub status: ResearchNodeStatus,
    pub expansion_state: ResearchExpansionState,
    pub marker_ids: Vec<String>,
    pub evidence_ids: Vec<String>,
    pub action_ids: Vec<String>,
    pub created_at: IsoDateTime,
    pub updated_at: IsoDateTime,
    pub provenance: Option<Provenance>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchEdgeKind {
    Contains,
    DependsOn,
    Supports,
    Challenges,
    Validates,
    LeadsTo,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResearchEdge {
    pub id: String,
    pub map_id: String,
    pub from_node_id: String,
    pub to_node_id: String,
    pub kind: ResearchEdgeKind,
    pub confidence: f32,
    pub created_at: IsoDateTime,
    pub provenance: Option<Provenance>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResearchMap {
    pub id: String,
    pub session_id: String,
    pub thread_id: String,
    pub root_node_id: String,
    pub nodes: Vec<ResearchNode>,
    pub edges: Vec<ResearchEdge>,
    pub created_at: IsoDateTime,
    pub updated_at: IsoDateTime,
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AgentMarker {
    pub id: String,
    pub node_id: String,
    pub kind: AgentMarkerKind,
    pub label: String,
    pub rationale: String,
    pub confidence: f32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceAssetKind {
    File,
    Pdf,
    Document,
    WebPage,
    CommandOutput,
    Repository,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourceAsset {
    pub id: String,
    pub kind: SourceAssetKind,
    pub title: String,
    pub path: String,
    pub summary: String,
    pub created_at: IsoDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceLocatorKind {
    File,
    Page,
    Line,
    Section,
    Command,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EvidenceLocator {
    pub kind: EvidenceLocatorKind,
    pub path: Option<String>,
    pub page: Option<u32>,
    pub line_start: Option<u32>,
    pub line_end: Option<u32>,
    pub section: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EvidenceAnchor {
    pub id: String,
    pub source_asset_id: String,
    pub title: String,
    pub quote: String,
    pub locator: EvidenceLocator,
    pub created_at: IsoDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchActionKind {
    DrillDown,
    InspectSource,
    CreateSideInquiry,
    RunValidation,
    Study,
    Synthesis,
    Export,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResearchAction {
    pub id: String,
    pub node_id: String,
    pub kind: ResearchActionKind,
    pub title: String,
    pub description: String,
    pub created_at: IsoDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentJobKind {
    SourceScan,
    MapGeneration,
    ParallelExtraction,
    Validation,
    SideInquiry,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentJobStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentJob {
    pub id: String,
    pub kind: AgentJobKind,
    pub status: AgentJobStatus,
    pub title: String,
    pub node_ids: Vec<String>,
    pub source_asset_ids: Vec<String>,
    pub output_ids: Vec<String>,
    pub group_id: Option<String>,
    pub previous_job_id: Option<String>,
    pub created_at: IsoDateTime,
    pub updated_at: IsoDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParallelAnalysisMode {
    FanOut,
    Compare,
    Sweep,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParallelMergePolicy {
    ManualReview,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParallelAnalysisStatus {
    Queued,
    Running,
    Completed,
    PartiallyFailed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ParallelAnalysisGroup {
    pub id: String,
    pub mode: ParallelAnalysisMode,
    pub merge_policy: ParallelMergePolicy,
    pub status: ParallelAnalysisStatus,
    pub node_ids: Vec<String>,
    pub job_ids: Vec<String>,
    pub candidate_node_ids: Vec<String>,
    pub created_at: IsoDateTime,
    pub updated_at: IsoDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CandidateStatus {
    PendingReview,
    NeedsReview,
    Merged,
    Dismissed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CandidateResearchNode {
    pub id: String,
    pub group_id: String,
    pub job_id: String,
    pub node: ResearchNode,
    pub status: CandidateStatus,
    pub conflict_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionRunStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecutionRun {
    pub id: String,
    pub node_id: String,
    pub action_id: String,
    pub status: ExecutionRunStatus,
    pub command: String,
    pub output: String,
    pub created_at: IsoDateTime,
    pub updated_at: IsoDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InquiryContextPolicy {
    LocalNode,
    CurrentBranch,
    WholeProject,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SideInquiryStatus {
    Open,
    Resolved,
    Discarded,
    Promoted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SideInquirySession {
    pub id: String,
    pub node_id: String,
    pub status: SideInquiryStatus,
    pub context_policy: InquiryContextPolicy,
    pub question: String,
    pub message_ids: Vec<String>,
    pub created_at: IsoDateTime,
    pub updated_at: IsoDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InquiryMessageRole {
    User,
    Agent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InquiryMessage {
    pub id: String,
    pub inquiry_id: String,
    pub role: InquiryMessageRole,
    pub content: String,
    pub created_at: IsoDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConceptNote {
    pub id: String,
    pub title: String,
    pub body: String,
    pub source_inquiry_id: Option<String>,
    pub related_node_ids: Vec<String>,
    pub created_at: IsoDateTime,
    pub updated_at: IsoDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct KnowledgeDigest {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub included_node_ids: Vec<String>,
    pub included_note_ids: Vec<String>,
    pub created_at: IsoDateTime,
    pub updated_at: IsoDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RelationshipGraphNodeKind {
    ResearchObject,
    ResearchNode,
    Evidence,
    ExecutionRun,
    ConceptNote,
    KnowledgeDigest,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RelationshipGraphNode {
    pub id: String,
    pub kind: RelationshipGraphNodeKind,
    pub source_id: String,
    pub title: String,
    pub summary: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RelationshipGraphRelation {
    Contains,
    ResearchFlow,
    DependsOn,
    References,
    Supports,
    Challenges,
    Validates,
    LeadsTo,
    ValidatedBy,
    Explains,
    DerivedFrom,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RelationshipGraphEdge {
    pub id: String,
    pub source_id: String,
    pub from_node_id: String,
    pub to_node_id: String,
    pub relation: RelationshipGraphRelation,
    pub confidence: Option<f32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RelationshipGraph {
    pub id: String,
    pub source_object_id: String,
    pub generated_at: IsoDateTime,
    pub nodes: Vec<RelationshipGraphNode>,
    pub edges: Vec<RelationshipGraphEdge>,
}

pub fn crate_name() -> &'static str {
    "alpha_graph_core"
}

#[cfg(test)]
mod tests {
    use super::crate_name;

    #[test]
    fn exports_public_symbol() {
        assert_eq!(crate_name(), "alpha_graph_core");
    }
}
