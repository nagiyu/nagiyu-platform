# アーカイブされたエージェント

このディレクトリには、現在使用していないエージェントファイルが保管されています。

## アーカイブ理由

- エージェントが多すぎて選択が困難になったため、speckit系エージェントを一時的に無効化
- task系エージェント（task.implement、task.proposal）のみをアクティブとして維持

## アーカイブされたエージェント一覧

- `speckit.analyze.agent.md` - 非破壊的なクロス成果物一貫性・品質分析
- `speckit.checklist.agent.md` - カスタムチェックリスト生成
- `speckit.clarify.agent.md` - 仕様の不明瞭な箇所の特定と質問
- `speckit.constitution.agent.md` - プロジェクト憲法の作成・更新
- `speckit.implement.agent.md` - 実装計画ワークフローの実行
- `speckit.plan.agent.md` - 実装計画ワークフローの実行（プランテンプレート使用）
- `speckit.specify.agent.md` - 機能仕様書の作成・更新
- `speckit.tasks.agent.md` - 実行可能な依存関係順のタスク生成
- `speckit.taskstoissues.agent.md` - タスクからGitHub Issueへの変換

## 再有効化方法

これらのエージェントが必要になった場合は、対象ファイルを `.github/agents/` ディレクトリに戻してください。

```bash
git mv .github/agents/archived/speckit.*.agent.md .github/agents/
```
