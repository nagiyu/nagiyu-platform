# CLAUDE.md - nagiyu-platform Claude 運用ガイドライン

本ファイルは Claude（Claude Code / claude.ai/code 等）が本リポジトリで作業する際に、毎回必ず守るべき運用ルールを定める。

技術詳細は `docs/` 配下のドキュメントを参照すること。本ファイルは Claude 専用の運用ハンドブックとして自己完結させており、他の AI エージェント向け指示（`AGENTS.md` 等）とは独立している。

---

## 言語

**MUST: Claude のすべての出力（PR 説明・Issue コメント・コミットメッセージ・コード内コメント等）は日本語で記述すること**

- コードスニペット・エラーメッセージ内の英語はそのまま保持する
- TypeScript / Next.js / React などの技術用語は英語のまま使用してよい

---

## 本運用の前提（経緯）

かつては GitHub Copilot Agent が開発の主流で、**実装も独立セッション**だったため、引き継ぎのために Issue 本文へ実装詳細まで front-load していた。リブトーク前後で **Claude Code on the web 運用**へ移行し、実装を**サブエージェント化**できるようになったため、実装詳細を Issue に載せる必要がなくなった。

本運用の最大の課題は **セッションをまたぐコンテキストの引き継ぎ**である。以下のフローは、それを「セッションの継ぎ目」に最小限だけ残す思想で組み立てている。Issue は本来汎化されるべきかもしれないが、本ファイルでは **Claude 運用に都合のよい解釈**で割り切る。

---

## セッションロールと対応フロー

対応は **3 つのセッションロール**で進める。ロールは**責務の定義**であり、固定の直線パイプラインではない。規模に応じてロールは**再帰**し、また**畳まれる**（超軽微なら 1 セッションに全部畳む）。

### ロール

| ロール | モデル | 起動ブランチ | 責務 |
|---|---|---|---|
| 起票 | Opus | develop | 状況確認 → **方針（Issue 内容・integration 可否）を人に確認** → ざっくり親 Issue 起票（WHY・大スコープ・Phase 見立て）→ 必要なら integration ブランチ作成 |
| オーケストレーション（再帰） | Opus | integration / develop | Issue から仕様を詰め、規模を見て「自分が末端か／さらに分岐か」を判断。実装の駆動・検証・dev 検証・宿題の切り出しを回す |
| 実装 | Sonnet（サブエージェント） | （オーケスト内） | 渡されたコンテキストで実装＋テストのみ。PR は作らない |

- **着手前に一度だけ上流ゲートを置く**: 起票ロールは状況確認のうえ「**どんな Issue を立てるか（スコープ・方針）**」と「**integration ブランチを作るか否か**」を提案し、**人の承認を得てから着手する**。承認後は、同一セッションで完結する場合も含め、起票・ブランチ作成・オーケスト・実装・Draft PR まで自動で進めてよい。
- **Phase 分けを伴う場合は「進め方」も合意する**: 各 Phase をどう進めるか（別セッションで回す／同一セッション内で連続する）を上流ゲートで提示して合意する。トポロジ自体は固定せず、合意があればどの形でもよい。要は黙ってどちらかに決めて進まないこと。
- **役割・セッションの遷移をサイレントに行わない**: 「計画 → 実装」「Phase → Phase」の境界では地続きで進めず、合意した進め方に沿って進む。
- 起票時にラベル・マイルストーン・Assignee は **Claude が付与しない**（人力で付ける）。
- **integration の判断は Issue 本文に書かない**（ブランチが存在することで伝わる）。

### 継ぎ目モデル（コンテキストの引き継ぎ）

Issue / `tasks/` / コメントは **「セッションの継ぎ目」をつなぐ媒体**。**継ぎ目をまたがないもの（同一セッション内）は残さない。**

| 継ぎ目 | 媒体 | 書く主体 |
|---|---|---|
| 起票 → オーケスト | ざっくり親 Issue | 起票セッション |
| オーケスト → 子オーケスト（別セッション分割） | サブ Issue（軽め）/ `tasks/` | 親オーケスト |
| オーケスト → 実装サブエージェント | プロンプト | オーケスト |
| 実装サブエージェント → オーケスト | 戻り値（媒体なし・Issue 書き込みなし） | ―（同一セッション内） |
| 子オーケスト → 親スコープ（再帰の回帰・別セッション） | Issue コメント（任意） | 子オーケスト（Opus） |

