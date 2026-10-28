'use strict';

const ERROR_MESSAGES = {
  NO_PULL_REQUEST: 'Pull Request が無い起動のため、コメントの投稿をスキップします',
  DISPLAY_NAME_REQUIRED: 'display-name が指定されていません',
};

const DEFAULT_REPORTS_BASE_URL = 'https://reports.nagiyu.com';

// 失敗扱いにしないのは、実行が不要だったか結果が中立のもの。cancelled / timed_out は失敗として扱う
const PASSING_CONCLUSIONS = ['success', 'skipped', 'neutral'];

const STATUS_EMOJI = {
  success: '✅',
  failure: '❌',
  cancelled: '⚠️',
  skipped: '⏭️',
};

// ジョブ名の括弧内の値が、そのまま S3 上のレポートのディレクトリ名になる
const REPORT_PROJECTS = ['chromium-mobile', 'chromium-desktop', 'webkit-mobile'];

/**
 * ジョブ名から E2E レポートのプロジェクト名を取り出す。
 * @param {string} jobName
 * @returns {string | undefined}
 */
function findReportProject(jobName) {
  return REPORT_PROJECTS.find((project) => jobName.includes(`(${project})`));
}

/**
 * すべてのジョブが成功扱いかを返す。
 * @param {Array<{ conclusion: string | null }>} jobs
 * @returns {boolean}
 */
function isAllPassed(jobs) {
  return jobs.every((job) => PASSING_CONCLUSIONS.includes(job.conclusion));
}

/**
 * 見出しを組み立てる。
 * @param {{ displayName: string, passed: boolean, fastFull: boolean, isFull: boolean }} params
 * @returns {string}
 */
function buildHeader({ displayName, passed, fastFull, isFull }) {
  const icon = passed ? '✅' : '❌';
  const result = passed ? 'Passed' : 'Failed';
  if (!fastFull) {
    return `## ${icon} [${displayName}] Verification ${result}`;
  }
  const kind = isFull ? 'Full' : 'Fast';
  return `## ${icon} [${displayName}] ${kind} Verification ${result}`;
}

/**
 * PR コメントの本文を組み立てる純粋関数。
 * @param {{
 *   displayName: string,
 *   fastFull: boolean,
 *   isFull: boolean,
 *   e2eReportKey?: string,
 *   reportsBaseUrl?: string,
 *   prNumber: number,
 *   runId: number | string,
 *   repoHtmlUrl: string,
 *   jobs: Array<{ name: string, conclusion: string | null }>,
 * }} params
 * @returns {{ body: string, passed: boolean }}
 */
function buildReport({
  displayName,
  fastFull,
  isFull,
  e2eReportKey,
  reportsBaseUrl,
  prNumber,
  runId,
  repoHtmlUrl,
  jobs,
}) {
  const passed = isAllPassed(jobs);
  const withReport = Boolean(e2eReportKey);
  const baseUrl = (reportsBaseUrl || DEFAULT_REPORTS_BASE_URL).replace(/\/+$/, '');

  let body = `${buildHeader({ displayName, passed, fastFull, isFull })}\n\n`;
  body += withReport ? '| Job | Status | Report |\n' : '| Job | Status |\n';
  body += withReport ? '|-----|--------|--------|\n' : '|-----|--------|\n';

  for (const job of jobs) {
    const emoji = STATUS_EMOJI[job.conclusion] || '❓';
    let row = `| ${job.name} | ${emoji} ${job.conclusion} |`;
    if (withReport) {
      const project = findReportProject(job.name);
      const hasReport = project && (job.conclusion === 'success' || job.conclusion === 'failure');
      const link = hasReport
        ? `[📊 View](${baseUrl}/${e2eReportKey}/pr-${prNumber}/${runId}/${project}/)`
        : '-';
      row += ` ${link} |`;
    }
    body += `${row}\n`;
  }

  if (withReport) {
    body += '\n_E2E HTML reports are retained for 3 days. Re-run CI to regenerate._\n';
  }
  body += `\n[View workflow run](${repoHtmlUrl}/actions/runs/${runId})`;

  return { body, passed };
}

/**
 * actions/github-script から呼ぶ入口。
 * 設定は env から受け取り、スクリプト文字列に入力を埋め込まない。
 * @param {{ github: any, context: any, core: any }} deps
 * @returns {Promise<void>}
 */
async function run({ github, context, core }) {
  const pullRequest = context.payload.pull_request;
  if (!pullRequest) {
    core.info(ERROR_MESSAGES.NO_PULL_REQUEST);
    return;
  }

  const displayName = process.env.REPORT_DISPLAY_NAME;
  if (!displayName) {
    throw new Error(ERROR_MESSAGES.DISPLAY_NAME_REQUIRED);
  }

  // needs を手で並べると、ジョブの追加や削除のたびに集計が実態とずれる。
  // 実行中の自ジョブ (報告ジョブ) は結果が未確定なので除く
  const allJobs = await github.paginate(github.rest.actions.listJobsForWorkflowRunAttempt, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    run_id: context.runId,
    attempt_number: Number(process.env.GITHUB_RUN_ATTEMPT) || 1,
    per_page: 100,
  });
  const jobs = allJobs.filter((job) => job.status === 'completed');

  const { body } = buildReport({
    displayName,
    fastFull: process.env.REPORT_FAST_FULL === 'true',
    // github.base_ref は github-script の github (octokit) では参照できないため、ペイロードから読む
    isFull: pullRequest.base.ref === 'develop',
    e2eReportKey: process.env.REPORT_E2E_REPORT_KEY,
    reportsBaseUrl: process.env.REPORT_REPORTS_BASE_URL,
    prNumber: pullRequest.number,
    runId: context.runId,
    repoHtmlUrl: context.payload.repository.html_url,
    jobs,
  });

  await github.rest.issues.createComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: pullRequest.number,
    body,
  });
}

module.exports = { run, buildReport };
