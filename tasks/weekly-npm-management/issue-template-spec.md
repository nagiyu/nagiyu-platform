# Issueテンプレート仕様

## 概要

週次npm管理ワークフローによって自動生成されるIssueの構造と内容を定義します。

## Issueの目的

このIssueは以下を目的としています：

1. **可視化**: プロジェクト全体のnpm依存関係の状態を可視化
2. **優先順位付け**: セキュリティ脆弱性と更新を優先度別に整理
3. **自動化**: GitHub Copilot Agentが内容を理解して作業できる形式
4. **自己完結**: Issue内容だけで必要な情報が全て揃っている

## Issue構造

### 基本情報

- **タイトル形式**: `[NPM管理] {YEAR}年第{WEEK}週 パッケージ管理レポート ({DATE})`
  - 例: `[NPM管理] 2026年第03週 パッケージ管理レポート (2026-01-13)`
- **ラベル**: `dependencies`, `weekly-check`
- **アサイン**: なし（手動でGitHub Copilot Agentをアサイン）
- **推奨エージェント**: `.github/agents/task.implement.agent.md`

### Issue本文テンプレート

```markdown
# 週次npm管理レポート

このIssueは自動的に生成されました。検出された問題を確認し、必要に応じて対応してください。

## 📋 実行情報
- 実行日時: {TIMESTAMP}
- 次回チェック予定: {NEXT_CHECK_DATE}
- 前回レポート: #{PREVIOUS_ISSUE_NUMBER}

## 📊 サマリー
- 更新可能なパッケージ: **{COUNT}個**
- セキュリティ脆弱性: **Critical: {CRITICAL}, High: {HIGH}, Moderate: {MODERATE}, Low: {LOW}**
- 重複パッケージ（ルート統合推奨）: **{DUPLICATE_COUNT}個**
- バージョン不整合: **{INCONSISTENCY_COUNT}箇所**

---

## 🚨 Priority 1: 緊急対応が必要

### セキュリティ脆弱性

{SECURITY_VULNERABILITIES_SECTION}

**推奨アクション（Copilot Agent用）**:
```bash
# Critical/High脆弱性の修正
npm audit fix --force
# または手動で該当パッケージを更新
npm update {PACKAGE_NAME}
```

**影響範囲**:
- 影響を受けるワークスペース: {AFFECTED_WORKSPACES}

**受け入れ基準**:
- [ ] `npm audit` でCritical/High脆弱性が0件になる
- [ ] 全てのテストがパスする
- [ ] ビルドエラーがない

---

## ⚠️ Priority 2: 早めの対応推奨

### メジャーバージョン更新

{MAJOR_UPDATES_SECTION}

**推奨アクション（Copilot Agent用）**:
- メジャーバージョン更新は破壊的変更の可能性があります
- CHANGELOGとマイグレーションガイドを確認してください
- 段階的に更新することを推奨します

**受け入れ基準**:
- [ ] 更新対象のパッケージのCHANGELOGを確認済み
- [ ] 破壊的変更に対応するコード修正を実施
- [ ] 全てのテストがパスする

---

### バージョン不整合

{VERSION_INCONSISTENCY_SECTION}

**推奨アクション（Copilot Agent用）**:
```bash
# 特定パッケージのバージョンを統一（ルートから実行）
# 例: @testing-library/react を 16.3.1 に統一
npm install --workspace @nagiyu/auth-web @testing-library/react@16.3.1
npm install --workspace @nagiyu/admin @testing-library/react@16.3.1
```

**受け入れ基準**:
- [ ] 同じパッケージのバージョンが全ワークスペースで統一されている
- [ ] package-lock.json が更新されている
- [ ] 全てのテストがパスする

---

## 💡 Priority 3: 改善推奨

### 重複パッケージ（ルートへの統合推奨）

{DUPLICATE_PACKAGES_SECTION}

**推奨アクション（Copilot Agent用）**:
```bash
# ルートのpackage.jsonに追加
npm install --save-dev {PACKAGE_NAME}@{VERSION}

# 各ワークスペースから削除（ルートから実行）
npm uninstall --workspace {WORKSPACE_NAME} {PACKAGE_NAME}
```

**影響範囲**:
- 対象ワークスペース: {AFFECTED_WORKSPACES}

**受け入れ基準**:
- [ ] ルートのpackage.jsonに追加されている
- [ ] 各ワークスペースのpackage.jsonから削除されている
- [ ] 全てのテストがパスする
- [ ] ビルドエラーがない

---

### マイナー・パッチ更新

{MINOR_PATCH_UPDATES_SECTION}

**推奨アクション（Copilot Agent用）**:
```bash
# ルートの更新
npm update

