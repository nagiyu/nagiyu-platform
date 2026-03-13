# Share Together ワークフロー改善

## 概要

Share Together の検証ワークフローを、他サービス（stock-tracker, niconico-mylist-assistant）に倣い、
分割された2ファイル構成から1ファイル構成に統合する。

## 関連情報

- Issue: #2084, #2085
- タスクタイプ: プラットフォームタスク（CI/CD ワークフロー改善）

## 現状

現在、Share Together の検証ワークフローは以下の2ファイルに分割されている:

| ファイル                             | トリガーブランチ | 役割                               |
| ------------------------------------ | ---------------- | ---------------------------------- |
| `share-together-web-verify-fast.yml` | `integration/**` | Fast CI（chromium-mobile のみ）    |
| `share-together-web-verify-full.yml` | `develop`        | Full CI（全デバイス + カバレッジ） |

## 要件

### 機能要件

- FR1: 2つのワークフローファイルを1つに統合する
- FR2: `integration/**` および `develop` ブランチへの PR を両方トリガーとする
- FR3: Fast CI（`integration/**`）では chromium-mobile の E2E テストのみ実行する
- FR4: Full CI（`develop`）では全デバイス（chromium-mobile + webkit + chromium-desktop 等）の E2E テストを実行する
- FR5: Full CI（`develop`）のみカバレッジチェックを実行する
- FR6: PR コメントによる結果レポートは、Fast/Full の違いを考慮した内容とする

### 非機能要件

- NFR1: 他サービスの統合ワークフロー（`stock-tracker-verify.yml`, `niconico-mylist-assistant-verify.yml`）の構造に準拠する
- NFR2: `if: github.base_ref == 'develop'` を条件として Full CI 専用ジョブを制御する
- NFR3: 統合後の1ファイルは `share-together-verify.yml` と命名する

## 実装方針

### 統合パターン

`stock-tracker-verify.yml` の構造を参考に以下の方針で統合する:

1. **トリガー条件**: `integration/**` と `develop` の両ブランチを対象とする
2. **Fast/Full の分岐**: Full CI 専用のジョブ（coverage, 追加デバイスの E2E）に `if: github.base_ref == 'develop'` を付与する
3. **E2E テスト**:
   - chromium-mobile: 常時実行（Fast/Full 共通）
   - その他デバイス（webkit-mobile 等）: `develop` 向けのみ実行
4. **カバレッジ**: `develop` 向けのみ実行
5. **PR レポート**: Fast/Full を判定してコメントメッセージを出し分ける

### ファイル変更

- 追加: `.github/workflows/share-together-verify.yml`（統合後の新ファイル）
- 削除: `.github/workflows/share-together-web-verify-fast.yml`
- 削除: `.github/workflows/share-together-web-verify-full.yml`

### 参考ワークフロー

- `.github/workflows/stock-tracker-verify.yml`（701行）
- `.github/workflows/niconico-mylist-assistant-verify.yml`（677行）

## タスク

- [x] T001: `stock-tracker-verify.yml` と現状の Share Together ワークフローを詳細比較し、差分を把握する
- [x] T002: `share-together-verify.yml` を新規作成し、fast/full 両方の動作を統合する
- [x] T003: `share-together-web-verify-fast.yml` と `share-together-web-verify-full.yml` を削除する
- [x] T004: `all-verify.yml` に参照箇所があれば更新する
- [x] T005: ローカルおよび CI での動作確認

## 参考ドキュメント

- `.github/workflows/stock-tracker-verify.yml` - 統合ワークフローの参考実装
- `.github/workflows/niconico-mylist-assistant-verify.yml` - 統合ワークフローの参考実装
- `docs/development/testing.md` - テスト戦略（Fast/Full CI の定義）
- `docs/branching.md` - ブランチ戦略

## 備考・未決定事項

- Share Together に batch コンポーネントは存在しないため、stock-tracker の batch 関連ジョブは不要
- share-together は `core` + `web` の2コンポーネント構成
- E2E テストの追加デバイス（Full CI）は stock-tracker に倣い webkit-mobile および chromium-desktop を対象とする（現状の Full ワークフローは chromium + webkit のみのため要確認）
- カバレッジチェックは core のみ対象（現状の Full ワークフローと同様）
