use alpha_graph_core::{
    AgentJob, AgentJobKind, AgentJobStatus, AgentMarker, AgentMarkerKind, CandidateResearchNode,
    ConceptNote, EvidenceAnchor, EvidenceLocator, EvidenceLocatorKind, ExecutionRun,
    ExecutionRunStatus, InquiryContextPolicy, InquiryMessage, InquiryMessageRole, KnowledgeDigest,
    ParallelAnalysisGroup, ParallelAnalysisMode, ParallelAnalysisStatus, ParallelMergePolicy,
    Provenance, RelationshipGraph, RelationshipGraphEdge, RelationshipGraphNode,
    RelationshipGraphNodeKind, RelationshipGraphRelation, ResearchAction, ResearchActionKind,
    ResearchEdge, ResearchEdgeKind, ResearchExpansionState, ResearchMap, ResearchNode,
    ResearchNodeKind, ResearchNodeStatus, ResearchObject, ResearchObjectKind, ResearchObjectStatus,
    ResearchSession, ResearchSessionStatus, ResearchThread, ResearchThreadKind,
    ResearchThreadStatus, SideInquirySession, SideInquiryStatus, SourceAsset, SourceAssetKind,
};

#[test]
fn constructs_research_model_payloads() {
    let now = "2026-05-09T00:00:00.000Z".to_string();
    let object = ResearchObject {
        id: "object-alpha".into(),
        kind: ResearchObjectKind::Project,
        title: "AlphaAiGraph".into(),
        status: ResearchObjectStatus::Ready,
        source_asset_ids: vec!["source-plan".into()],
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    let session = ResearchSession {
        id: "session-alpha".into(),
        object_id: object.id.clone(),
        title: "渐进式研究地图".into(),
        status: ResearchSessionStatus::Active,
        active_thread_id: "thread-main".into(),
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    let thread = ResearchThread {
        id: "thread-main".into(),
        session_id: session.id.clone(),
        title: "主研究线程".into(),
        kind: ResearchThreadKind::Main,
        status: ResearchThreadStatus::Active,
        map_id: "map-alpha".into(),
        parent_thread_id: None,
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    let provenance = Provenance {
        group_id: Some("parallel-group".into()),
        job_id: Some("job-parallel".into()),
        candidate_id: Some("candidate-node".into()),
        source_node_ids: vec!["node-root".into()],
    };
    let node = ResearchNode {
        id: "node-root".into(),
        map_id: thread.map_id.clone(),
        parent_node_id: None,
        kind: ResearchNodeKind::Root,
        title: "AlphaAiGraph 研究对象".into(),
        summary: "入口".into(),
        depth: 0,
        status: ResearchNodeStatus::Active,
        expansion_state: ResearchExpansionState::Expanded,
        marker_ids: vec!["marker-focus".into()],
        evidence_ids: vec!["evidence-plan".into()],
        action_ids: vec!["action-drill".into()],
        created_at: now.clone(),
        updated_at: now.clone(),
        provenance: Some(provenance.clone()),
    };
    let marker = AgentMarker {
        id: "marker-focus".into(),
        node_id: node.id.clone(),
        kind: AgentMarkerKind::CoreEntry,
        label: "核心入口".into(),
        rationale: "理解当前对象的核心入口节点".into(),
        confidence: 0.94,
    };
    let source = SourceAsset {
        id: "source-plan".into(),
        kind: SourceAssetKind::File,
        title: "Plan.md".into(),
        path: "Plan.md".into(),
        summary: "实施计划".into(),
        created_at: now.clone(),
    };
    let evidence = EvidenceAnchor {
        id: "evidence-plan".into(),
        source_asset_id: source.id.clone(),
        title: "Plan.md".into(),
        quote: "合并必须来自用户显式动作".into(),
        locator: EvidenceLocator {
            kind: EvidenceLocatorKind::Line,
            path: Some("Plan.md".into()),
            page: None,
            line_start: Some(1),
            line_end: Some(3),
            section: None,
        },
        created_at: now.clone(),
    };
    let action = ResearchAction {
        id: "action-drill".into(),
        node_id: node.id.clone(),
        kind: ResearchActionKind::DrillDown,
        title: "深入研究".into(),
        description: "只展开当前选中节点的一层研究问题。".into(),
        created_at: now.clone(),
    };
    let job = AgentJob {
        id: "job-parallel".into(),
        kind: AgentJobKind::ParallelExtraction,
        status: AgentJobStatus::Queued,
        title: "并行研究任务".into(),
        node_ids: vec![node.id.clone()],
        source_asset_ids: vec![source.id.clone()],
        output_ids: vec!["candidate-node".into()],
        group_id: Some("parallel-group".into()),
        previous_job_id: None,
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    let group = ParallelAnalysisGroup {
        id: "parallel-group".into(),
        mode: ParallelAnalysisMode::FanOut,
        merge_policy: ParallelMergePolicy::ManualReview,
        status: ParallelAnalysisStatus::Queued,
        node_ids: vec![node.id.clone()],
        job_ids: vec![job.id.clone()],
        candidate_node_ids: vec!["candidate-node".into()],
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    let candidate = CandidateResearchNode {
        id: "candidate-node".into(),
        group_id: group.id.clone(),
        job_id: job.id.clone(),
        node: node.clone(),
        status: alpha_graph_core::CandidateStatus::PendingReview,
        conflict_reason: None,
    };
    let execution = ExecutionRun {
        id: "execution-validation".into(),
        node_id: node.id.clone(),
        action_id: action.id.clone(),
        status: ExecutionRunStatus::Succeeded,
        command: "npm test".into(),
        output: "ok".into(),
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    let side_inquiry = SideInquirySession {
        id: "side-inquiry".into(),
        node_id: node.id.clone(),
        status: SideInquiryStatus::Open,
        context_policy: InquiryContextPolicy::LocalNode,
        question: "为什么重要？".into(),
        message_ids: vec!["message-user".into()],
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    let message = InquiryMessage {
        id: "message-user".into(),
        inquiry_id: side_inquiry.id.clone(),
        role: InquiryMessageRole::User,
        content: "为什么重要？".into(),
        created_at: now.clone(),
    };
    let note = ConceptNote {
        id: "concept-note".into(),
        title: "概念解释".into(),
        body: "旁路沉淀内容".into(),
        source_inquiry_id: Some(side_inquiry.id.clone()),
        related_node_ids: vec![node.id.clone()],
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    let digest = KnowledgeDigest {
        id: "knowledge-digest".into(),
        title: "知识整理".into(),
        summary: "整理结果".into(),
        included_node_ids: vec![node.id.clone()],
        included_note_ids: vec![note.id.clone()],
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    let map = ResearchMap {
        id: thread.map_id.clone(),
        session_id: session.id.clone(),
        thread_id: thread.id.clone(),
        root_node_id: node.id.clone(),
        nodes: vec![node],
        edges: vec![ResearchEdge {
            id: "edge-root-child".into(),
            map_id: thread.map_id.clone(),
            from_node_id: "node-root".into(),
            to_node_id: "node-child".into(),
            kind: ResearchEdgeKind::Contains,
            confidence: 0.95,
            created_at: now.clone(),
            provenance: Some(provenance),
        }],
        created_at: now.clone(),
        updated_at: now,
    };

    assert_eq!(object.title, "AlphaAiGraph");
    assert_eq!(session.object_id, object.id);
    assert_eq!(thread.session_id, session.id);
    assert_eq!(map.nodes.len(), 1);
    assert_eq!(marker.kind, AgentMarkerKind::CoreEntry);
    assert_eq!(evidence.locator.line_start, Some(1));
    assert_eq!(candidate.group_id, group.id);
    assert_eq!(execution.status, ExecutionRunStatus::Succeeded);
    assert_eq!(message.inquiry_id, side_inquiry.id);
    assert_eq!(digest.included_note_ids, vec![note.id]);
}

#[test]
fn serializes_enums_as_snake_case() {
    assert_eq!(
        serde_json::to_string(&AgentMarkerKind::RecommendedDrilldown).unwrap(),
        "\"recommended_drilldown\""
    );
    assert_eq!(
        serde_json::to_string(&RelationshipGraphNodeKind::ResearchObject).unwrap(),
        "\"research_object\""
    );
}

#[test]
fn constructs_relationship_graph_payload() {
    let graph = RelationshipGraph {
        id: "relationship-alpha".into(),
        source_object_id: "object-alpha".into(),
        generated_at: "2026-05-09T00:00:00.000Z".into(),
        nodes: vec![RelationshipGraphNode {
            id: "rg-object-alpha".into(),
            kind: RelationshipGraphNodeKind::ResearchObject,
            source_id: "object-alpha".into(),
            title: "AlphaAiGraph".into(),
            summary: Some("投影对象".into()),
            tags: vec!["project".into()],
        }],
        edges: vec![RelationshipGraphEdge {
            id: "rg-edge-object-root".into(),
            source_id: "object-alpha".into(),
            from_node_id: "rg-object-alpha".into(),
            to_node_id: "rg-research-root".into(),
            relation: RelationshipGraphRelation::Contains,
            confidence: Some(1.0),
        }],
    };

    assert_eq!(graph.nodes[0].source_id, "object-alpha");
    assert_eq!(graph.edges[0].relation, RelationshipGraphRelation::Contains);
}
