use std::collections::HashMap;

use serde::{Deserialize, Serialize};

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

// V2: the durable knowledge graph is primary. Mind maps and route analyses are
// views over this graph instead of separate stores that must be synchronized.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeSubjectKind {
    Technology,
    Document,
    Paper,
    Codebase,
    Question,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeNodeKind {
    Subject,
    Topic,
    Concept,
    Claim,
    Evidence,
    Question,
    Synthesis,
    Goal,
    Criterion,
    Constraint,
    RouteOption,
    Decision,
    RouteStep,
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
    RelatedTo,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeNode {
    pub id: String,
    pub kind: KnowledgeNodeKind,
    pub title: String,
    pub summary: String,
    pub depth: u32,
    pub tags: Vec<String>,
    pub source_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEdge {
    pub id: String,
    pub from_node_id: String,
    pub to_node_id: String,
    pub kind: KnowledgeRelationKind,
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
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentRequestStatus {
    Proposed,
    Accepted,
    Rejected,
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum GraphPatchOperation {
    CreateNode { node: KnowledgeNode },
    CreateEdge { edge: KnowledgeEdge },
    CreateConversation { conversation: NodeConversation },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CandidateGraphPatchStatus {
    PendingReview,
    Accepted,
    Rejected,
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
    pub operations: Vec<GraphPatchOperation>,
    pub confidence: f32,
    pub status: CandidateGraphPatchStatus,
    pub created_at: String,
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
                depth: 0,
                tags: vec!["technology".to_string()],
                source_ids: Vec::new(),
                created_at: now.clone(),
                updated_at: now.clone(),
            }],
            edges: Vec::new(),
            created_at: now.clone(),
            updated_at: now,
        };

        let json = serde_json::to_value(graph).unwrap();
        assert_eq!(json["nodes"][0]["kind"], "subject");
        assert_eq!(json["rootNodeIds"][0], "node-root");
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
            operations: Vec::new(),
            confidence: 0.78,
            status: CandidateGraphPatchStatus::PendingReview,
            created_at: now,
        };
        let json = serde_json::to_value(patch).unwrap();

        assert_eq!(json["action"], "summarize");
        assert_eq!(json["status"], "pending_review");
        assert_eq!(json["targetNodeId"], "node-root");
    }
}
