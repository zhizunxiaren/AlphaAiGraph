use alpha_graph_core::{build_smoke_object, ResearchNode};

pub fn deterministic_root_node() -> ResearchNode {
    build_smoke_object().1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_deterministic_root_node() {
        assert_eq!(deterministic_root_node().id, "node-root");
    }
}
