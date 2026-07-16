import type { KnowledgeNodeKind } from "../types";

export type KnowledgeNodeCategory = "structure" | "epistemic" | "capability" | "decision";
export type KnowledgeSourcePolicy = "optional" | "required" | "required_when_verified";

export interface KnowledgeNodeKindDefinition {
  label: string;
  category: KnowledgeNodeCategory;
  sourcePolicy: KnowledgeSourcePolicy;
  description: string;
}

export const knowledgeNodeKindDefinitions: Record<KnowledgeNodeKind, KnowledgeNodeKindDefinition> = {
  subject: { label: "分析对象", category: "structure", sourcePolicy: "optional", description: "认知、体系构建或研究对象。" },
  topic: { label: "主题", category: "structure", sourcePolicy: "optional", description: "组织知识的主题或目录节点。" },
  concept: { label: "概念", category: "structure", sourcePolicy: "optional", description: "具有定义和边界的概念。" },
  fact: { label: "事实", category: "epistemic", sourcePolicy: "required", description: "可直接追溯到原始来源的事实陈述。" },
  claim: { label: "主张", category: "epistemic", sourcePolicy: "required_when_verified", description: "需要证据支持、反驳或修正的判断。" },
  evidence: { label: "证据", category: "epistemic", sourcePolicy: "required", description: "带原文定位、用于支持或反对判断的材料。" },
  question: { label: "问题", category: "epistemic", sourcePolicy: "optional", description: "需要回答或继续调查的问题。" },
  hypothesis: { label: "假设", category: "epistemic", sourcePolicy: "optional", description: "尚待验证的解释或预测。" },
  inference: { label: "推理", category: "epistemic", sourcePolicy: "required_when_verified", description: "从事实、证据或其他判断导出的推理步骤。" },
  synthesis: { label: "综合", category: "epistemic", sourcePolicy: "optional", description: "阶段性汇总和结构化理解。" },
  conclusion: { label: "结论", category: "epistemic", sourcePolicy: "required_when_verified", description: "经过推理和证据检查形成的结论。" },
  uncertainty: { label: "不确定性", category: "epistemic", sourcePolicy: "optional", description: "证据缺口、冲突或适用范围不明。" },
  skill: { label: "技能", category: "capability", sourcePolicy: "optional", description: "可以学习、掌握和评估的能力。" },
  practice: { label: "实践", category: "capability", sourcePolicy: "optional", description: "方法、流程或可复用实践。" },
  experience: { label: "经验", category: "capability", sourcePolicy: "optional", description: "个人经验、项目案例或情境知识。" },
  goal: { label: "目标", category: "decision", sourcePolicy: "optional", description: "研究或决策需要达成的目标。" },
  criterion: { label: "决策标准", category: "decision", sourcePolicy: "optional", description: "比较候选方案的标准。" },
  constraint: { label: "约束", category: "decision", sourcePolicy: "optional", description: "限制可行空间的硬约束或边界。" },
  route_option: { label: "路线候选", category: "decision", sourcePolicy: "optional", description: "可比较的技术或行动路线。" },
  decision: { label: "决策", category: "decision", sourcePolicy: "required_when_verified", description: "在目标、约束和证据基础上的选择。" },
  route_step: { label: "路线步骤", category: "decision", sourcePolicy: "optional", description: "路线中的可执行步骤。" }
};

export const knowledgeNodeKindLabels = Object.fromEntries(
  Object.entries(knowledgeNodeKindDefinitions).map(([kind, definition]) => [kind, definition.label])
) as Record<KnowledgeNodeKind, string>;
