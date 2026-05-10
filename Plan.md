# AlphaAiGraph Research Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-center AlphaAiGraph from a static knowledge graph app into an AI Agent driven progressive research workflow map with evidence, drill-down, side inquiries, parallel candidate work, and an Obsidian-style relationship graph projection.

**Architecture:** Keep the current React + Vite + Tauri shape, but replace the product model from `KnowledgeGraph` first-class state to `ResearchObject -> ResearchSession -> ResearchThread -> ResearchMap -> ResearchNode`. The active workspace renders the research workflow map as the primary canvas; long-term relationship graph becomes a derived projection, not a second source of truth.

**Tech Stack:** React 19, TypeScript, Vite, Cytoscape, lucide-react, Tauri 2, Rust workspace crates `alpha_graph_core`, `alpha_agent_harness`, and `alpha_exporters`.

---

## Product North Star

AlphaAiGraph is not a generic knowledge graph, PDF summarizer, mind map tool, study-card tool, or chat-first assistant. The product loop is:

```text
Input complex object
-> AI Agent scans it
-> Generate first-layer research workflow map
-> Mark focus, difficulty, risk, recommended drill-down, and validation points
-> User chooses a node
-> AI expands the node into the next layer
-> User asks questions, checks evidence, runs validation, records conclusions
-> Results are written back to the map
-> Durable relationships are projected into an Obsidian-style graph
```

The first implementation must avoid full automatic analysis. It should create a useful high-level map, then let the user choose the next research path.

## Safety And Project Rules

- Do not use batch deletion commands: `del /s`, `rd /s`, `rmdir /s`, `Remove-Item -Recurse`, or `rm -rf`.
- Delete only one explicit file path at a time, and stop for user approval if bulk deletion seems necessary.
- Do not commit files containing keys, tokens, secrets, passwords, or API keys.
- Before staging or committing, inspect privacy-sensitive config and generated files.
- Do not trigger Unreal Engine or UE plugin compilation.
- Prefer tests that exercise TypeScript and Rust library crates. Do not use Tauri build as the default verification unless explicitly needed.

## LLM Wiki Alignment

The Karpathy LLM Wiki pattern has three useful layers:

- Raw sources: immutable user-provided source assets.
- Wiki: LLM-maintained markdown knowledge pages.
- Schema: the instruction file that defines conventions and workflows.

For AlphaAiGraph, map that pattern like this:

- Raw sources -> `SourceAsset`.
- Wiki pages -> future `ConceptNote`, `KnowledgeDigest`, and exported markdown artifacts.
- Schema -> `AGENTS.md` plus product specs under `docs/superpowers/specs/`.
- Index/log -> later project-level knowledge digest and activity timeline.

Do not turn the product into a plain wiki. The wiki pattern supports long-term compounding knowledge; the main product surface remains the research workflow map.

## File Structure

Create or modify these files during implementation:

- Modify `src/types.ts`: add research-domain TypeScript types and keep legacy graph types only as compatibility/projection types.
- Create `src/research/fixtures.ts`: seed a project/PDF-style research object, session, map, nodes, markers, evidence, actions, jobs, and side inquiry examples.
- Create `src/research/projection.ts`: derive Obsidian-style relationship graph nodes and edges from research data.
- Create `src/research/researchAgent.ts`: generate first-layer maps and drill-down child nodes from source assets using deterministic local logic.
- Create `src/research/researchAgent.test.ts`: cover first-layer map generation, markers, evidence anchors, and drill-down expansion.
- Create `src/research/projection.test.ts`: cover relationship graph projection from research maps, evidence, execution runs, and concept notes.
- Modify `src/state/useKnowledgeApp.ts`: rename the state conceptually toward research workspace behavior while preserving exported hook name until UI migration is complete.
- Modify `src/components/LeftPanel.tsx`: show Agent, research object, source assets, sessions, threads, and current path.
- Modify `src/components/GraphCanvas.tsx`: render `ResearchNode` workflow map, marker badges, expansion state, and drill-down actions.
- Modify `src/components/AgentPanel.tsx`: show evidence, side inquiries, parallel jobs, candidate results, execution runs, and merge review.
- Modify `src/components/AppShell.tsx`: keep the three-column layout and route the center panel between workflow map and relationship graph projection.
- Modify `src/data/seed.ts`: either replace with research fixtures or re-export from `src/research/fixtures.ts`.
- Modify `src/agent/extract.ts`: demote old knowledge extraction to a helper for source scanning, not the main product flow.
- Modify `src/backend/tauriClient.ts`: normalize future Rust research payloads when backend support arrives; keep browser-local fallback working.
- Modify `crates/alpha_graph_core/src/lib.rs`: mirror the core research data model in Rust.
- Modify `crates/alpha_agent_harness/src/lib.rs`: emit research map/job/action oriented results instead of only graph nodes and relations.

