import { AppShell } from "./components/AppShell";
import { useResearchWorkspace } from "./state/useResearchWorkspace";

export default function App() {
  const workspace = useResearchWorkspace();
  return <AppShell workspace={workspace} />;
}