- **Issue / コメントへの書き込みは常にオーケストレーター（Opus）が行う。実装サブエージェントは結果を返すだけで、Issue を触らない。**
- サブ Issue は **WHAT・スコープ止まり**で軽くする。HOW は子オーケストが内部で導く。

### 規模に応じた畳み方

- **超軽微**（値戻し・1 ファイル修正・設定追加）: 起票〜実装を **1 セッションに畳む**。
- **小〜中規模**: オーケスト 1 セッション + 実装サブエージェント。
- **大規模**: オーケストが Phase ごとに**新マスターセッション**へ再帰。各 Phase 内の実装はサブエージェント。
- スケールは**オーケストの再帰**で吸収する（実装の物量はサブエージェントの独立コンテキストが吸収するため、実装側のセッション分割は不要）。
- 末端のつもりが想定より大きいと判明したら、押し切らず **末端 → 分岐へ昇格**してよい（サブ Issue を切って子に渡す＝安全弁）。

### 実装〜PR の流れ

1. オーケストが実装可能コンテキストを用意し、**実装サブエージェント（Sonnet）**に実装＋テストを実施させる。
2. オーケストが結果を **客観信号（テスト / ビルド / diff）で検証**する（サブエージェントのサマリーを鵜呑みにしない）。
3. 妥当なら、**オーケストが** Draft PR を作成し、ウォッチする（CI 失敗の autofix を含む）。**PR 作成はサブエージェントにさせない。**
4. **実装単位（サブエージェント 1 回）ごとに小さい Draft PR + 人力レビュー**とする（大粒度レビューは避ける）。
5. ★ 人がレビュー・Ready 化・マージ ★（Claude は介入しない）。

### 人ゲートと PR

- PR は **必ず Draft で作成**し、`.github/pull_request_template.md` を埋める。
- 各実装単位の Draft PR は、原則 `integration/**`（大規模時）または `develop`（軽量時）をターゲットにする。
- 作業ブランチ → integration の PR には `Closes #{issue-number}` を含めない（Issue は integration → develop マージ後にクローズ）。
- **integration → develop の PR は Claude が作成してよいが、作成前に必ず人へ確認を取る**。承認後に Draft で作成し、`Closes #{issue-number}` を含めてよい。

### コミット・push

- コミットメッセージは日本語で簡潔に。
- `git push -u origin <branch-name>` を使用。ネットワークエラー時は最大 4 回まで指数バックオフ（2s, 4s, 8s, 16s）でリトライ。
- `--no-verify` 等でフックをスキップしない（明示的な指示がある場合を除く）。
- 作業ブランチ名は自由（PR マージで消えるため、追跡性は Issue / PR 側で確保する）。

---

## integration の考え方

integration は **develop の「いつでもリリース可能」を守る**ための仕組みである。完成前の対応が develop に載ると、完成済みの対応だけを先にリリースできなくなる。integration はその手前で**資材を組み立て・dev 環境で検証する場**であり、develop に載るのは常に完結した単位になる。（dev 環境の後勝ち上書きは前提として許容している。）

- integration が活きるのは、たとえば「複数段階で積み上げる」「dev に出してみないと検証できない」「完成前に develop を汚したくない」対応。
- **dev に資材が出ない軽量変更**（CLAUDE.md / docs 更新、小さなワークフロー改修など）は、integration を切らず **develop へ直接 Draft PR** でよい。
- 命名は `integration/{issue-number}-{slug}`、分岐元は `develop`。
- 上記は例示。網羅的なルールにはせず、**仕組みの特性を理解したうえで適宜判断**する。

---

## Claude が自動で行わないこと（MUST NOT）

以下は人力チェックを挟むため、Claude は自律的に実行してはならない。

- **着手前の方針確認を飛ばすこと**（どんな Issue を立てるか／integration を作るかを人に仰がず、Issue 起票・ブランチ作成・実装・PR を進める）
- **PR ステータスの変更**
    - Draft → Ready の切替
    - PR のマージ
    - PR のクローズ（明示的な指示がある場合を除く）