## Milestone 1: Type System And Fixtures

### Task 1: Add Research Domain Types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add failing TypeScript usage through tests in later tasks**

Do not add a standalone compile-only test. The tests in `src/research/researchAgent.test.ts` and `src/research/projection.test.ts` will prove these types are usable.

- [ ] **Step 2: Add these type families**

Add these exported names to `src/types.ts`:

```ts
export type ResearchObjectKind = "project" | "codebase" | "pdf" | "document_collection" | "topic";
export type ResearchObjectStatus = "created" | "scanning" | "mapped" | "failed";
export type ResearchSessionStatus = "active" | "paused" | "completed" | "archived";
export type ResearchThreadKind = "main" | "source_analysis" | "node_deep_dive" | "parallel_batch" | "validation" | "comparison";
export type ResearchThreadStatus = "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
export type ResearchNodeKind = "root" | "module" | "section" | "file" | "concept" | "question" | "hypothesis" | "finding" | "risk" | "action" | "script" | "result" | "conclusion" | "evidence";
export type ResearchNodeStatus = "new" | "in_progress" | "understood" | "verified" | "deferred" | "blocked";
export type ResearchExpansionState = "not_expanded" | "expanding" | "expanded" | "failed";
export type AgentMarkerKind = "focus" | "difficulty" | "risk" | "recommended_drilldown" | "needs_validation" | "low_priority" | "uncertain" | "core_entry";
export type ResearchEdgeKind = "decomposes_to" | "depends_on" | "relates_to" | "supports" | "contradicts" | "evidence_for" | "next_step" | "validates" | "produces" | "explains";
export type SourceAssetKind = "project_directory" | "file" | "pdf" | "pdf_page" | "document" | "web_page" | "command_output";
export type ResearchActionKind = "drill_down" | "ask_question" | "inspect_source" | "analyze_source_asset" | "analyze_node_group" | "run_parallel_analysis" | "compare_sources" | "generate_script" | "run_command" | "summarize" | "mark_verified" | "create_side_inquiry";
export type AgentJobKind = "scan_source" | "generate_map" | "expand_node" | "summarize_source" | "extract_concepts" | "extract_evidence" | "compare_sources" | "generate_script" | "run_command" | "create_digest";
```

Add interfaces for `ResearchObject`, `ResearchSession`, `ResearchThread`, `ResearchMap`, `ResearchNode`, `AgentMarker`, `ResearchEdge`, `SourceAsset`, `EvidenceAnchor`, `ResearchAction`, `AgentJob`, `ParallelAnalysisGroup`, `ExecutionRun`, `SideInquirySession`, `InquiryMessage`, `ConceptNote`, `KnowledgeDigest`, `RelationshipGraphNode`, `RelationshipGraphEdge`, and `RelationshipGraph`.

- [ ] **Step 3: Run typecheck**

Run: `npm run build`

Expected: TypeScript build succeeds, or fails only because later tasks have not yet been applied. After Task 3, this command must pass.

