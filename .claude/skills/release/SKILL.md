---
name: release
description: 本番リリース（develop → master）を手伝う。マイルストーンの完了確認、release/vX.Y.Z ブランチの作成、Web パッケージのバージョン更新候補の洗い出し、AWS 資材の事前点検、master / develop への Draft PR 作成、マージ後の本番デプロイ確認を行うとき。人の指示を 1 ステップずつ受けて進める。
---

# リリース作業

`develop` を `master` へ取り込み、本番へデプロイするまでの手順。人が都度指示し、Claude は各ステップの調査・準備・確認を受け持つ。**判断（上げるバージョン・進め方）とマージは人**が行う。

## 鉄則

- ステップごとに結果を報告し、**次のステップは人の指示を待つ**（まとめて先走らない）。
- PR は Draft で作成する。Ready 化・マージは人手。
- 本番 AWS は読み取り専用で確認する（Claude の AWS 権限は read-only）。書き込み操作（Lambda 起動・アイテム削除など）は、Claude が内容を用意して**人が実行**する。
- 出力は日本語。

## 1. マイルストーンの完了確認

- `milestone:vX.Y.Z` の Issue を検索し、すべてクローズ済みか確認する。
- マイルストーンの `closed_issues` は **PR も数える**。Issue 検索の件数と合わないときは `milestone:vX.Y.Z` の PR 検索で差分を説明する。

## 2. リリースブランチの作成

- `develop` から `release/vX.Y.Z` を作成する（GitHub の create_branch で可）。

## 3. バージョン更新の候補を出す

`origin/master..origin/release/vX.Y.Z` の差分から、パッケージごとに上げる候補をまとめて人に提示する。

- **本番資材に効く差分だけを見る**。`tests/`・`e2e/`・`playwright.config`・`.env.test`・`eslint.config` などテスト・設定だけの変更は除外する。
- **上げるのは Web パッケージのみ**（慣例）。core / batch / libs / infra は据え置く。
    - ただし共通ライブラリ（`@nagiyu/ui` 等）の修正は、それを使う Web パッケージの patch 候補にする（利用箇所を grep で確認する）。
- 判断の目安:
    - **major**: 利用者から見て互換性のない大きな変化
    - **minor**: 機能追加・画面の刷新・データモデルの再設計。1.0 未満のパッケージでは破壊的変更も minor
    - **patch**: バグ修正、共通ライブラリ修正の反映
    - **据え置き**: リファクタ・テスト・設定のみで本番の挙動が変わらない
- 迷うもの（据え置きか patch か、minor か major か）は「迷いどころ」として分けて提示する。
- Issue タイトルとコミットメッセージ（`git log --no-merges`）を根拠として添える。

## 4. バージョンの更新

人の決定後、`release/vX.Y.Z` 上で更新する。

- `npm version X.Y.Z --no-git-tag-version --workspaces-update=false` を各パッケージのディレクトリで実行する。
- **`npm version` は `package-lock.json` を更新しない**。`package-lock.json` の `packages["services/<svc>/web"].version` を同じ値に書き換える（その行以外は触らない）。
- コミットメッセージ例:

    ```
    リリース準備: vX.Y.Z の Web パッケージのバージョンを更新

    - @nagiyu/xxx-web: 1.4.0 → 1.5.0 (minor)
    ```

## 5. master 取り込み前の AWS 資材点検

`infra/**` と `.github/workflows/*-deploy.yml` の差分を読み、**自動デプロイだけでは済まないもの**を洗い出して人に報告する。

- 各デプロイワークフローが master への push で何をどの順にデプロイするかを確認する（例: 1 コマンドで複数スタックを deploy していれば、1 つの失敗で後続も止まる）。
- 過去に問題になった観点:
    - **DynamoDB の GSI を 1 回の更新で 2 つ以上作成しない**。CloudFormation の更新が失敗する。dev では別々に入っていても、本番で同時に入ると失敗する。段階的に反映する（片方を外してリリースし、後から hotfix で追加する等）。GSI の作成中（CREATING / Backfilling）に次の GSI を追加しても失敗するので、ACTIVE を待つ。
    - **手動発火のバッチ（一回性の移行など）**。起動手順・引数・本番ガード（`confirmEnv` 等）を事前に確認する。**非同期 invoke は既定で最大 2 回リトライされる**ため、冪等でない処理はリトライ 0 回になっているかを見る。実行時間が Lambda の上限（15 分）に収まるかも本番データ量で見積もる。
    - **Secrets Manager / SSM の名前変更**。名前を変えるとリソースが置換され、値が PLACEHOLDER に戻る。
- 本番の現状は AWS CLI（read-only）で確認できる（`describe-table`・`describe-stacks`・`get-function-configuration` 等）。

## 6. PR の作成

`release/vX.Y.Z` から 2 本の Draft PR を作成し、両方を `subscribe_pr_activity` でウォッチする。

- **master 向け**: タイトル `Release vX.Y.Z`。バージョン更新の表（旧 → 新・種別・主な理由と Issue 番号）、据え置いたパッケージとその理由、マージ後の手作業を記載する。
- **develop 向け**: タイトル `Release vX.Y.Z を develop へ反映`。バージョン更新を develop に戻す。
- `.github/pull_request_template.md` の構造に従う（→ `pr-create` スキル）。

## 7. マージ後の本番確認

- master への push で走ったデプロイワークフローがすべて success か確認する（`list_workflow_runs` を `branch: master` で見る）。
- 変更したリソースを AWS CLI で確認する（スタックが UPDATE_COMPLETE、ECS の rollout が COMPLETED、Lambda の更新が Successful など）。
- 待ちが発生する場合は `run_in_background` のポーリングで待つ。定期チェック（`send_later`）は人に頼まれた場合のみ使う。

## 注意点

- **本番向けにだけ入れたコミットを含むリリースブランチは、develop へ再マージしない**（例: 本番の GSI 段階反映のために外した定義）。develop 向け PR をマージした後で release ブランチに追加コミットした場合は特に注意する。
- **hotfix**: master から作業ブランチを切り、master 向けに Draft PR を作る。develop に同じ内容が既にあれば develop へ戻す必要はない（差分がないことを確認する）。
- 本番で問題が出た場合は、修正を develop に入れて dev で確認してから、パッチリリース（vX.Y.Z+1）で本番に入れる（本番で直接試さない）。

## やらないこと（MUST NOT）

- Draft → Ready の切替、マージ
- `master` / `develop` への直接 push
- ラベル・マイルストーンの付与・変更
- 本番 AWS への書き込み操作

## 関連

- [`docs/branching.md`](../../../docs/branching.md)
- [`.claude/skills/pr-create/SKILL.md`](../pr-create/SKILL.md)
- [`.github/pull_request_template.md`](../../../.github/pull_request_template.md)
