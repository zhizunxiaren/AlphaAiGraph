use alpha_agent_harness::deterministic_research_result;

#[test]
fn returns_research_oriented_agent_result() {
    let result = deterministic_research_result("object-alpha", "AlphaAiGraph");

    assert!(!result.research_map.nodes.is_empty());
    assert!(!result.evidence_anchors.is_empty());
    assert!(!result.actions.is_empty());
    assert!(!result.jobs.is_empty());
    assert!(!result.events.is_empty());
}