### Task 2: Add Research Fixtures

**Files:**
- Create: `src/research/fixtures.ts`
- Modify: `src/data/seed.ts`

- [ ] **Step 1: Create deterministic fixtures**

Create `src/research/fixtures.ts` with one project-style object:

```ts
export const researchNow = "2026-05-09T00:00:00.000Z";
```

Include a root node titled `AlphaAiGraph 研究对象`, child nodes for `产品定位`, `研究工作流脑图`, `并行研究`, `旁路临时会话`, `证据与验证`, and `关系图谱投影`.

Each important child node must have at least one `AgentMarker`. Use `focus`, `difficulty`, `risk`, `recommended_drilldown`, and `needs_validation` at least once.

- [ ] **Step 2: Re-export fixtures**

In `src/data/seed.ts`, keep the legacy exports until the UI no longer imports them, but add exports from `src/research/fixtures.ts`.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: PASS.

## Milestone 2: Research Agent And Projection

### Task 3: Add Research Agent Tests

**Files:**
- Create: `src/research/researchAgent.test.ts`
- Create: `src/research/researchAgent.ts`

- [ ] **Step 1: Write failing tests**

Test cases:

```ts
import { describe, expect, it } from "vitest";
import { expandResearchNode, generateFirstLayerResearchMap } from "./researchAgent";

describe("researchAgent", () => {
  it("generates a first-layer research map with agent markers and evidence anchors", () => {
    const result = generateFirstLayerResearchMap({
      id: "object_test",
      kind: "project",
      title: "AlphaAiGraph",
      sourceAssets: [
        {
          id: "asset_spec",
          objectId: "object_test",
          kind: "document",
          title: "产品方向",
          uri: "docs/superpowers/specs/2026-05-09-alpha-ai-graph-agent-research-map.md",
          analysisState: "not_analyzed",
          metadata: {},
          createdAt: "2026-05-09T00:00:00.000Z"
        }
      ]
    });

    expect(result.map.nodes.some((node) => node.kind === "root")).toBe(true);
    expect(result.map.nodes.some((node) => node.markers.some((marker) => marker.kind === "focus"))).toBe(true);
    expect(result.map.nodes.some((node) => node.markers.some((marker) => marker.kind === "recommended_drilldown"))).toBe(true);
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.actions.some((action) => action.kind === "drill_down")).toBe(true);
  });

  it("expands one selected node without expanding the whole map", () => {
    const result = generateFirstLayerResearchMap({
      id: "object_test",
      kind: "project",
      title: "AlphaAiGraph",
      sourceAssets: []
    });
    const target = result.map.nodes.find((node) => node.title.includes("研究工作流"))!;
    const expanded = expandResearchNode(result.map, target.id);

    expect(expanded.nodes.filter((node) => node.parentId === target.id).length).toBeGreaterThan(1);
    expect(expanded.nodes.filter((node) => node.depth > target.depth + 1)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- src/research/researchAgent.test.ts`

Expected: FAIL because `researchAgent.ts` is not implemented.

- [ ] **Step 3: Implement deterministic local agent**

In `src/research/researchAgent.ts`, implement:

```ts
export function generateFirstLayerResearchMap(input: {
  id: string;
  kind: ResearchObjectKind;
  title: string;
  sourceAssets: SourceAsset[];
}): {
  object: ResearchObject;
  session: ResearchSession;
  thread: ResearchThread;
  map: ResearchMap;
  evidence: EvidenceAnchor[];
  actions: ResearchAction[];
  jobs: AgentJob[];
}
```

Also implement:

```ts
export function expandResearchNode(map: ResearchMap, nodeId: string): ResearchMap
```

