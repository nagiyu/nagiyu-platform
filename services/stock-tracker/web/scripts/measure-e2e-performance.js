#!/usr/bin/env node

/**
 * E2E Test Performance Measurement Script
 *
 * E2Eテストの実行時間を測定し、結果をJSON形式で出力
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * E2Eテストを実行し、実行時間を測定
 *
 * @param {string} project - テストプロジェクト名（chromium-mobile等）
 * @returns {Promise<Object>} 測定結果
 */
async function measureE2EPerformance(project = 'chromium-mobile') {
  console.log(`\n=== E2Eテスト実行時間の測定 ===`);
  console.log(`プロジェクト: ${project}\n`);

  const startTime = Date.now();
  let exitCode = 0;
  let stdout = '';
  let stderr = '';

  try {
    // E2Eテストを実行
    stdout = execSync(
      `npm run test:e2e -- --project=${project} --reporter=json`,
      {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
  } catch (error) {
    // テスト失敗時もエラーは記録するが、測定は続行
    exitCode = error.status || 1;
    stdout = error.stdout || '';
    stderr = error.stderr || '';
  }

  const endTime = Date.now();
  const duration = endTime - startTime;

  console.log(`実行時間: ${(duration / 1000).toFixed(2)}秒`);
  console.log(`終了コード: ${exitCode}`);

  // 結果を解析
  let testResults = null;
  try {
    testResults = JSON.parse(stdout);
  } catch (error) {
    console.warn('テスト結果のJSONパースに失敗しました');
  }

  const result = {
    project,
    duration,
    durationSeconds: (duration / 1000).toFixed(2),
    exitCode,
    timestamp: new Date().toISOString(),
    testResults,
  };

  // 結果をファイルに保存
  const outputDir = path.join(__dirname, '..', 'test-results', 'performance');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(
    outputDir,
    `e2e-performance-${project}-${Date.now()}.json`
  );
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`\n結果を保存しました: ${outputPath}`);

  return result;
}

/**
 * 複数のプロジェクトで測定を実行
 */
async function measureAllProjects() {
  const projects = ['chromium-mobile', 'chromium-desktop', 'webkit-mobile'];
  const results = [];

  for (const project of projects) {
    try {
      const result = await measureE2EPerformance(project);
      results.push(result);
    } catch (error) {
      console.error(`${project} の測定に失敗しました:`, error.message);
    }
  }

  // 全体のサマリーを出力
  console.log('\n\n=== 測定結果サマリー ===\n');
  console.log('| プロジェクト | 実行時間 (秒) | 終了コード |');
  console.log('|-------------|--------------|-----------|');

  for (const result of results) {
    console.log(
      `| ${result.project} | ${result.durationSeconds} | ${result.exitCode} |`
    );
  }

  // 全体の結果を保存
  const outputDir = path.join(__dirname, '..', 'test-results', 'performance');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const summaryPath = path.join(
    outputDir,
    `e2e-performance-summary-${Date.now()}.json`
  );
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
  console.log(`\nサマリーを保存しました: ${summaryPath}`);

  return results;
}

/**
 * 比較レポートを生成
 *
 * @param {string} beforeFile - 比較前の結果ファイルパス
 * @param {string} afterFile - 比較後の結果ファイルパス
 */
function generateComparisonReport(beforeFile, afterFile) {
  console.log('\n=== パフォーマンス比較レポート ===\n');

  const before = JSON.parse(fs.readFileSync(beforeFile, 'utf-8'));
  const after = JSON.parse(fs.readFileSync(afterFile, 'utf-8'));

  console.log('| プロジェクト | 変更前 (秒) | 変更後 (秒) | 改善率 |');
  console.log('|-------------|------------|------------|--------|');

  for (let i = 0; i < before.length; i++) {
    const beforeResult = before[i];
    const afterResult = after.find(
      (r) => r.project === beforeResult.project
    ) || { durationSeconds: '0' };

    const beforeTime = parseFloat(beforeResult.durationSeconds);
    const afterTime = parseFloat(afterResult.durationSeconds);
    const improvement =
      beforeTime > 0 ? (((beforeTime - afterTime) / beforeTime) * 100).toFixed(1) : 'N/A';

    console.log(
      `| ${beforeResult.project} | ${beforeTime.toFixed(2)} | ${afterTime.toFixed(2)} | ${improvement}% |`
    );
  }
}

// スクリプトとして実行された場合
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'compare' && args.length === 3) {
    // 比較モード
    generateComparisonReport(args[1], args[2]);
  } else if (command === 'all') {
    // 全プロジェクト測定
    measureAllProjects()
      .then(() => {
        console.log('\n測定完了');
        process.exit(0);
      })
      .catch((error) => {
        console.error('測定エラー:', error);
        process.exit(1);
      });
  } else {
    // 単一プロジェクト測定
    const project = command || 'chromium-mobile';
    measureE2EPerformance(project)
      .then(() => {
        console.log('\n測定完了');
        process.exit(0);
      })
      .catch((error) => {
        console.error('測定エラー:', error);
        process.exit(1);
      });
  }
}

module.exports = {
  measureE2EPerformance,
  measureAllProjects,
  generateComparisonReport,
};
