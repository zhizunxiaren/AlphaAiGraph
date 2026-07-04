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
pub enum ResearchNodeKind {
    Root,
    Module,
    Section,
    Concept,
    Question,
    Finding,
    Risk,
    Evidence,
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
    pub kind: AgentMarkerKind,
    pub label: String,
    pub reason: String,
    pub confidence: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResearchObject {
    pub id: String,
    pub kind: ResearchObjectKind,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResearchNode {
    pub id: String,
    pub kind: ResearchNodeKind,
    pub title: String,
    pub markers: Vec<AgentMarker>,
}

pub fn build_smoke_object() -> (ResearchObject, ResearchNode) {
    (
        ResearchObject {
            id: "object-alpha-ai-graph".to_string(),
            kind: ResearchObjectKind::Project,
            title: "AlphaAiGraph".to_string(),
        },
        ResearchNode {
            id: "node-root".to_string(),
            kind: ResearchNodeKind::Root,
            title: "AlphaAiGraph 研究对象".to_string(),
            markers: vec![AgentMarker {
                id: "marker-core-entry".to_string(),
                kind: AgentMarkerKind::CoreEntry,
                label: "核心入口".to_string(),
                reason: "根节点承载当前研究对象。".to_string(),
                confidence: 0.9,
            }],
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
        let json = serde_json::to_string(&AgentMarkerKind::RecommendedDrilldown).unwrap();
        assert_eq!(json, "\"recommended_drilldown\"");
    }
}
