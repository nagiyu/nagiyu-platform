# 週次npm管理プロジェクト

## 概要

npm パッケージの定期的なバージョンチェックと最適化を自動化し、monorepo全体の依存関係を健全に保つプロジェクトです。

## 現状の問題

- npm パッケージのバージョンチェックが手動で行われていない
- セキュリティ脆弱性の検出が遅れる可能性がある
- 複数のワークスペースで同じパッケージが重複している
- ワークスペース間でバージョンの不整合が発生している
- 未使用パッケージが蓄積される可能性がある

## 目標

1. 週次でnpmパッケージのバージョンチェックを自動実行
2. セキュリティ脆弱性を早期検出
3. 重複パッケージとバージョン不整合を可視化
4. GitHub Issueを通じて改善タスクを管理
5. GitHub Copilot Agentによる半自動的な更新フロー

## プロジェクト構成

このプロジェクトは以下のフェーズで構成されています：

### Phase 1: 基本ワークフローの実装 ✅
- npm outdated チェックの実装
- npm audit（セキュリティ脆弱性）チェックの実装
- Issue自動作成スクリプトの実装
- 週次スケジュール設定
- **ステータス**: 完了（2026-01-13）

### Phase 2: 高度な分析機能の追加 ✅
- 重複パッケージ検出スクリプトの実装
- バージョン不整合検出スクリプトの実装
- ルート統合の提案ロジックの実装
- **ステータス**: 完了（2026-01-13）
- **実装ファイル**:
  - `.github/workflows/scripts/check-duplicates.sh`
  - `.github/workflows/scripts/check-version-inconsistency.sh`
  - `.github/workflows/weekly-npm-check.yml` (統合)
  - `.github/workflows/templates/weekly-npm-body.md` (更新)

### Phase 3: 最適化機能の追加（オプション）
- 未使用パッケージ検出（depcheck導入）
- パッケージサイズ監視
- ライセンスコンプライアンスチェック
- **ステータス**: 未着手

## 関連ドキュメント

### プロジェクト全体
- [技術仕様](./technical-specification.md) - 実装の詳細とアーキテクチャ
- [Issueテンプレート仕様](./issue-template-spec.md) - 作成されるIssueの構造

### 既存の参考実装
- `.github/workflows/weekly-docs-review.yml` - 週次ドキュメントレビューワークフロー（構造の参考）
- `.github/workflows/all-verify.yml` - 全ワークスペースの検証ワークフロー

## 実装方針

### ワークフローの基本構造

```yaml
名前: Weekly NPM Management Check
スケジュール: 毎週月曜日 10:00 JST (1:00 UTC)
手動実行: workflow_dispatch で可能
```

### チェック項目の優先順位

**Priority 1: 緊急対応が必要**
- セキュリティ脆弱性（Critical/High）

**Priority 2: 早めの対応推奨**
- メジャーバージョンの更新
- バージョン不整合

**Priority 3: 改善推奨**
- 重複パッケージ（ルートへの統合推奨）
- マイナー・パッチ更新

**Priority 4: 最適化（オプション）**
- 未使用パッケージの検出
- パッケージサイズの警告

### Issue作成の方針

- **Issueのタイトル**: `[NPM管理] YYYY年第WW週 パッケージ管理レポート (YYYY-MM-DD)`
- **ラベル**: `dependencies`, `weekly-check`
- **アサイン**: なし（手動でGitHub Copilot Agentをアサイン）
- **Issue内容**: 検出された問題と推奨アクションを明記
- **自己完結型**: Issueの内容だけで作業を進められるように記述
- **Sub-issue**: Priority別にGitHubのSub-issue機能で子Issueを作成

### 作業フロー

```
週次ワークフロー実行
    ↓
親Issue自動作成（サマリー）
    ↓
Priority別にSub-issueを作成
    ↓
開発者が各Sub-issueにGitHub Copilot Agentをアサイン
    ↓
Copilot Agent が各Sub-issueを分析・実装
    ↓
Copilot Agent がPR作成
    ↓
人間がレビュー・マージ
    ↓
全Sub-issue完了後、親Issueをクローズ
```

### Issue内容の要件

- 検出された問題の詳細（パッケージ名、現在のバージョン、推奨バージョン）
- 影響範囲（どのワークスペースが影響を受けるか）
- 推奨アクション（具体的な更新コマンド - ルートから`--workspace`指定）
- 受け入れ基準（何をもって完了とするか）
- 特定のドキュメントを指定せず、Issue内容のみで作業可能

### ワークスペース操作の原則

- **ルートからワークスペースを操作**: `cd`でディレクトリ移動せず、ルートから`--workspace`オプションで指定
- **理由**: 各ワークスペースに`package-lock.json`や`node_modules`が作成されるのを防ぐ
- **例**: `npm install --workspace @nagiyu/auth-web @testing-library/react@16.3.1`

### 実装の制約

- **外部ツール依存を最小化**: npm標準コマンドとjq、シェルスクリプトで実装
- **GitHub Actions内で完結**: 追加のサービス連携は不要
- **既存ワークフローとの一貫性**: weekly-docs-reviewと同様のパターンを踏襲

## Issue作成について

このワークフローは週次で自動実行され、検出された問題をIssueとして自動作成します。

親Issueには以下が含まれます：
- 週次チェック結果の概要
- 各Priorityの問題の詳細
- 推奨される対応アクション（ルートからの`--workspace`指定コマンド）
- 受け入れ基準
- ワークスペース名の対応表

Priority別にGitHubのSub-issue機能で子Issueを作成し、各Sub-issueにGitHub Copilot Agentをアサインして実装します。

## 進め方

1. **Phase 1を最初に実装**（最小構成）
    - npm outdated + npm audit + Issue作成
    - 基本的な可視化を実現

2. **Phase 2を段階的に追加**
    - 重複パッケージ検出
    - バージョン不整合検出
    - より高度な分析を提供

3. **Phase 3はオプション**
    - 必要に応じて追加
    - depcheckなど外部ツールの導入を検討

## 推定工数

- Phase 1（基本実装）: 2-3日
- Phase 2（高度な分析）: 2-3日
- Phase 3（最適化機能）: 2-3日

## 運用開始後の想定フロー

1. 毎週月曜日 10:00 JST に自動実行
2. 親Issue作成（週次レポート）
3. Priority別にSub-issueを手動または自動作成
4. 開発者が各Sub-issueにGitHub Copilot Agentをアサイン
5. Agentが各Sub-issueを分析・実装・PR作成
6. 開発者がレビュー・マージ
7. 全Sub-issue完了後、親Issueをクローズ
8. 次週のチェックで改善を確認

## 成功指標

- セキュリティ脆弱性の検出から対応までの時間短縮
- パッケージバージョンの統一率向上
- 重複パッケージの削減
- 依存関係の透明性向上
