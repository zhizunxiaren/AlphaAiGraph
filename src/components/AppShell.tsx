import { useState } from "react";
import type { ResearchWorkspaceController } from "../state/useResearchWorkspace";
import { AgentFeed } from "./AgentFeed";
import { GraphCanvas } from "./GraphCanvas";
import { NodeInspector } from "./NodeInspector";
import { ProjectRail } from "./ProjectRail";
import { SourceDrawer } from "./SourceDrawer";

interface AppShellProps {
  workspace: ResearchWorkspaceController;
}

const PROJECT_RAIL_COLLAPSED_KEY = "alpha-ai-graph.projectRailCollapsed";
const AGENT_FEED_COLLAPSED_KEY = "alpha-ai-graph.agentFeedCollapsed";
const NODE_INSPECTOR_COLLAPSED_KEY = "alpha-ai-graph.nodeInspectorCollapsed";

function readStoredBoolean(key: string, fallback: boolean) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const storedValue = window.localStorage.getItem(key);

  if (storedValue === "true") {
    return true;
  }

  if (storedValue === "false") {
    return false;
  }

  return fallback;
}

function usePersistentBooleanState(key: string, fallback: boolean) {
  const [value, setValue] = useState(() => readStoredBoolean(key, fallback));

  const setStoredValue = (update: boolean | ((current: boolean) => boolean)) => {
    setValue((current) => {
      const nextValue = typeof update === "function" ? update(current) : update;

      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, String(nextValue));
      }

      return nextValue;
    });
  };

  return [value, setStoredValue] as const;
}

export function AppShell({ workspace }: AppShellProps) {
  const [isProjectRailCollapsed, setProjectRailCollapsed] = usePersistentBooleanState(
    PROJECT_RAIL_COLLAPSED_KEY,
    false
  );
  const [isAgentFeedCollapsed, setAgentFeedCollapsed] = usePersistentBooleanState(
    AGENT_FEED_COLLAPSED_KEY,
    false
  );
  const [isNodeInspectorCollapsed, setNodeInspectorCollapsed] = usePersistentBooleanState(
    NODE_INSPECTOR_COLLAPSED_KEY,
    false
  );
  const isAgentFeedMergedIntoRail = isProjectRailCollapsed && isAgentFeedCollapsed;
  const cockpitClassName = [
    "cockpit-grid",
    isProjectRailCollapsed ? "rail-collapsed" : "",
    isAgentFeedCollapsed ? "agent-collapsed" : "",
    isAgentFeedMergedIntoRail ? "agent-merged" : "",
    isNodeInspectorCollapsed ? "inspector-collapsed" : ""
  ].filter(Boolean).join(" ");

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand">AlphaAiGraph</div>
      </header>

      <main className={cockpitClassName}>
        <ProjectRail
          workspace={workspace}
          collapsed={isProjectRailCollapsed}
          onToggleCollapsed={() => setProjectRailCollapsed((current) => !current)}
          agentFeedCollapsed={isAgentFeedCollapsed}
          onToggleAgentFeedCollapsed={() => setAgentFeedCollapsed((current) => !current)}
        />
        <AgentFeed
          workspace={workspace}
          collapsed={isAgentFeedCollapsed}
          mergedIntoProjectRail={isAgentFeedMergedIntoRail}
          onToggleCollapsed={() => setAgentFeedCollapsed((current) => !current)}
        />
        <GraphCanvas workspace={workspace} />
        <NodeInspector
          workspace={workspace}
          collapsed={isNodeInspectorCollapsed}
          onToggleCollapsed={() => setNodeInspectorCollapsed((current) => !current)}
        />
      </main>

      {workspace.warning ? <div className="status-toast" role="status">{workspace.warning}</div> : null}
      <SourceDrawer workspace={workspace} />
    </div>
  );
}
