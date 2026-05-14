use alpha_graph_core::{
    AgentJob, AgentJobKind, AgentJobStatus, EvidenceAnchor, EvidenceLocator, EvidenceLocatorKind,
    ResearchAction, ResearchActionKind, ResearchEdge, ResearchEdgeKind, ResearchExpansionState,
    ResearchMap, ResearchNode, ResearchNodeKind, ResearchNodeStatus,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResearchAgentResult {
    pub research_map: ResearchMap,
    pub evidence_anchors: Vec<EvidenceAnchor>,
    pub actions: Vec<ResearchAction>,
    pub jobs: Vec<AgentJob>,
    pub events: Vec<String>,
}

pub fn deterministic_research_result(object_id: &str, title: &str) -> ResearchAgentResult {
    let now = "2026-05-09T00:00:00.000Z".to_string();
    let map_id = format!("{object_id}-map");
    let session_id = format!("{object_id}-session");
    let thread_id = format!("{object_id}-thread-main");
    let root_id = format!("{map_id}-root");
    let child_id = format!("{map_id}-node-product-positioning");
    let action_id = "action-drill-product".to_string();

    ResearchAgentResult {
        research_map: ResearchMap {
            id: map_id.clone(),
            session_id,
            thread_id,
            root_node_id: root_id.clone(),
            nodes: vec![
                ResearchNode {
                    id: root_id.clone(),
                    map_id: map_id.clone(),
                    parent_node_id: None,
                    kind: ResearchNodeKind::Root,
                    title: format!("{title} 研究对象"),
                    summary: "AI Agent 生成第一层研究地图。".into(),
                    depth: 0,
                    status: ResearchNodeStatus::Active,
                    expansion_state: ResearchExpansionState::Expanded,
                    marker_ids: vec!["marker-core".into()],
                    evidence_ids: vec!["evidence-plan".into()],
                    action_ids: vec![],
                    created_at: now.clone(),
                    updated_at: now.clone(),
                    provenance: None,
                },
                ResearchNode {
                    id: child_id.clone(),
                    map_id: map_id.clone(),
                    parent_node_id: Some(root_id.clone()),
                    kind: ResearchNodeKind::Module,
                    title: "产品定位".into(),
                    summary: "确认产品不是普通总结或静态图谱。".into(),
                    depth: 1,
                    status: ResearchNodeStatus::Open,
                    expansion_state: ResearchExpansionState::Collapsed,
                    marker_ids: vec!["marker-focus".into()],
                    evidence_ids: vec!["evidence-plan".into()],
                    action_ids: vec![action_id.clone()],
                    created_at: now.clone(),
                    updated_at: now.clone(),
                    provenance: None,
                },
            ],
            edges: vec![ResearchEdge {
                id: "edge-root-product".into(),
                map_id: map_id.clone(),
                from_node_id: root_id,
                to_node_id: child_id.clone(),
                kind: ResearchEdgeKind::Contains,
                confidence: 0.94,
                created_at: now.clone(),
                provenance: None,
            }],
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        evidence_anchors: vec![EvidenceAnchor {
            id: "evidence-plan".into(),
            source_asset_id: "source-plan".into(),
            title: "Plan.md".into(),
            quote: "AlphaAiGraph uses a progressive research map.".into(),
            locator: EvidenceLocator {
                kind: EvidenceLocatorKind::File,
                path: Some("Plan.md".into()),
                page: None,
                line_start: None,
                line_end: None,
                section: None,
            },
            created_at: now.clone(),
        }],
        actions: vec![ResearchAction {
            id: action_id,
            node_id: child_id,
            kind: ResearchActionKind::DrillDown,
            title: "深入研究".into(),
            description: "只展开当前选中节点的一层研究问题。".into(),
            created_at: now.clone(),
        }],
        jobs: vec![AgentJob {
            id: "job-map-generation".into(),
            kind: AgentJobKind::MapGeneration,
            status: AgentJobStatus::Completed,
            title: "生成第一层研究地图".into(),
            node_ids: vec![],
            source_asset_ids: vec!["source-plan".into()],
            output_ids: vec!["evidence-plan".into()],
            group_id: None,
            previous_job_id: None,
            created_at: now.clone(),
            updated_at: now,
        }],
        events: vec!["browser_local_deterministic_result".into()],
    }
}
