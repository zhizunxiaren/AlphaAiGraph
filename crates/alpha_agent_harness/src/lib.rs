use std::{future::Future, pin::Pin};

use alpha_graph_core::{
    build_smoke_object, KnowledgeAgentInput, KnowledgeAgentProviderResponse, ResearchNode,
};

pub type KnowledgeAgentProviderFuture<'a> = Pin<
    Box<dyn Future<Output = Result<KnowledgeAgentProviderResponse, KnowledgeAgentProviderError>> + Send + 'a>,
>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnowledgeAgentProviderError {
    pub code: String,
    pub message: String,
}

/// Provider adapters receive only the versioned domain input and return the
/// versioned candidate-patch envelope. They never receive a mutable graph.
pub trait KnowledgeAgentProvider: Send + Sync {
    fn id(&self) -> &str;
    fn invoke<'a>(&'a self, input: &'a KnowledgeAgentInput) -> KnowledgeAgentProviderFuture<'a>;
}

pub fn deterministic_root_node() -> ResearchNode {
    build_smoke_object().1
}

#[cfg(test)]
mod tests {
    use super::*;

    struct UnavailableProvider;

    impl KnowledgeAgentProvider for UnavailableProvider {
        fn id(&self) -> &str {
            "unavailable-test-provider"
        }

        fn invoke<'a>(&'a self, _input: &'a KnowledgeAgentInput) -> KnowledgeAgentProviderFuture<'a> {
            Box::pin(async {
                Err(KnowledgeAgentProviderError {
                    code: "unavailable".to_string(),
                    message: "No network provider is configured in this test.".to_string(),
                })
            })
        }
    }

    #[test]
    fn returns_deterministic_root_node() {
        assert_eq!(deterministic_root_node().id, "node-root");
    }

    #[test]
    fn exposes_an_object_safe_provider_neutral_boundary() {
        let provider: Box<dyn KnowledgeAgentProvider> = Box::new(UnavailableProvider);
        assert_eq!(provider.id(), "unavailable-test-provider");
    }
}
