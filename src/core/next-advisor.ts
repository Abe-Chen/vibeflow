import { RunState } from './run.js';

/** 一次"下一步建议"。command 已是可直接复制的完整 vibeflow 命令。 */
export interface NextAdvice {
  /** 一句话当前处境 */
  headline: string;
  /** 建议命令（0~N 条，按推荐顺序） */
  commands: string[];
  /** 为什么是这一步 */
  reason: string;
  /** 任务是否已收尾（done / delivered）。delivered 仍可续接 develop */
  finished: boolean;
}

/** stageId（下划线）→ CLI 子命令（横线） */
function cli(stageId: string): string {
  return stageId.replace(/_/g, '-');
}

/** 轮到某阶段时的一句话说明（给非开发者看的人话） */
const STAGE_HINT: Record<string, string> = {
  requirement: '整理需求、生成需求文档',
  plan: '出一版技术方案',
  plan_review: '换一个模型评审方案、挑问题',
  finalize: '吸收评审意见，定稿并锁定方案',
  develop: '按锁定方案改代码',
  code_review: '换一个模型读真代码、抓回归',
  fix: '按评审意见修复',
  test: '跑测试 / 产出验收',
  archive: '生成上线说明，收尾',
};

function hintOf(stageId: string): string {
  return STAGE_HINT[stageId] ?? stageId;
}

/**
 * 纯函数：根据 run.json 状态推断"下一步该做什么"。不读文件、不调模型，便于复用与测试。
 */
export function adviseNext(state: RunState): NextAdvice {
  // 1) 已收尾的任务
  if (state.status === 'done') {
    return {
      headline: '任务已全部完成 🎉',
      commands: ['vibeflow change-request -m "<变更原因>"'],
      reason: '所有阶段已完成。如还要改：在锁定方案内改代码用 change-request；要推翻某阶段/方案用 <阶段> --force。',
      finished: true,
    };
  }
  if (state.status === 'delivered') {
    return {
      headline: '方案已交付 📦（可继续开发）',
      commands: ['vibeflow develop'],
      reason: '方案已锁定并交付。随时 develop 续接，任务状态会自动回到进行中。',
      finished: true,
    };
  }

  // 1.5) 探索池状态优先引导（awaiting_accept / failed）
  if (state.explore?.status === 'awaiting_accept') {
    const candidates = state.explore.artifacts.filter(
      (a) => (a.kind === 'plan' || a.kind === 'synthesis') && a.status === 'ready',
    );
    return {
      headline: '探索池等待选择正式方案',
      commands: [`vibeflow accept-plan ${candidates[0]?.id ?? '<id>'}`],
      reason: `已有 ${candidates.length} 个候选。选定一份进入 plan-review；或 consult / synthesize 继续探索，plan --force 放弃探索。`,
      finished: false,
    };
  }
  if (state.explore?.status === 'failed') {
    return {
      headline: '多模型出方案全部失败',
      commands: ['vibeflow plan --multi --force'],
      reason: '本批探索全部失败，可重试或换 --models；或 vibeflow plan --force 回单方案。',
      finished: false,
    };
  }

  // 2) 定位当前阶段（current_stage 优先；兜底取第一个未完成阶段）
  const current = state.stages.find((s) => s.id === state.current_stage)
    ?? state.stages.find((s) => s.status !== 'completed' && s.status !== 'skipped');

  if (!current) {
    return {
      headline: '所有阶段都已完成，但任务尚未收尾',
      commands: ['vibeflow advance'],
      reason: '建议 advance 收尾；若状态异常可检查 run.json。',
      finished: false,
    };
  }

  const c = cli(current.id);
  const isHumanGate = Boolean(current.human_gate);
  const isCodeStage = current.id === 'develop' || current.id === 'fix';

  switch (current.status) {
    case 'pending': {
      // requirement 还没跑时需要带上需求输入
      if (current.id === 'requirement') {
        return {
          headline: '下一步：整理需求',
          commands: ['vibeflow requirement -m "<你的需求描述>"'],
          reason: '任务刚创建，先把需求讲清楚（也可用 --from-file / --edit 输入）。',
          finished: false,
        };
      }
      return {
        headline: `下一步：${c}`,
        commands: [`vibeflow ${c}`],
        reason: `轮到「${current.role}」${hintOf(current.id)}。`,
        finished: false,
      };
    }

    case 'in_progress': {
      if (isHumanGate) {
        if (current.id === 'finalize') {
          return {
            headline: '等待人工确认：方案定稿（finalize）',
            commands: ['vibeflow advance', 'vibeflow deliver'],
            reason: '方案已生成、待你确认。检查无误后 advance 继续开发；若只要这份方案、本轮不编码，用 deliver 收尾。',
            finished: false,
          };
        }
        return {
          headline: `等待人工确认：${c}`,
          commands: ['vibeflow advance'],
          reason: `${c} 产物已生成，需要你确认（human_gate）。检查无误后 advance。`,
          finished: false,
        };
      }
      // 非 human_gate 却停在 in_progress：通常是 export 模式导出待回填，或上次被中断
      return {
        headline: `${c} 进行中（未收尾）`,
        commands: [`vibeflow ${c}`, 'vibeflow advance'],
        reason: '该阶段还没收尾：用 export 模式的话，把结果填回产物后 advance；否则重跑该阶段。',
        finished: false,
      };
    }

    case 'blocked': {
      if (isCodeStage) {
        return {
          headline: `${c} 被阻断（blocked）`,
          commands: ['git diff', `vibeflow ${c}`, 'vibeflow advance'],
          reason: (current.notes ? `原因：${current.notes} ` : '')
            + '先 git diff 看已落盘的改动：完整可用 → advance 让评审把关；不完整 → 重跑该阶段。',
          finished: false,
        };
      }
      return {
        headline: `${c} 被阻断（blocked）`,
        commands: [`vibeflow ${c}`],
        reason: (current.notes ? `原因：${current.notes} ` : '') + '处理后重跑该阶段。',
        finished: false,
      };
    }

    case 'failed': {
      return {
        headline: `${c} 执行失败`,
        commands: [`vibeflow ${c}`],
        reason: (current.notes ? `原因：${current.notes} ` : '') + '修正后重跑该阶段。',
        finished: false,
      };
    }

    default: {
      // current 指向 completed/skipped → 找下一个 pending 阶段
      const idx = state.stages.findIndex((s) => s.id === current.id);
      const next = state.stages.slice(idx + 1).find((s) => s.status === 'pending');
      if (next) {
        return {
          headline: `下一步：${cli(next.id)}`,
          commands: [`vibeflow ${cli(next.id)}`],
          reason: `${c} 已完成，轮到「${next.role}」${hintOf(next.id)}。`,
          finished: false,
        };
      }
      return {
        headline: '阶段已完成，等待收尾',
        commands: ['vibeflow advance'],
        reason: 'advance 推进或收尾任务。',
        finished: false,
      };
    }
  }
}