- **ラベル・マイルストーン・Assignee の付与・変更**（Issue / PR 共通）
- **`develop` / `master` ブランチへの直接 push**
- **`develop` / `master` ブランチへの強制 push（force push）**
- **`integration/xxx` → `develop` の PR 作成**（人の確認が取れた場合のみ可）
- **既存 PR の説明・タイトルの大幅な書き換え**（軽微な修正は可）
- **Issue / PR への過剰なコメント投下**（必要なときだけ）

レビュー対応で追加 push を行っても、Draft 状態は維持すること。Ready 化は人が判断する。

---

## ブランチ戦略の概要

```
claude/**, feature/**  →  integration/**  →  develop  →  master
                       (Fast CI)        (Full CI)    (本番)
```

- `integration/**` と `develop` は dev 環境へ自動デプロイされる
- `master` は本番デプロイ
- 軽量・非デプロイ変更（docs 等）は integration を切らず `develop` へ直接 Draft PR でよい（→「integration の考え方」）
- 詳細は [`docs/branching.md`](docs/branching.md) を参照

---

## ドキュメント駆動開発

**MUST: 実装は必ずドキュメント（Issue 本文または `tasks/`）に従う。ドキュメントなしに実装しない**

- **小規模対応**: `tasks/` ディレクトリは作成しない。実装可能な詳細は**セッション内コンテキスト**（オーケストから実装サブエージェントへのプロンプト）で渡し、Issue 本文へ front-load しない（→「継ぎ目モデル」）
- **大規模対応**: `tasks/{feature-name}/` 配下に仕様ドキュメント（`requirements.md` / `external-design.md` / `design.md`）を作成する
- 実装タスクのフェーズ分け・進捗管理は **Issue 本文 + サブ Issue** で行う（`tasks.md` は廃止）
- 完了後に永続化すべき内容は `docs/` に反映し、`tasks/{feature-name}/` を削除する
- 仕様が不明瞭・矛盾している場合は **実装を停止し、Issue コメントで報告して人に判断を仰ぐ**
- 詳細は [`docs/development/flow.md`](docs/development/flow.md) を参照

---

## モデル運用（Opus / Sonnet）

コスト最適化のため、**ロール単位**でモデルを使い分ける。

| ロール | モデル | 理由 |
|---|---|---|
| 起票・オーケストレーション | Opus | 判断・分解・設計・検証が中心 |
| 実装（サブエージェント） | Sonnet | 渡されたコンテキストに沿った実装が中心 |

- 「同一セッションで Opus → Sonnet に切替」ではなく、**実装を Sonnet サブエージェントとして spawn する**（Agent ツールのモデル指定）。
- 実装担当への引き継ぎは**プロンプト**で行う（→「継ぎ目モデル」）。

---

## サブエージェント運用

実装はオーケストレーターから **サブエージェント**として実行する。

- **役割境界**: 実装サブエージェントは**実装＋テストのみ**を行い、ワークツリーへのコミットまで実施する。PR 作成・Issue 操作・dev 検証は**オーケストレーターの責務**。
- **客観検証**: オーケストレーターはサブエージェントのサマリーを鵜呑みにせず、**テスト / ビルド / diff** で結果を検証してから PR を作成する。
- **制約の焼き込み**: 実装担当は [`.claude/agents/implementer.md`](.claude/agents/implementer.md) にカスタム定義し、リポジトリ規約（libs でパスエイリアス禁止・エラーメッセージ日本語+定数・カバレッジ 80%・UI/ロジック分離）を定義側に持たせる。これによりオーケストレーターの責務肥大を防ぐ。
- **前提（要検証）**: 本運用はサブエージェント機構（モデル指定によるコスト最適化・worktree 並列・background 実行・SendMessage による継続・`.claude/agents/` カスタム）に依存している。これらは**実運用での検証途上**であり、パイロットの結果に応じて本ガイドラインを更新する。

---

## コーディング規約（要点）

詳細は [`docs/development/rules.md`](docs/development/rules.md) を参照。

### MUST

- TypeScript strict mode 必須
- テストカバレッジ 80% 以上（Jest `coverageThreshold` で自動失敗）
- エラーメッセージは日本語 + 定数化（`ERROR_MESSAGES` オブジェクト）
- UI 層（`components/`, `app/`）とビジネスロジック（`lib/`）を分離
- ライブラリ依存の一方向性を保つ（`ui → browser → common`、循環依存禁止）

### MUST NOT

