<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/development/ に ADR として抽出し、
    tasks/issue-2380-docker-build-retry/ ディレクトリごと削除します。

    入力: tasks/issue-2380-docker-build-retry/requirements.md
    次に作成するドキュメント: tasks/issue-2380-docker-build-retry/tasks.md
-->

# Docker ビルド失敗の抑制 - 技術設計

---

## コンポーネント設計

### 変更対象モジュール

| モジュール | パス | 役割 |
| --------- | ---- | ---- |
| `build-docker-image` アクション | `.github/actions/build-docker-image/action.yml` | リトライロジックの組み込み |
| `docker-build-lock.sh` スクリプト | `.github/scripts/docker-build-lock.sh` | （参照のみ・変更なし） |

### リトライロジック設計

`build-docker-image` アクションの「Build Docker image」ステップに、
シェルスクリプトによるリトライループを組み込む。

**処理フロー**:

```
docker build を実行
  ├─ 成功 → 終了（exit 0）
  └─ 失敗
       ├─ 出力に "toomanyrequests" を含む && リトライ回数 < 最大値
       │    → 待機（RETRY_WAIT_SECONDS）後にリトライ
       └─ それ以外 → 即座に失敗（exit 1）
```

**設定定数**:

| 定数名 | 値 | 説明 |
| ------ | -- | ---- |
| `MAX_RETRIES` | `5` | 最大リトライ回数 |
| `RETRY_WAIT_SECONDS` | `60` | 1 回あたりの待機時間（秒） |
| `RATE_LIMIT_MESSAGE` | `"toomanyrequests"` | レートエラー判定文字列 |

**ログ出力**:

- リトライ発生時: `"[retry N/MAX] toomanyrequests を検知。WAIT 秒待機してリトライします..."`
- 最大リトライ超過時: `"[error] 最大リトライ回数（MAX 回）を超えました。"`

---

## 実装上の注意点

### 依存関係・前提条件

- `DOCKER_BUILDKIT: 0` は既存設定のまま維持する
    （BuildKit 無効化によりビルドログが逐次出力され、エラー検知が容易）
- `docker build` の終了コードとエラー出力を組み合わせてエラーを判定する

### エラー検知方法

`docker build` の標準エラー出力（stderr）に `toomanyrequests` が含まれるかを確認する。
標準出力・エラー出力を一時ファイルに保存し、終了後に内容を確認する方式を採用する。

### セキュリティ考慮事項

- スクリプト内での外部入力は `inputs.app-version` と `inputs.image-tag` のみ
- 既存のシェルエスケープ処理を踏襲する

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/development/` の CI/CD 関連ドキュメントに ADR として追記すること（必要であれば）：
      <!-- Docker ビルドリトライ方針の採用理由を記録 -->
