import { KnowledgeWorkspaceShell } from "./components/KnowledgeWorkspaceShell";
import { useKnowledgeWorkspace } from "./state/useKnowledgeWorkspace";

export default function App() {
  const workspace = useKnowledgeWorkspace();
  return <KnowledgeWorkspaceShell workspace={workspace} />;
}