- ライブラリ内でパスエイリアス（`@/`）を使用しない
- `dangerouslySetInnerHTML` を直接使用しない（DOMPurify 経由のみ）

---

## テスト要件（要点）

詳細は [`docs/development/testing.md`](docs/development/testing.md) を参照。

- テストファイルは `tests/` 配下に配置（`src/` と分離）
- 副作用がある処理のみモック化、純粋関数はそのまま実行
- E2E: Fast CI は `chromium-mobile` のみ、Full CI は全デバイス

---

## リポジトリ概要

- **構成**: AWS 上のモノレポ（npm workspaces）
- **技術スタック**: Next.js + TypeScript + Material-UI + Jest + Playwright
- **インフラ**: AWS CDK（CloudFormation / CloudFront / Lambda / ECR）

### ディレクトリ構成

```
libs/
├── common/   # フレームワーク非依存（外部依存なし）
├── browser/  # ブラウザ API（Clipboard、localStorage 等）
├── ui/       # Next.js + Material-UI
├── react/    # React hooks 等
├── nextjs/   # Next.js ユーティリティ
└── aws/      # AWS SDK ユーティリティ

services/     # 各アプリケーション
infra/        # CDK インフラ定義
docs/         # 永続ドキュメント
tasks/        # 開発時一時ドキュメント（完了後に削除）
```

---

## 実行環境

Claude Code on the web で本リポジトリを扱う際の環境固有の事情と運用方針は [`docs/development/claude-environment.md`](docs/development/claude-environment.md) にまとめてある。Playwright / AWS CLI / shared libs ビルド等の相談を受けたら、まずそのドキュメントを参照する。

要点：

- **環境構築の 2 系統**：claude.ai/code の Setup Script（約 7 日キャッシュ、UI 設定）と `.claude/settings.json` の SessionStart hook（毎セッション）は別物。本リポジトリは前者のみ使い、後者は使わない方針
- **Playwright**：素の `npx playwright install` はベースイメージ同梱の global（1.56.1）を呼んでしまうため使わない。プロジェクトローカル CLI（`node_modules/.bin/playwright`）か `npx playwright@<project-version>` を使う
- **WebKit の E2E は on-demand**：Full CI 相当の確認が必要なセッションでのみ `playwright install --with-deps webkit` を実行する
- **shared libs のビルド**：`next dev` や E2E を回す前に `@nagiyu/common → browser → ui → nextjs` の順で `dist/` をビルドする（`npm ci` だけでは作られない）

---

## PR テンプレート遵守

PR 作成時は `.github/pull_request_template.md` の構造に従い、以下を確実に記述する。

- 変更の概要
- 関連 Issue（integration → develop の PR でのみ `Closes #` を使用）
- 変更種別のチェック
- 実装チェックリストの完了状況
- テスト内容
- レビューポイント
- UI 変更がある場合のスクリーンショット

---

## 困ったときの停止判断

以下の状況では作業を停止し、Issue コメントまたはチャットで人に判断を仰ぐ。

- ドキュメントに不明瞭・矛盾がある
- 設計上の重要な分岐判断が必要
- 既存の運用ルールと矛盾する指示を受けた
- 破壊的・不可逆な操作（force push、ブランチ削除、本番リソース変更等）を要求された
- 複数 PR / Issue にまたがる広範囲な変更が必要になった

---

## 参考ドキュメント

- ブランチ戦略: [`docs/branching.md`](docs/branching.md)
- コーディング規約: [`docs/development/rules.md`](docs/development/rules.md)
- アーキテクチャ: [`docs/development/architecture.md`](docs/development/architecture.md)
- テスト戦略: [`docs/development/testing.md`](docs/development/testing.md)
- 開発フロー: [`docs/development/flow.md`](docs/development/flow.md)
- 共通ライブラリ: [`docs/development/shared-libraries.md`](docs/development/shared-libraries.md)
- 共通 UI コンポーネント: [`docs/development/shared-ui-components.md`](docs/development/shared-ui-components.md)
- 実行環境（Claude on Web）: [`docs/development/claude-environment.md`](docs/development/claude-environment.md)
- エージェント資産の住み分け: [`docs/development/agent-assets.md`](docs/development/agent-assets.md)
- PR テンプレート: [`.github/pull_request_template.md`](.github/pull_request_template.md)
