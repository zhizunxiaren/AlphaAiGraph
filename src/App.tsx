import { useMemo } from "react";
import { KnowledgeWorkspaceShell } from "./components/KnowledgeWorkspaceShell";
import type { KnowledgeSearchProvider } from "./knowledge/explorerPolicy";
import { createConfiguredExplorerSearchProvider } from "./knowledge/providers/explorerSearchProvider";
import { useKnowledgeWorkspace } from "./state/useKnowledgeWorkspace";

export interface AppProps {
  explorerSearchProvider?: KnowledgeSearchProvider;
}

export default function App({ explorerSearchProvider }: AppProps = {}) {
  const configuredProvider = useMemo(
    () => explorerSearchProvider ?? createConfiguredExplorerSearchProvider(),
    [explorerSearchProvider]
  );
  const workspace = useKnowledgeWorkspace({ explorerSearchProvider: configuredProvider });
  return <KnowledgeWorkspaceShell workspace={workspace} />;
}
