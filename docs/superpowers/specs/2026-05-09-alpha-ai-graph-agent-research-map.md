# AlphaAiGraph AI Agent Research Map Product Direction

> 历史状态：V1 产品方向归档，不是当前实现依据。当前唯一产品方向见 `2026-07-13-alpha-ai-graph-product-philosophy.md`，当前工程 contract 见 `2026-07-14-alpha-ai-graph-project-model-alignment.md`。本文继续保留作为迁移审计和搜索 benchmark 语料。

Date: 2026-05-09

## Positioning

AlphaAiGraph is an AI Agent research graph product.

The product is not a plain knowledge graph, a PDF summarizer, a generic mind-map tool, or a chat-first assistant. Its main purpose is to let an AI Agent analyze a complex object, generate a progressive research workflow map, guide the user with priorities and difficulty markers, and preserve the research process as a long-term Obsidian-like relationship graph.

The complex object can be:

- a project or engineering repository
- a codebase
- a PDF
- a document collection
- a technical plan
- a knowledge-system question

The central user feeling should be:

> I give AlphaAiGraph a complex thing. The AI Agent builds a research map, shows what matters, marks what is hard or risky, suggests where to drill down, and lets me choose the research path.

## Core Product Loop

AlphaAiGraph should follow this loop:

```text
Input complex object
  -> AI Agent analyzes it
  -> AI generates the first-layer research workflow map
  -> AI marks focus areas, difficulty, risks, recommended drill-down points, and validation points
  -> User chooses a node to investigate
  -> AI expands that node into the next layer
  -> User asks questions, checks evidence, runs validation scripts, or records conclusions
  -> Results are written back to the research map
  -> Durable relationships are accumulated in a global graph
```

This is progressive research. The AI should not try to fully analyze the entire project or PDF at once. The first output should be a useful high-level map. Depth is controlled by the user.

## Two Graph Surfaces

AlphaAiGraph has two related graph surfaces.

### Research Workflow Map

This is the main working canvas for the current research session. It answers:

- how should I understand this project, PDF, or topic?
- which parts are important?
- which parts are difficult?
- which parts should be validated?
- where should I drill down next?

Typical nodes:

- root research object
- module or section
- question
- hypothesis
- focus area
- risk
- evidence
- action
- script or test
- result
- conclusion

Each node can carry state:

- whether it has been expanded
- whether it is important
- whether it is difficult
- whether it is risky
- whether it is recommended for drill-down
- whether it needs validation
- whether it has evidence
- whether it has an executable action
- whether it is understood, verified, or still pending

### Obsidian-Style Relationship Graph

This is the long-term relationship network. It answers:

- how do projects, files, modules, chapters, concepts, questions, evidence, tests, and conclusions connect?
- which nodes are central?
- which findings depend on which evidence?
- which areas remain isolated or unresolved?

The relationship graph is not the same as the research workflow map. The workflow map represents the current research process. The relationship graph represents durable knowledge and evidence connections discovered through research.

## AI Agent Role

The AI Agent is a research guide and execution assistant, not a passive chat box.

It should:

- inspect projects, PDFs, and document collections
- generate the first-layer research map automatically
- mark important, difficult, risky, recommended, and validation-worthy nodes
- explain why a node is marked that way
- expand a selected node into a deeper layer on demand
- answer node-scoped questions
- connect claims to evidence
- suggest validation actions
- generate scripts or tests when useful
- run or record validation results when execution is allowed
- write findings and conclusions back to the graph
- maintain durable relationships for the Obsidian-like graph

The Agent should assist user judgment rather than force a fixed workflow. It should say, in product behavior:

```text
This looks central.
This part is hard.
This area has risk.
This node is worth validating.
This can probably be skipped for now.
If you want to go deeper, expand this node.
```

## User Role

The user should not start from a blank mind map, and should not be pushed through a rigid workflow. The user chooses the research route from the AI-generated map.

The user can:

- drill into an important node
- skip a low-priority node
- focus on a difficult area
- inspect evidence
- ask questions about a specific node
- ask the AI to redraw or reframe a map
- generate a validation script
- run or review test results
- mark a node as understood, verified, pending, or deferred

## Parallel Research

AlphaAiGraph should support multi-threaded research inside one project.

This means:

- one project can contain many documents, PDFs, folders, files, and generated artifacts
- each source can have its own research map or research branch
- one research map can run several node analyses in parallel
- one document node can fan out into parallel section summaries, concept extraction, evidence checks, or command runs
- command execution, script generation, evidence extraction, and node expansion can run concurrently when they do not depend on each other

Parallel research must not mean uncontrolled context mixing. Each parallel branch should have an explicit scope, inputs, status, and merge policy. Results from a parallel branch should first land as candidate findings, candidate nodes, candidate evidence, or execution results. The user or a merge policy decides what becomes part of the main research map.

Typical examples:

```text
Project research
  -> analyze README, backend docs, frontend docs, API docs in parallel
  -> each document gets its own branch or map
  -> shared concepts and contradictions are projected into the relationship graph

PDF research
  -> split into chapter nodes
  -> run summary, concept extraction, and risk extraction in parallel
  -> merge selected results into the document research map

Codebase research
  -> inspect architecture, tests, dependency graph, and command entrypoints in parallel
  -> attach command outputs to the nodes that requested them
```

## Data Model

The data model should be designed from the new research-agent product direction, not from the older knowledge-graph or study-card direction. The core sentence is:

> An AI Agent researches a complex object, generates a progressive research workflow map, and preserves the process as a relationship graph.

### Research Object

`ResearchObject` is the thing the user gives to AlphaAiGraph for investigation.

```ts
type ResearchObjectKind =
  | "project"
  | "codebase"
  | "pdf"
  | "document_collection"
  | "topic";

interface ResearchObject {
  id: string;
  kind: ResearchObjectKind;
  title: string;
  description?: string;
  rootUri?: string;
  createdAt: string;
  updatedAt: string;
  status: "created" | "scanning" | "mapped" | "failed";
  metadata: Record<string, string>;
}
```

Examples include an engineering project, a codebase, a PDF, a document collection, or a knowledge-system question.

### Research Session

`ResearchSession` represents one research run against a `ResearchObject`. The same object can have multiple sessions, such as architecture understanding, test-system analysis, module risk review, or refactor planning.

```ts
interface ResearchSession {
  id: string;
  objectId: string;
  title: string;
  goal?: string;
  activeMapId: string;
  activeThreadIds: string[];
  status: "active" | "paused" | "completed" | "archived";
  createdAt: string;
  updatedAt: string;
}
```

### Research Thread

`ResearchThread` is a scoped lane of work inside a research session. It lets the user analyze multiple documents, branches, or node groups in parallel without mixing every result into the main flow immediately.

```ts
type ResearchThreadKind =
  | "main"
  | "source_analysis"
  | "node_deep_dive"
  | "parallel_batch"
  | "validation"
  | "comparison";

interface ResearchThread {
  id: string;
  sessionId: string;
  mapId: string;
  parentThreadId?: string;
  kind: ResearchThreadKind;
  title: string;
  goal?: string;
  focusNodeIds: string[];
  sourceAssetIds: string[];
  jobIds: string[];
  mergePolicy: "manual_review" | "auto_attach_evidence" | "auto_create_candidates";
  status: "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
}
```

Thread rules:

- the main thread is the user's current research path
- side threads can analyze documents, sections, modules, node groups, or validation tasks
- side-thread outputs should be treated as candidates until merged
- each thread should show progress, source scope, and resulting artifacts
- threads may share evidence into the relationship graph, but should not silently rewrite the main map

### Research Map

`ResearchMap` is the current research workflow mind map. It is the main artifact of an active research session.

