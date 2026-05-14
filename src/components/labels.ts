import type { AgentJobStatus, AgentMarkerKind, CandidateStatus } from "../types";

export function markerLabel(kind: AgentMarkerKind): string {
  const labels: Record<AgentMarkerKind, string> = {
    focus: "重点",
    difficulty: "难点",
    risk: "风险",
    recommended_drilldown: "建议下钻",
    needs_validation: "待验证",
    low_priority: "低优先级",
    uncertain: "不确定",
    core_entry: "核心入口",
  };
  return labels[kind];
}

export function jobStatusLabel(status: AgentJobStatus): string {
  const labels: Record<AgentJobStatus, string> = {
    queued: "排队中",
    running: "运行中",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
  };
  return labels[status];
}

export function candidateStatusLabel(status: CandidateStatus): string {
  const labels: Record<CandidateStatus, string> = {
    pending_review: "待审核",
    needs_review: "需要复核",
    merged: "已合并",
    dismissed: "已忽略",
  };
  return labels[status];
}

export function contextPolicyLabel(policy: string): string {
  const labels: Record<string, string> = {
    local_node: "当前节点",
    current_branch: "当前分支",
    whole_project: "全项目",
  };
  return labels[policy] ?? policy;
}
