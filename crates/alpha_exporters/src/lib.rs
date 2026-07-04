use alpha_graph_core::ResearchNode;

pub fn export_node_title(node: &ResearchNode) -> String {
    format!("# {}", node.title)
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
}