```ts
interface ResearchMap {
  id: string;
  sessionId: string;
  title: string;
  rootNodeId: string;
  nodes: ResearchNode[];
  edges: ResearchEdge[];
  createdAt: string;
  updatedAt: string;
}
```

### Research Node

`ResearchNode` is the core model. A node is a research unit, not a generic knowledge point.

```ts
type ResearchNodeKind =
  | "root"
  | "module"
  | "section"
  | "file"
  | "concept"
  | "question"
  | "hypothesis"
  | "finding"
  | "risk"
  | "action"
  | "script"
  | "result"
  | "conclusion"
  | "evidence";

interface ResearchNode {
  id: string;
  mapId: string;
  parentId?: string;
  kind: ResearchNodeKind;
  title: string;
  summary: string;
  detail?: string;
  depth: number;
  order: number;
  expansionState: "not_expanded" | "expanding" | "expanded" | "failed";
  status: "new" | "in_progress" | "understood" | "verified" | "deferred" | "blocked";
  markers: AgentMarker[];
  evidenceIds: string[];
  actionIds: string[];
  inquiryIds: string[];
  conceptNoteIds: string[];
  createdBy: "agent" | "user" | "system";
  createdAt: string;
  updatedAt: string;
}
```

Model rules:

- `kind` says what the node is.
- `status` says where the research process is.
- `expansionState` says whether the node has been drilled into.
- `markers` carry the AI Agent's guidance.
- `inquiryIds` and `conceptNoteIds` support side inquiries and knowledge digestion.

Difficulty should not be a node kind. Difficulty is a marker because a module, section, concept, or risk can all be difficult.

### Agent Marker

`AgentMarker` is how the AI Agent expresses guidance such as focus, difficulty, risk, drill-down recommendation, validation need, or low priority. This model carries the "assistant awareness" requirement.

```ts
type AgentMarkerKind =
  | "focus"
  | "difficulty"
  | "risk"
  | "recommended_drilldown"
  | "needs_validation"
  | "low_priority"
  | "uncertain"
  | "core_entry";

interface AgentMarker {
  id: string;
  kind: AgentMarkerKind;
  label: string;
  reason: string;
  confidence: number;
  severity?: "low" | "medium" | "high";
}
```

Examples:

```text
Frontend/backend boundary
  marker: focus
  reason: This is the key runtime boundary in the Tauri app.

Rust Agent Harness
  marker: difficulty
  reason: It coordinates analysis and execution across multiple crates.

Test system
  marker: needs_validation
  reason: Current behavior should be confirmed by running the tests.
```

### Research Edge

`ResearchEdge` represents relationships inside the research workflow map.

```ts
type ResearchEdgeKind =
  | "decomposes_to"
  | "depends_on"
  | "relates_to"
  | "supports"
  | "contradicts"
  | "evidence_for"
  | "next_step"
  | "validates"
  | "produces"
  | "explains";

interface ResearchEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: ResearchEdgeKind;
  label?: string;
  confidence: number;
  createdBy: "agent" | "user" | "system";
  createdAt: string;
}
```

Examples:

```text
Project root --decomposes_to--> Frontend module
Test script --validates--> Hypothesis
Execution result --produces--> Conclusion
Concept note --explains--> Module
Evidence anchor --evidence_for--> Risk
```

### Source Asset

`SourceAsset` represents original material or generated source-like artifacts.

```ts
type SourceAssetKind =
  | "project_directory"
  | "file"
  | "pdf"
  | "pdf_page"
  | "document"
  | "web_page"
  | "command_output";

interface SourceAsset {
  id: string;
  objectId: string;
  parentAssetId?: string;
  kind: SourceAssetKind;
  title: string;
  uri: string;
  analysisState: "not_analyzed" | "queued" | "analyzing" | "analyzed" | "failed";
  defaultMapId?: string;
  contentHash?: string;
  metadata: Record<string, string>;
  createdAt: string;
}
```