The function must only add one child layer below the selected node and set the selected node `expansionState` to `expanded`.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/research/researchAgent.test.ts`

Expected: PASS.

### Task 4: Add Relationship Projection

**Files:**
- Create: `src/research/projection.ts`
- Create: `src/research/projection.test.ts`

- [ ] **Step 1: Write failing tests**

Test that `projectRelationshipGraph(...)` includes nodes for research object, research nodes, evidence anchors, execution runs, concept notes, and knowledge digests when provided.

- [ ] **Step 2: Implement projection**

Implement:

```ts
export function projectRelationshipGraph(input: {
  object: ResearchObject;
  session?: ResearchSession;
  maps: ResearchMap[];
  evidence: EvidenceAnchor[];
  executionRuns?: ExecutionRun[];
  conceptNotes?: ConceptNote[];
  knowledgeDigests?: KnowledgeDigest[];
}): RelationshipGraph
```

Projection rules:

- `ResearchObject` contains root map nodes.
- `ResearchNode` references attached `EvidenceAnchor`.
- `ResearchEdge` becomes a `RelationshipGraphEdge`.
- `ExecutionRun` validates its node.
- `ConceptNote` explains related nodes.
- `KnowledgeDigest` derives from included concept notes and research nodes.

- [ ] **Step 3: Run tests**

Run: `npm test -- src/research/projection.test.ts`

Expected: PASS.

## Milestone 3: Workspace State And UI Migration

### Task 5: Migrate State To Research Workspace

**Files:**
- Modify: `src/state/useKnowledgeApp.ts`

- [ ] **Step 1: Add research state beside legacy state**

Add state for `researchObject`, `researchSession`, `researchThreads`, `researchMap`, `sourceAssets`, `evidenceAnchors`, `researchActions`, `agentJobs`, `parallelGroups`, `executionRuns`, `sideInquiries`, `conceptNotes`, `knowledgeDigests`, and `relationshipGraph`.

- [ ] **Step 2: Add research actions**

Expose functions:

```ts
drillDownNode(nodeId: string): void
markResearchNode(nodeId: string, status: ResearchNodeStatus): void
createSideInquiry(nodeId: string, question: string): void
promoteSideInquiry(inquiryId: string): void
startParallelAnalysis(nodeIds: string[]): void
mergeCandidateNode(nodeId: string): void
```

- [ ] **Step 3: Preserve compatibility**

Keep existing `generateStudy`, `generateSynthesis`, `createExport`, and legacy graph exports working as secondary actions until their UI is demoted.

- [ ] **Step 4: Run existing tests**

Run: `npm test`

Expected: PASS.

### Task 6: Rework Left Panel

**Files:**
- Modify: `src/components/LeftPanel.tsx`

- [ ] **Step 1: Replace old navigation labels**

Use these primary labels: `研究地图`, `候选结果`, `资料`, `关系图谱`, `输出`.

- [ ] **Step 2: Show research object and threads**

Left panel must show:

- current `ResearchObject.title`
- active `ResearchSession.title`
- main thread status
- source asset count
- current selected research path

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: PASS.

### Task 7: Rework Graph Canvas As Research Workflow Map

**Files:**
- Modify: `src/components/GraphCanvas.tsx`

- [ ] **Step 1: Render `ResearchNode` and `ResearchEdge`**

Node labels come from `ResearchNode.title`. Node classes include `kind`, `status`, `expansionState`, and marker kinds.

- [ ] **Step 2: Add marker badges**

Display compact marker labels for `focus`, `difficulty`, `risk`, `recommended_drilldown`, and `needs_validation`.

- [ ] **Step 3: Add drill-down action**

Selected node detail must include a `深入研究` button when the node has an action of kind `drill_down`.

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: PASS.

### Task 8: Rework Right Panel For Evidence, Side Inquiry, Jobs, Merge Review

**Files:**
- Modify: `src/components/AgentPanel.tsx`

- [ ] **Step 1: Replace generic insight panel**

Right panel sections:

- evidence anchors for selected node
- suggested research actions
- side inquiry sessions
- parallel job queue
- candidate results waiting for merge
- execution runs

- [ ] **Step 2: Add side inquiry controls**

Allow creating a side inquiry from the selected node. The created session must not change node status or expand the map.

- [ ] **Step 3: Add candidate merge controls**

Candidate outputs must be visibly separate from merged research map nodes.

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: PASS.

## Milestone 4: Rust Core Alignment

### Task 9: Mirror Research Types In Rust

**Files:**
- Modify: `crates/alpha_graph_core/src/lib.rs`

- [ ] **Step 1: Add Rust enums and structs**

Add Rust equivalents for the TypeScript research model using `serde` and `#[serde(rename_all = "snake_case")]` where appropriate.

