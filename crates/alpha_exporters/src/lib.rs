use alpha_graph_core::{KnowledgeEdge, KnowledgeGraph, KnowledgeNode, ResearchNode};

pub fn export_node_title(node: &ResearchNode) -> String {
    format!("# {}", node.title)
}

/// Deterministic, read-only Markdown projection of the V2 graph contract.
/// The browser exporter adds Project and Source indexes around the same core data.
pub fn export_knowledge_graph_markdown(graph: &KnowledgeGraph) -> String {
    let mut nodes: Vec<&KnowledgeNode> = graph.nodes.iter().collect();
    nodes.sort_by(|left, right| {
        left.depth
            .cmp(&right.depth)
            .then_with(|| left.title.cmp(&right.title))
            .then_with(|| left.id.cmp(&right.id))
    });
    let mut edges: Vec<&KnowledgeEdge> = graph.edges.iter().collect();
    edges.sort_by(|left, right| {
        left.from_node_id
            .cmp(&right.from_node_id)
            .then_with(|| enum_key(&left.kind).cmp(&enum_key(&right.kind)))
            .then_with(|| left.to_node_id.cmp(&right.to_node_id))
            .then_with(|| left.id.cmp(&right.id))
    });

    let mut lines = vec![
        format!("# {}", heading(&graph.title)),
        String::new(),
        format!("- **Graph ID**: `{}`", inline(&graph.id)),
        format!("- **Updated At**: `{}`", inline(&graph.updated_at)),
        String::new(),
        "## Nodes".to_string(),
        String::new(),
    ];
    if nodes.is_empty() {
        lines.push("- None".to_string());
    } else {
        for node in nodes {
            lines.extend([
                format!("### {}", heading(&node.title)),
                String::new(),
                node.summary.clone(),
                String::new(),
                format!("- **Node ID**: `{}`", inline(&node.id)),
                format!("- **Kind**: `{}`", enum_key(&node.kind)),
                format!("- **Status**: `{}`", enum_key(&node.status)),
                format!("- **Epistemic Status**: `{}`", enum_key(&node.epistemic_status)),
                format!("- **Source Status**: `{}`", enum_key(&node.source_status)),
                String::new(),
            ]);
        }
    }
    lines.extend([String::new(), "## Relations".to_string(), String::new()]);
    if edges.is_empty() {
        lines.push("- None".to_string());
    } else {
        for edge in edges {
            lines.push(format!(
                "- `{}` `{}` -> `{}` (`{}`, confidence {:.2})",
                inline(&edge.from_node_id),
                enum_key(&edge.kind),
                inline(&edge.to_node_id),
                inline(&edge.id),
                edge.confidence
            ));
        }
    }
    format!("{}\n", lines.join("\n").trim_end())
}

fn enum_key(value: &impl std::fmt::Debug) -> String {
    let debug = format!("{value:?}");
    let mut result = String::new();
    for (index, character) in debug.chars().enumerate() {
        if character.is_uppercase() && index > 0 {
            result.push('_');
        }
        result.extend(character.to_lowercase());
    }
    result
}

fn heading(value: &str) -> String {
    let normalized = value.replace(['\r', '\n'], " ");
    let trimmed = normalized.trim();
    if trimmed.is_empty() {
        "Untitled".to_string()
    } else if trimmed.starts_with('#') {
        format!("\\{trimmed}")
    } else {
        trimmed.to_string()
    }
}

fn inline(value: &str) -> String {
    value.replace(['\r', '\n'], " ").replace('`', "\\`")
}

#[cfg(test)]
mod tests {
    use alpha_graph_core::build_smoke_object;

    use super::*;

    #[test]
    fn exports_node_title_as_markdown_heading() {
        let node = build_smoke_object().1;
        assert_eq!(export_node_title(&node), "# AlphaAiGraph 研究对象");
    }

    #[test]
    fn deterministically_exports_v2_graph_relations() {
        use alpha_graph_core::{ActorKind, KnowledgeRelationKind};

        let edge_a = KnowledgeEdge {
            id: "edge-a".to_string(),
            from_node_id: "node-a".to_string(),
            to_node_id: "node-b".to_string(),
            kind: KnowledgeRelationKind::Supports,
            label: None,
            rationale: None,
            created_by: Some(ActorKind::Agent),
            confidence: 0.8,
            created_at: "2026-07-14T00:00:00.000Z".to_string(),
        };
        let edge_b = KnowledgeEdge {
            id: "edge-b".to_string(),
            from_node_id: "node-a".to_string(),
            to_node_id: "node-c".to_string(),
            kind: KnowledgeRelationKind::DependsOn,
            confidence: 1.0,
            ..edge_a.clone()
        };
        let graph = KnowledgeGraph {
            id: "graph-v2".to_string(),
            title: "V2 Knowledge Graph".to_string(),
            root_node_ids: vec![],
            nodes: vec![],
            edges: vec![edge_a.clone(), edge_b.clone()],
            created_at: "2026-07-14T00:00:00.000Z".to_string(),
            updated_at: "2026-07-14T01:00:00.000Z".to_string(),
        };
        let reordered = KnowledgeGraph {
            edges: vec![edge_b, edge_a],
            ..graph.clone()
        };

        let first = export_knowledge_graph_markdown(&graph);
        let second = export_knowledge_graph_markdown(&reordered);
        assert_eq!(first, second);
        assert!(first.contains("`depends_on`"));
        assert!(first.contains("`supports`"));
        assert!(first.ends_with('\n'));
    }
}