For a project research object, each PDF, Markdown file, source file, API document, generated command output, or extracted PDF page can be represented as a `SourceAsset`. This lets one project contain many independently analyzable documents while still preserving one shared relationship graph.

### Evidence Anchor

`EvidenceAnchor` is a locatable piece of evidence. It can point to a PDF page, code line range, document paragraph, command output, or web excerpt.

```ts
interface EvidenceAnchor {
  id: string;
  objectId: string;
  sourceAssetId: string;
  uri: string;
  title?: string;
  quote?: string;
  text?: string;
  reason: string;
  page?: number;
  lineStart?: number;
  lineEnd?: number;
  createdAt: string;
}
```

### Research Action

`ResearchAction` represents something the user or AI Agent can do from a node.

```ts
type ResearchActionKind =
  | "drill_down"
  | "ask_question"
  | "inspect_source"
  | "analyze_source_asset"
  | "analyze_node_group"
  | "run_parallel_analysis"
  | "compare_sources"
  | "generate_script"
  | "run_command"
  | "summarize"
  | "mark_verified"
  | "create_side_inquiry";

interface ResearchAction {
  id: string;
  nodeId: string;
  kind: ResearchActionKind;
  title: string;
  description: string;
  proposedCommand?: string;
  proposedScript?: string;
  status: "suggested" | "approved" | "running" | "completed" | "failed" | "dismissed";
  createdBy: "agent" | "user" | "system";
  createdAt: string;
  updatedAt: string;
}
```

AI may propose commands or scripts, but execution should require explicit user approval in the first implementation.

### Agent Job

`AgentJob` is the unit of asynchronous or parallel agent work. A job may analyze a source asset, expand a node, extract evidence, generate a script, run a command, compare documents, or create a knowledge digest.

```ts
type AgentJobKind =
  | "scan_source"
  | "generate_map"
  | "expand_node"
  | "summarize_source"
  | "extract_concepts"
  | "extract_evidence"
  | "compare_sources"
  | "generate_script"
  | "run_command"
  | "create_digest";

interface AgentJob {
  id: string;
  sessionId: string;
  threadId?: string;
  mapId?: string;
  nodeIds: string[];
  sourceAssetIds: string[];
  actionId?: string;
  kind: AgentJobKind;
  title: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  priority: "low" | "normal" | "high";
  dependsOnJobIds: string[];
  outputNodeIds: string[];
  outputEvidenceIds: string[];
  outputRunIds: string[];
  outputDigestIds: string[];
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
}
```

### Parallel Analysis Group

`ParallelAnalysisGroup` groups related jobs that should be launched and reviewed together.

```ts
type ParallelAnalysisMode =
  | "fan_out"
  | "compare"
  | "validation_batch"
  | "evidence_sweep";

interface ParallelAnalysisGroup {
  id: string;
  sessionId: string;
  mapId: string;
  threadId?: string;
  title: string;
  mode: ParallelAnalysisMode;
  inputNodeIds: string[];
  inputSourceAssetIds: string[];
  jobIds: string[];
  mergePolicy: "manual_review" | "auto_attach_evidence" | "auto_create_candidates";
  status: "queued" | "running" | "ready_to_review" | "merged" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
}
```

Parallel group rules:

- parallel work should be visible as a group, not hidden background activity
- jobs in the same group can complete independently
- failed jobs should not block unrelated successful jobs from being reviewed
- merge should preserve provenance: which job produced which node, evidence, run, or conclusion
- user-facing UI should make it clear which results are candidates and which have been merged

### Execution Run

`ExecutionRun` stores the actual result of running a script, command, check, or test.

```ts
interface ExecutionRun {
  id: string;
  jobId?: string;
  actionId: string;
  nodeId: string;
  command?: string;
  script?: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "passed" | "failed" | "cancelled";
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  resultSummary: string;
  evidenceId?: string;
}
```

### Side Inquiry Session

`SideInquirySession` supports temporary concept or clarification conversations without polluting the main research context.

