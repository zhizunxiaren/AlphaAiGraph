import { AppShell } from "./components/AppShell";
import { useKnowledgeApp } from "./state/useKnowledgeApp";
import "./styles.css";

export default function App() {
  const app = useKnowledgeApp();
  return <AppShell {...app} />;
}
