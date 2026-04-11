# Quick Clip: Lambda の Batch 依存を CloudFormation Export/Import から切り離す - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/quick-clip-decouple-batch-lambda/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/quick-clip-decouple-batch-lambda/design.md — 変更背景・変更内容・検証方法
-->

## Phase 1: CDK 変更

- [ ] `infra/quick-clip/bin/quick-clip.ts` に `getBatchJobQueueArn` を import する（依存: なし）
- [ ] `infra/quick-clip/bin/quick-clip.ts` で `batchJobQueueArn` をリテラル文字列で構築する（依存: 上記）
- [ ] `infra/quick-clip/bin/quick-clip.ts` の `lambdaStack` props から `batchJobQueueArn: batchStack.jobQueueArn` をリテラル変数に差し替える（依存: 上記）
- [ ] `infra/quick-clip/bin/quick-clip.ts` の `lambdaStack` props から `batchJobDefinitionArns` を削除する（依存: なし）
- [ ] `infra/quick-clip/bin/quick-clip.ts` から `lambdaStack.addDependency(batchStack)` を削除する（依存: なし）
- [ ] `infra/quick-clip/lib/lambda-stack.ts` の `LambdaStackProps` から `batchJobDefinitionArns` を削除する（依存: なし）
- [ ] `infra/quick-clip/lib/lambda-stack.ts` のコンストラクタ destructuring から `batchJobDefinitionArns` を削除する（依存: 上記）
- [ ] `infra/quick-clip/lib/lambda-stack.ts` の `batchSubmitJobResources` から `...batchJobDefinitionArns` を削除する（依存: 上記）

## Phase 2: 検証

- [ ] `cd infra/quick-clip && npx cdk synth --context env=dev` が成功すること（依存: Phase 1）
- [ ] `NagiyuQuickClipLambdaDev.template.json` に `Fn::ImportValue` が含まれていないことを確認する（依存: 上記）
- [ ] `NagiyuQuickClipBatchDev.template.json` に `ExportsOutput*` のような自動生成 Export がないことを確認する（依存: 上記）

---

## 完了チェック

- [ ] `cdk synth` が正常終了する
- [ ] LambdaStack テンプレートに `Fn::ImportValue` が存在しない
- [ ] BatchStack テンプレートに `ExportsOutput*` の自動生成 Export が存在しない
- [ ] Lint・型チェックが通過している（`cd infra/quick-clip && npm run build` 等）
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `tasks/quick-clip-decouple-batch-lambda/` ディレクトリを削除した
