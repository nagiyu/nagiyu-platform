# ドキュメント専属エージェントの作成

## 概要

本リポジトリのドキュメント（`docs/` 配下）を作成・更新するための専属エージェント（`docs.write`）を新規作成する。
既存の `task.proposal`（タスクドキュメント生成）、`task.implement`（コード実装）と役割を分担し、
ドキュメント駆動開発における「ドキュメント整備」フェーズを担当させる。

## 関連情報

- Issue: #84
- タスクタイプ: プラットフォームタスク
- 参考エージェント: task.implement, task.proposal

## 要件

### 機能要件

- FR1: ドキュメント作成・更新の専属エージェントとして機能する
- FR2: `docs/` 配下のドキュメントを対象とする（`tasks/` は task.proposal の担当範囲のため除外）
- FR3: 既存ドキュメント（`docs/README.md`, `docs/development/rules.md` 等）を参照しながら整合性を保つ
- FR4: 本リポジトリの「最小限のルール」方針に従い、コードを見れば分かる情報は記述しない
- FR5: ドキュメントはコードへの参照なしに単体で完結する形で記述する
- FR6: エージェント完成後、使用方法を `docs/agents/` 配下にREADMEとして作成する

### 非機能要件

- NFR1: Markdownのインデントはスペース4つを厳守する（`.vscode/settings.json` 準拠）
- NFR2: 実装（コード生成・変更）は行わない。ドキュメント作成に専念する
- NFR3: エージェント定義は既存エージェント（task.implement, task.proposal）のパターンに準拠する

## 実装のヒント

### エージェントの名称と配置

- エージェント名: `docs.write`
- エージェント定義: `.github/agents/docs.write.agent.md`
- ユーザー向けREADME: `docs/agents/docs.write.README.md`

### エージェントの主要フロー

1. **対象確認**: 作成・更新対象のドキュメントとその目的を確認する
2. **調査**: 関連する既存ドキュメントを読み込み、記述スタイルや整合性を把握する
3. **ドキュメント作成・更新**: 本リポジトリのルールに従って記述する
4. **品質確認**: インデント・最小限のルール・単体完結の3点を検証する
5. **完了報告**: 変更したファイルと変更内容の概要を報告する

### 記述ルールの核心（エージェントに組み込む内容）

以下の3点が本Issueで特に強調されている要件であり、エージェント定義に必須で含める。

- **最小限のルール**: コードを見れば分かることは書かない。なぜそうするのか（理由・背景）を重点的に記述する
- **コード参照の禁止**: ファイルパスや関数名などへの直接参照は行わない。概念や設計パターンで表現し、ドキュメント単体で理解できるようにする
- **4スペースインデント**: Markdownファイルは常にスペース4つでインデントする

### ドキュメント対象の分類

エージェントが扱う対象ドキュメントの分類と、それぞれの参照元:

| 対象 | 配置場所 | 参照ドキュメント |
|------|----------|----------------|
| 開発規約・方針 | docs/development/ | docs/README.md |
| サービス仕様 | docs/services/{サービス名}/ | docs/development/rules.md, architecture.md |
| 共通ライブラリ | docs/libs/ | docs/development/shared-libraries.md |
| インフラ | docs/infra/ | docs/infra/README.md |
| テンプレート | docs/templates/ | 既存テンプレート |

## タスク

### Phase 1: 調査・方針確定

- [ ] T001: 既存エージェント定義（task.implement, task.proposal の agent.md）のフォーマットを確認し、docs.write 用の構成案を確定する
- [ ] T002: 既存の `docs/agents/task.implement.README.md`、`docs/agents/task.proposal.README.md` のフォーマットを確認し、README構成案を確定する

### Phase 2: エージェント定義の作成

- [ ] T003: `.github/agents/docs.write.agent.md` を作成する（エージェントの動作フロー、制約、ルール準拠方針を記述）
- [ ] T004: `docs/agents/docs.write.README.md` を作成する（使用方法、ユースケース例、既存エージェントとの連携方法を記述）

### Phase 3: 検証

- [ ] T005: `docs.write` エージェントを実際のドキュメント作成タスクに試験的に使用し、動作を確認する
- [ ] T006: 生成されたドキュメントが本リポジトリのルールに準拠しているか確認する（インデント、最小限のルール、単体完結）

## 参考ドキュメント

- docs/README.md - ドキュメント駆動開発方針と最小限のルール
- docs/development/rules.md - コーディング規約（Markdownルールを含む）
- docs/agents/task.implement.README.md - エージェントREADMEのフォーマット例
- docs/agents/task.proposal.README.md - エージェントREADMEのフォーマット例

## 備考・未決定事項

- エージェントの呼び出しトリガーは既存エージェントに合わせてGitHub Issue経由を基本とする
- `docs/templates/` 配下のテンプレートを参照・更新する機能をエージェントに含めるかは実装時に判断する
- 既存の `speckit.*` 系エージェントとの役割の重複がないか、T001の調査時に確認する