- [ ] **Step 2: Add Rust unit test**

Add a test that creates a `ResearchMap` with one root node, one child node, one `AgentMarker`, and one `EvidenceAnchor`.

- [ ] **Step 3: Run crate tests**

Run: `cargo test -p alpha_graph_core`

Expected: PASS.

### Task 10: Emit Research-Oriented Agent Results

**Files:**
- Modify: `crates/alpha_agent_harness/src/lib.rs`
- Modify: `src/backend/tauriClient.ts`
- Modify: `src/backend/tauriClient.test.ts`

- [ ] **Step 1: Add Rust result shape**

Add an agent result containing `research_map`, `evidence_anchors`, `actions`, `jobs`, and `events`.

- [ ] **Step 2: Add frontend normalization test**

Update `src/backend/tauriClient.test.ts` to verify snake_case Rust research payloads normalize into camelCase TypeScript research objects.

- [ ] **Step 3: Run tests**

Run: `npm test -- src/backend/tauriClient.test.ts`

Expected: PASS.

- [ ] **Step 4: Run Rust tests**

Run: `cargo test -p alpha_agent_harness`

Expected: PASS.

## Milestone 5: Verification And Finish

### Task 11: Full Verification

**Files:**
- No source edits unless verification exposes failures.

- [ ] **Step 1: TypeScript tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Frontend build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Rust tests**

Run: `cargo test --workspace`

Expected: PASS.

- [ ] **Step 4: Privacy check**

Run: `git status --short`

Expected: only intended source, test, and documentation files are changed. No files with names containing `key`, `secret`, `token`, `password`, `.env`, or private config are staged.

### Task 12: Product Acceptance Review

**Files:**
- Modify docs only if acceptance gaps are found.

- [ ] **Step 1: Check product behavior**

Confirm:

- first screen is a research workspace, not a marketing page
- center canvas is a research workflow map
- markers are visible on nodes
- selected node can drill down one layer
- evidence is visible beside selected node
- side inquiry does not modify the main map by default
- parallel outputs are candidates before merge
- relationship graph is derived from research data

- [ ] **Step 2: Check old-direction demotion**

Confirm Study, Synthesis, and Export are secondary actions, not the main product axis.

- [ ] **Step 3: Final commit boundary**

Before committing, inspect changed files and do not include secrets or private files.

Suggested commit sequence:

```bash
git add src/types.ts src/research src/data/seed.ts
git commit -m "feat: add research map domain model"

git add src/state src/components
git commit -m "feat: migrate workspace to research map flow"

git add crates/alpha_graph_core crates/alpha_agent_harness src/backend
git commit -m "feat: align agent harness with research maps"
```

## Acceptance Criteria

- The app's core vocabulary is research object, session, thread, map, node, marker, evidence, action, job, side inquiry, and relationship projection.
- `AgentMarker` carries focus, difficulty, risk, drill-down, validation, uncertainty, and priority guidance.
- `ResearchNode.kind` describes what the node is; it is not overloaded with marker concepts.
- The first generated map is high-level and progressively expandable.
- Side inquiries are isolated unless promoted.
- Parallel task outputs are candidates unless merged.
- The Obsidian-style graph is projected from research data.
- Existing browser-local mode still works.
- `npm test`, `npm run build`, and `cargo test --workspace` pass before claiming implementation complete.