```ts
type InquiryContextPolicy =
  | "local_node"
  | "current_branch"
  | "whole_project";

interface SideInquirySession {
  id: string;
  researchSessionId: string;
  sourceNodeId?: string;
  title: string;
  triggerText: string;
  initialQuestion: string;
  contextPolicy: InquiryContextPolicy;
  status: "open" | "resolved" | "discarded" | "promoted";
  messages: InquiryMessage[];
  createdAt: string;
  updatedAt: string;
}

interface InquiryMessage {
  id: string;
  inquiryId: string;
  role: "user" | "agent" | "system";
  content: string;
  createdAt: string;
}
```

Side inquiries must be isolated by default:

- they do not modify the main research map
- they do not change node status
- they do not trigger drill-down
- they do not pollute the main Agent research path

Only explicit user promotion can turn a side inquiry into a node note, concept note, evidence item, or relationship-graph entry.

### Concept Note

`ConceptNote` is a promoted side inquiry or project knowledge note.

```ts
interface ConceptNote {
  id: string;
  objectId: string;
  sourceInquiryId?: string;
  title: string;
  summary: string;
  explanation: string;
  relatedNodeIds: string[];
  evidenceIds: string[];
  status: "draft" | "accepted" | "archived";
  createdAt: string;
  updatedAt: string;
}
```

Concept notes can appear in the Obsidian-style relationship graph, but they do not have to become part of the active workflow map.

### Knowledge Digest

`KnowledgeDigest` is a project knowledge organization artifact created by the user or AI Agent from scattered research nodes, side inquiries, evidence, and conclusions.

```ts
interface KnowledgeDigest {
  id: string;
  objectId: string;
  scope: "project" | "session" | "branch" | "node" | "inquiries";
  title: string;
  summary: string;
  conceptNoteIds: string[];
  researchNodeIds: string[];
  unresolvedQuestionIds: string[];
  createdAt: string;
}
```

It can organize:

- key concepts
- important module explanations
- common questions
- verified conclusions
- unresolved research questions
- relationships among concepts

### Relationship Graph

The Obsidian-style relationship graph should be a projected view in the first implementation, not a second source of truth.

```ts
type RelationshipGraphNodeKind =
  | "research_object"
  | "research_node"
  | "source_asset"
  | "evidence"
  | "concept_note"
  | "execution_run"
  | "knowledge_digest";

interface RelationshipGraphNode {
  id: string;
  sourceId: string;
  kind: RelationshipGraphNodeKind;
  title: string;
  summary?: string;
  weight?: number;
  tags: string[];
}

interface RelationshipGraphEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relation:
    | "contains"
    | "references"
    | "supports"
    | "contradicts"
    | "explains"
    | "depends_on"
    | "derived_from"
    | "validated_by"
    | "related_to";
  confidence?: number;
}

interface RelationshipGraph {
  id: string;
  objectId: string;
  sessionId?: string;
  generatedFromMapIds: string[];
  nodes: RelationshipGraphNode[];
  edges: RelationshipGraphEdge[];
  generatedAt: string;
}
```

Projection sources:

- `ResearchObject`
- `ResearchThread`
- `ResearchNode`
- `ResearchEdge`
- `EvidenceAnchor`
- `ConceptNote`
- `AgentJob`
- `ExecutionRun`
- `KnowledgeDigest`

Primary data lives in `ResearchMap`. The relationship graph is derived from the research data to avoid synchronizing two graph models.

### Data Model Principles

