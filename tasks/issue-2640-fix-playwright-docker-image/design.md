# Playwright Docker イメージ更新 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/niconico-mylist-assistant/architecture.md に ADR として抽出し、
    tasks/issue-2640-fix-playwright-docker-image/ ディレクトリごと削除します。

    入力: tasks/issue-2640-fix-playwright-docker-image/requirements.md
    次に作成するドキュメント: tasks/issue-2640-fix-playwright-docker-image/tasks.md
-->

## API 仕様

<!-- 今回の変更に API の追加・変更はなし -->

N/A（API 変更なし）

---

## データモデル

<!-- 今回の変更にデータモデルの変更はなし -->

N/A（データモデル変更なし）

---

## コンポーネント設計

### パッケージ責務分担

| パッケージ | 責務 |
| --------- | ---- |
| `niconico-mylist-assistant/batch` | バッチ処理・Playwright ブラウザ自動化 |

### 変更対象ファイル一覧

| ファイル | パス | 変更内容 |
| -------- | ---- | -------- |
| `Dockerfile` | `services/niconico-mylist-assistant/batch/Dockerfile` | base イメージのタグを `v1.58.0-jammy` → `v1.59.1-jammy` に更新（2箇所） |

### 変更の詳細

`services/niconico-mylist-assistant/batch/Dockerfile` の `FROM` 行を以下のように変更する。

- **変更前**:
    ```
    FROM mcr.microsoft.com/playwright:v1.58.0-jammy AS base
    ```
- **変更後**:
    ```
    FROM mcr.microsoft.com/playwright:v1.59.1-jammy AS base
    ```

Dockerfile はマルチステージビルド構成であり、`base` ステージを `builder` および `runner` の両ステージが継承している。`FROM base` の行はそれぞれのステージで参照されるため、`AS base` の定義行のみ変更すれば全ステージに反映される。

### バージョン管理方針

Playwright のバージョンは以下の2箇所で管理されており、常に一致させる必要がある：

| 管理箇所 | ファイル | 現在の値 | 更新後の値 |
| -------- | -------- | -------- | ---------- |
| npm パッケージ | `services/niconico-mylist-assistant/batch/package.json` | `1.59.1` | 変更なし（既に最新） |
| Docker イメージ | `services/niconico-mylist-assistant/batch/Dockerfile` | `v1.58.0-jammy` | `v1.59.1-jammy` |

---

## 実装上の注意点

### 依存関係・前提条件

- `mcr.microsoft.com/playwright:v1.59.1-jammy` が公式 Microsoft コンテナレジストリに公開されていること（公開済みであることを確認済み）

### パフォーマンス考慮事項

- Docker イメージサイズへの影響は軽微（マイナーバージョン更新のため）
- ビルド時間への影響はなし

### セキュリティ考慮事項

- 公式 Microsoft コンテナレジストリ（`mcr.microsoft.com`）のイメージを使用するため、セキュリティリスクは既存と同等
- マイナーバージョン更新によりセキュリティパッチが適用される可能性がある

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/services/niconico-mylist-assistant/requirements.md` に統合すること：
      <!-- 今回の変更は既存要件の修正であり、追加要件はなし -->
- [ ] `docs/services/niconico-mylist-assistant/architecture.md` に ADR として追記すること（重要な設計決定があれば）：
      <!-- 「Playwright の npm パッケージバージョンと Docker イメージタグは常に一致させる」旨の運用方針を追記する -->
