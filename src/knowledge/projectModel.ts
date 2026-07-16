import type {
  AnalysisSubject,
  KnowledgeGraph,
  Project,
  ProjectMode,
  ProjectSubject,
  ProjectWorkflowState,
  SubjectKind
} from "../types";

export const projectModelNow = "2026-07-14T00:00:00.000Z";

export const projectModeLabels: Record<ProjectMode, string> = {
  understand: "搞清楚一个东西",
  systematize: "梳理与完善知识体系",
  research: "研究问题并形成结论"
};

export const subjectKindLabels: Record<SubjectKind, string> = {
  technology: "技术",
  document: "文档",
  paper: "论文",
  codebase: "代码库",
  industry: "行业",
  topic: "主题",
  question: "问题"
};

export interface CreateProjectRecordInput {
  id: string;
  spaceId: string;
  graphId: string;
  mode: ProjectMode;
  title: string;
  goal?: string;
  subject: ProjectSubject;
  parentProjectId?: string;
  derivedFromNodeId?: string;
}

export function initialProjectWorkflow(mode: ProjectMode): ProjectWorkflowState {
  if (mode === "systematize") return { mode, phase: "inventory" };
  if (mode === "research") return { mode, phase: "brief" };
  return { mode, phase: "mapping" };
}

export function defaultProjectGoal(mode: ProjectMode, title: string) {
  if (mode === "systematize") return `梳理、验证并完善「${title}」的已有知识体系。`;
  if (mode === "research") return `围绕「${title}」开展研究，并形成可追溯的结论。`;
  return `理解「${title}」的核心概念、关系和边界。`;
}

export function defaultCompletionCriteria(mode: ProjectMode) {
  if (mode === "systematize") return ["关键知识已结构化", "高影响缺口和错误已处理", "剩余争议已明确记录"];
  if (mode === "research") return ["核心问题已回答", "支持与反对证据已处理", "用户接受研究结论"];
  return ["用户确认已理解到所需深度"];
}

export function createProjectRecord(input: CreateProjectRecordInput): Project {
  return {
    id: input.id,
    spaceId: input.spaceId,
    graphId: input.graphId,
    mode: input.mode,
    title: input.title,
    goal: input.goal?.trim() || defaultProjectGoal(input.mode, input.subject.title),
    subject: input.subject,
    status: "active",
    workflow: initialProjectWorkflow(input.mode),
    completionCriteria: defaultCompletionCriteria(input.mode),
    parentProjectId: input.parentProjectId,
    derivedFromNodeId: input.derivedFromNodeId,
    createdAt: projectModelNow,
    updatedAt: projectModelNow
  };
}

export function toProjectSubject(subject: AnalysisSubject): ProjectSubject {
  return {
    id: subject.id,
    kind: subject.kind,
    title: subject.title,
    description: subject.description,
    rootNodeId: subject.rootNodeId,
    sourceAssetIds: subject.sourceAssetIds
  };
}

export function validateProjectContract(project: Project, graph: KnowledgeGraph): string[] {
  const errors: string[] = [];
  if (project.workflow.mode !== project.mode) errors.push("workflow mode must match project mode");
  if (project.graphId !== graph.id) errors.push("project graphId must reference the active knowledge graph");
  if (!graph.nodes.some((node) => node.id === project.subject.rootNodeId)) errors.push("subject rootNodeId must exist in the knowledge graph");
  if (project.status === "completed" && !project.completedAt) errors.push("completed project must record completedAt");
  if (project.status === "completed" && project.workflow.phase !== "completed") errors.push("completed project workflow must be completed");
  if ((project.status === "active" || project.status === "reopened") && project.workflow.phase === "completed") {
    errors.push("writable project workflow must not remain completed");
  }
  if (!project.goal.trim()) errors.push("project goal must not be empty");
  return errors;
}