1. `ResearchObject` is what is being studied.
2. `ResearchSession` is one research run.
3. `ResearchThread` is a scoped lane for parallel or branch research.
4. `ResearchMap` is the current workflow mind map.
5. `ResearchNode` is the research unit.
6. `AgentMarker` is AI guidance, not node type.
7. `SourceAsset` lets one project contain many analyzable documents or files.
8. `EvidenceAnchor` keeps claims traceable.
9. `ResearchAction` describes what can be done from a node.
10. `AgentJob` is the async or parallel work unit.
11. `ParallelAnalysisGroup` groups jobs launched and reviewed together.
12. `ExecutionRun` records validation results.
13. `SideInquirySession` protects the main research flow from temporary questions.
14. `ConceptNote` and `KnowledgeDigest` preserve useful side knowledge.
15. The Obsidian-style relationship graph is a derived view, not a parallel primary store.

## Example: Project Research

When the input is a code project, the first layer might be:

```text
Project root
  -> Architecture entry points [focus]
  -> Frontend workspace [focus]
  -> Backend or agent harness [difficulty]
  -> Data model [recommended drill-down]
  -> Test system [needs validation]
  -> Startup flow [executable]
  -> Risks [risk]
```

If the user drills into the backend or agent harness node, the next layer might be:

```text
Agent harness
  -> Ingest
  -> Chunk
  -> Extract
  -> Link
  -> Critique
  -> Suggest
  -> Frontend/backend boundary
  -> Existing tests
  -> Potential risks
```

If the user drills into `Extract`, the next layer might be:

```text
Extract
  -> Input shape
  -> Rule-based extraction logic
  -> Concept dictionary
  -> Relation triggers
  -> Difference from fallback pipeline
  -> Tests worth adding
```

## Example: PDF Research

When the input is a PDF, the first layer might be:

```text
PDF root
  -> Table of contents
  -> Core themes [focus]
  -> Key arguments [recommended drill-down]
  -> Difficult chapters [difficulty]
  -> Terminology system
  -> Author assumptions
  -> Evidence chain
  -> Suggested reading order
```

If the user drills into key arguments, the next layer might be:

```text
Key arguments
  -> Argument A
  -> Argument B
  -> Supporting evidence
  -> Counterexamples
  -> Follow-up questions
  -> Interim summary
```

## Interface Direction

The product should use a three-panel research workspace:

```text
Left: Agent, research object, source assets, sessions, research threads, and current research path
Center: research workflow map, the main working canvas, with running nodes and candidate results visible
Right: source material, PDF/code/evidence, side inquiries, parallel job queue, execution results, and merge review
```

There should also be an Obsidian-style global relationship graph view. It can be a canvas mode or a separate view, but it must be conceptually distinct from the active research workflow map.

Parallel research UI requirements:

- users can start parallel analysis from a document, a node, a selected node group, or a source group
- running jobs should be visible with status, scope, and produced artifacts
- candidate nodes, evidence, findings, and command results should be reviewable before merge
- users can cancel, retry, or ignore individual failed jobs without losing successful jobs in the same group
- merged results should preserve provenance back to the source asset, thread, job, command, and evidence

## Change From Current Direction

The earlier AlphaAiGraph implementation leaned toward:

```text
source material -> knowledge nodes -> relations -> study cards / synthesis / export
```

The new direction is:

```text
project/PDF/materials
  -> AI Agent research workflow map
  -> focus/difficulty/risk/drill-down guidance
  -> user-selected progressive analysis
  -> evidence, validation, results, conclusions
  -> Obsidian-style durable relationship graph
```

Study mode, synthesis mode, and export can remain as supporting actions, but they should not be the center of the product. They should become node or graph actions inside the research workflow.

## Product Definition

AlphaAiGraph is an AI Agent driven progressive research graph product. Users input a project, PDF, or material collection. The AI Agent automatically generates a research workflow map, marks focus areas, difficulties, risks, validation points, and recommended drill-down nodes. The user chooses the research path. The AI expands selected nodes layer by layer, answers questions, links evidence, generates or records validation actions, and preserves the research process as an Obsidian-like long-term relationship graph.

The product must also support parallel research: a project may contain many source assets, one session may contain multiple research threads, and one map may launch multiple agent jobs or command runs at the same time. Parallel outputs are candidates until reviewed or merged by policy.