# 特定ワークスペースの更新
npm update --workspace {WORKSPACE_NAME}
```

**受け入れ基準**:
- [ ] 指定されたパッケージが更新されている
- [ ] package-lock.json が更新されている
- [ ] 全てのテストがパスする

---

## 🔧 Priority 4: 最適化（オプション）

### 未使用パッケージの可能性

{UNUSED_PACKAGES_SECTION}

---

## 📝 対応方法

### 推奨: GitHub Copilot Agentをアサイン

このIssueは、GitHub Copilot Agent (`.github/agents/task.implement.agent.md`) をアサインすることで、以下の手順で作業を進めることができます：

#### 作業フロー

1. **Issue内容の分析**
    - 各Priorityの問題を特定
    - 影響範囲と依存関係を把握

2. **Priority 1（セキュリティ脆弱性）の対応**
    - Critical/High脆弱性を優先的に修正
    - `npm audit fix` または手動更新を実行
    - テストの実行と確認

3. **Priority 2-3の対応**
    - バージョン不整合の解消
    - 重複パッケージのルート統合
    - メジャーバージョン更新の検討

4. **PR作成**
    - 変更内容をまとめたPRを作成
    - `.github/pull_request_template.md` に従う
    - テストが全てパスすることを確認

5. **Issue更新**
    - 完了した項目にチェックを入れる
    - 作業内容をIssueコメントで報告

#### Agent実行指示

**Copilot Agent へ**:

このIssueに記載された以下の項目を順次対応してください：

1. **Priority 1**: セキュリティ脆弱性を全て解決する
2. **Priority 2**: バージョン不整合を解消し、メジャーバージョン更新を検討する
3. **Priority 3**: 重複パッケージをルートに統合し、マイナー・パッチ更新を実行する

各Priorityの「受け入れ基準」を満たすように実装してください。

### 関連ファイル

- `package.json` - ルート依存関係
- `package-lock.json` - ロックファイル
- `services/*/web/package.json` - 各サービスのWeb依存関係
- `services/*/core/package.json` - 各サービスのCore依存関係
- `libs/*/package.json` - 共通ライブラリの依存関係
- `infra/*/package.json` - インフラの依存関係

### 関連ドキュメント

このIssueは自己完結型のため、特定のドキュメントへの参照は不要です。
必要に応じて以下を参照してください：

- `docs/development/` - 開発ガイドライン（必要に応じて）

---

## ⚙️ 手動実行が必要な場合

Copilot Agentが対応できない場合や、手動で確認したい場合：

### セキュリティ脆弱性の確認

```bash
# 詳細な脆弱性情報を確認
npm audit

# 自動修正を試みる
npm audit fix

# 強制的に修正（メジャーバージョン更新含む）
npm audit fix --force
```

### パッケージ更新の確認

```bash
# 更新可能なパッケージ一覧
npm outdated

# 特定パッケージの更新（ルートから実行）
npm install --workspace {WORKSPACE_NAME} {PACKAGE_NAME}@{VERSION}

# 全パッケージの更新（wanted バージョンまで）
npm update
```

### 重複パッケージの確認

```bash
# 依存関係ツリーの確認
npm ls {PACKAGE_NAME}

# 重複している理由を確認
npm explain {PACKAGE_NAME}
```

### ワークスペース操作の原則

**重要**: 各ワークスペースに`package-lock.json`や`node_modules`が作成されないよう、必ずルートから`--workspace`オプションを使用してください。

```bash
# 正しい例: ルートから実行
npm install --workspace @nagiyu/auth-web {PACKAGE_NAME}@{VERSION}
npm uninstall --workspace @nagiyu/auth-web {PACKAGE_NAME}

# 誤った例: ディレクトリ移動（避ける）
cd services/auth/web && npm install {PACKAGE_NAME}@{VERSION}
```

---

## 🎯 全体の受け入れ基準

以下の全てが満たされた時点でIssueをクローズします：

- [ ] Priority 1の全ての脆弱性が解決されている
- [ ] Priority 2のバージョン不整合が解消されている
- [ ] Priority 3の重複パッケージがルートに統合されている（3箇所以上使用のもの）
- [ ] 全てのテストがパスする
- [ ] 全てのビルドが成功する
- [ ] package-lock.json が更新されている
- [ ] PRが作成され、レビュー待ちまたはマージ済み

---

**次回チェック予定**: {NEXT_CHECK_DATE}
```

## セクション生成ルール

### セキュリティ脆弱性セクション

**Critical/Highが存在する場合**:

```markdown
#### Critical脆弱性

| パッケージ | 現在 | 推奨 | CVE | 説明 |
|----------|------|------|-----|------|
| example-pkg | 1.0.0 | 1.0.5 | CVE-2024-XXXXX | XSS vulnerability |

#### High脆弱性

| パッケージ | 現在 | 推奨 | CVE | 説明 |
|----------|------|------|-----|------|
| another-pkg | 2.0.0 | 2.1.0 | CVE-2024-YYYYY | SQL injection |

<details>
<summary>詳細な脆弱性情報</summary>

\`\`\`
npm audit の詳細出力
\`\`\`
</details>
```

**脆弱性がない場合**:

```markdown
✅ Critical/Highの脆弱性は検出されませんでした。

Moderate以下の脆弱性がある場合は、優先度を判断して対応してください。
```

### メジャーバージョン更新セクション

```markdown
| パッケージ | 現在 | 最新 | 影響範囲 | Breaking Changes |
|----------|------|------|---------|-----------------|
| next | 16.1.1 | 17.0.0 | 全webワークスペース | [リリースノート](URL) |
| react | 19.2.3 | 20.0.0 | 全webワークスペース | [マイグレーションガイド](URL) |

**注意**: メジャーバージョン更新には破壊的変更が含まれる可能性があります。
```

### バージョン不整合セクション

```markdown
| パッケージ | 使用箇所 | バージョン |
|----------|---------|----------|
| @testing-library/react | auth-web | 16.3.0 |
|  | admin-web | 16.3.1 |

**推奨**: 最新の 16.3.1 に統一
```

### 重複パッケージセクション

```markdown
以下のdevDependenciesは3箇所以上のワークスペースで使用されています。
ルートのpackage.jsonに移行することで管理が簡素化されます。

| パッケージ | 使用箇所数 | バージョン | 使用箇所 |
|----------|----------|----------|---------|
| @playwright/test | 3 | ^1.57.0 | codec-converter/web, auth/web, admin/web |
| @axe-core/playwright | 3 | ^4.11.0 | codec-converter/web, auth/web, admin/web |
| prettier | 4 | ^3.7.4 | codec-converter/web, auth/web, admin/web, tools |
```

### マイナー・パッチ更新セクション

```markdown
<details>
<summary>{COUNT}個の更新可能なパッケージ（クリックで展開）</summary>

#### ルート package.json

| パッケージ | 現在 | 必要 | 最新 |
|----------|------|------|------|
| eslint | 9.17.0 | 9.17.0 | 9.18.0 |
| prettier | 3.7.4 | 3.7.4 | 3.8.0 |

#### services/auth/web

| パッケージ | 現在 | 必要 | 最新 |
|----------|------|------|------|
| next-auth | 5.0.0-beta.30 | 5.0.0-beta.30 | 5.0.0-beta.31 |

</details>
```

## データマッピング

### ワークフローからIssueへのデータフロー

```
check-npm-outdated.sh
    → OUTDATED 変数
        → Priority 2-3: パッケージ更新セクション

check-npm-audit.sh
    → AUDIT 変数
        → Priority 1: セキュリティ脆弱性セクション

check-duplicates.sh
    → DUPLICATES 変数
        → Priority 3: 重複パッケージセクション

check-version-inconsistency.sh
    → INCONSISTENCY 変数
        → Priority 2: バージョン不整合セクション
```

## Copilot Agent連携の考慮事項

### Agentが理解しやすい記述

1. **明確な指示**: 「推奨アクション」セクションで具体的なコマンドを提示
2. **受け入れ基準**: 各セクションに明確な完了条件を記載
3. **影響範囲**: どのファイルやワークスペースが影響を受けるか明記
4. **コンテキスト**: 必要な背景情報をIssue内に含める

### Agentの作業を助けるための工夫

- コマンド例をコードブロックで提示
- ファイルパスを明確に記載
- 優先順位を数値で明示
- チェックボックスで進捗を追跡可能に

## バリエーション

### 問題が何も検出されなかった場合

```markdown
# 週次npm管理レポート

## ✅ 良好な状態です

今週のチェックでは、以下の問題は検出されませんでした：

- セキュリティ脆弱性: 0件
- 更新可能なパッケージ: 0件
- 重複パッケージ: 0件
- バージョン不整合: 0件

次回チェック予定: {NEXT_CHECK_DATE}

**このIssueは自動的にクローズされます。**
```

この場合、Issueは自動的に作成されるが、すぐにクローズするか、作成自体をスキップすることも検討可能。

## 今後の拡張可能性

- パッケージ更新の推移グラフ
- 脆弱性トレンドの可視化
- 依存関係ツリーの図示
- 更新に必要な工数の見積もり
