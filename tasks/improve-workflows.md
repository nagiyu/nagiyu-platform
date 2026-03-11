# ワークフローの改善

## 概要

各サービスの GitHub Actions ワークフローを以下の観点から改善する。

1. 段階的なフロー（lint/format-check → build → test → E2E）を全サービスに適用
2. E2E テストをデバイスごとに並列ジョブ化して時間を短縮
3. Fast/Full の Verify ワークフローを1ファイルに統合し、ターゲットブランチに応じてジョブ実行可否を切り替える

## 関連情報

- Issue: #（ワークフローの改善）
- タスクタイプ: プラットフォームタスク（CI/CD 改善）
- 対象ワークフロー:
  - `.github/workflows/admin-verify-fast.yml` / `admin-verify-full.yml`
  - `.github/workflows/auth-verify-fast.yml` / `auth-verify-full.yml`
  - `.github/workflows/codec-converter-verify-fast.yml` / `codec-converter-verify-full.yml`
  - `.github/workflows/tools-verify-fast.yml` / `tools-verify-full.yml`
  - `.github/workflows/stock-tracker-verify-fast.yml` / `stock-tracker-verify-full.yml`（E2E並列化のみ）
  - `.github/workflows/niconico-mylist-assistant-verify-fast.yml` / `niconico-mylist-assistant-verify-full.yml`（E2E並列化のみ）
- 対象外ワークフロー（E2E テストなし・単一ファイル構成のため変更不要）:
  - `.github/workflows/browser-verify.yml`
  - `.github/workflows/common-verify.yml`
  - `.github/workflows/nextjs-verify.yml`
  - `.github/workflows/react-verify.yml`
  - `.github/workflows/ui-verify.yml`
  - `.github/workflows/infra-common-verify.yml`
  - `.github/workflows/auth-verify.yml`（auth インフラの CDK 専用ワークフロー）

## 現状分析

### 段階的フローの適用状況

| サービス                  | 段階的フロー | Fast/Full 分離 | 備考                                                          |
| ------------------------- | ------------ | -------------- | ------------------------------------------------------------- |
| Stock Tracker             | ✅ あり      | ✅ 分離済み    | lint/format-check → build-core → build-web/batch → test → e2e |
| Niconico Mylist Assistant | ✅ あり      | ✅ 分離済み    | 同上                                                          |
| Admin                     | ❌ なし      | ✅ 分離済み    | 全ジョブが並列実行（lint/build/test が独立）                  |
| Auth                      | ❌ なし      | ✅ 分離済み    | 全ジョブが並列実行（auth-core + auth-web の E2E あり）        |
| Tools                     | ❌ なし      | ✅ 分離済み    | 全ジョブが並列実行                                            |
| Codec Converter           | ❌ なし      | ✅ 分離済み    | 全ジョブが並列実行                                            |

### E2E テストの現状

| ワークフロー       | デバイス                                         | 並列化                          |
| ------------------ | ------------------------------------------------ | ------------------------------- |
| Fast（全サービス） | chromium-mobile のみ                             | 1ジョブ                         |
| Full（全サービス） | chromium-mobile, chromium-desktop, webkit-mobile | 1ジョブ（全デバイスを直列実行） |

Full CI で E2E が 30 分以上かかる主因は、1つのジョブ内で全デバイスを直列実行していること。

### ワークフローファイルの現状

各サービスについて、Fast 用と Full 用の2ファイルが存在している。  
両ファイルの差分はほぼ以下の3点のみであり、重複が多い。

- トリガーブランチ（`integration/**` vs `develop`）
- E2E 対象デバイス（chromium-mobile のみ vs 全デバイス）
- カバレッジチェックジョブの有無

## 要件

### 機能要件

- FR1: Admin、Auth、Tools、Codec Converter に段階的フロー（lint/format-check → build → test → E2E）を適用する
- FR2: 全サービスの E2E テストをデバイスごとに独立したジョブに分割し並列実行する
- FR3: 各サービスの Fast/Full ワークフローを1ファイルに統合する
- FR4: 統合後のワークフローにおいて、`integration/**` へのPRでは chromium-mobile ジョブのみ実行する
- FR5: 統合後のワークフローにおいて、`develop` へのPRでは全デバイスジョブを実行する
- FR6: カバレッジチェックは `develop` へのPR のみ実行する（従来通り）

### 非機能要件

- NFR1: Full CI の E2E 実行時間を大幅に短縮する（デバイス並列化により目標 30 分以内）
- NFR2: 既存の CI 動作（どのジョブが動くか）を変えない（実行ジョブの増減なし）
- NFR3: ワークフローファイルの重複を削減し、保守性を向上する

## 実装方針

### 1. 段階的フローの適用（Admin/Tools/Codec Converter）

Stock Tracker や Niconico Mylist Assistant の構成を参考に、以下の依存関係を設定する。

```
lint, format-check（ゲート）
    └── build-core
            ├── build-web（依存: build-core）
            ├── build-batch（依存: build-core）
            └── test-*, e2e-test（依存: build-web/batch）
```

Admin はコアパッケージを持たないため `lint/format-check → build → test → e2e` のシンプルな段階構成とする。

### 2. E2E テストのデバイス並列化

1ジョブだった E2E テストを以下の3ジョブに分割する。

- `e2e-test-chromium-mobile`（常時実行）
- `e2e-test-chromium-desktop`（`develop` へのPR のみ実行）
- `e2e-test-webkit-mobile`（`develop` へのPR のみ実行）

各ジョブは独立して並列実行されるため、Full CI の E2E 実行時間が約 1/3 に短縮される見込み。

### 3. Fast/Full ワークフローの統合

`fast` と `full` の2ファイルを `verify` の1ファイルに統合する。

ジョブの実行制御は GitHub Actions の `if:` 条件を使用する。

```
# develop へのPRのみ実行するジョブの条件
if: github.base_ref == 'develop'
```

ただし `report` ジョブなどで `needs:` に `if:` でスキップされたジョブが含まれる場合、  
スキップされたジョブの結果は `skipped` となるため `result == 'success' || result == 'skipped'` のように  
判定条件に `skipped` を許容する必要がある点に注意する。

統合後のファイル構成（例: stock-tracker-verify.yml）:

```
on:
  pull_request:
    branches:
      - integration/**
      - develop

jobs:
  lint: ...
  format-check: ...
  build-core: needs [lint, format-check]
  build-web: needs [build-core]
  ...
  e2e-test-chromium-mobile: needs [build-web]
  e2e-test-chromium-desktop:
    needs [build-web]
    if: github.base_ref == 'develop'
  e2e-test-webkit-mobile:
    needs [build-web]
    if: github.base_ref == 'develop'
  coverage:
    needs [build-core]
    if: github.base_ref == 'develop'
  report:
    needs [all jobs...]
    if: always()
```

### 4. 旧ファイルの削除

統合完了後、旧 fast/full ファイルを削除する。

- `*-verify-fast.yml` を削除
- `*-verify-full.yml` を削除
- `*-verify.yml` に統合

## タスク

### Phase 1: 段階的フローの適用（Admin/Auth/Tools/Codec Converter）

- [x] T001: Admin の Fast/Full ワークフローを調査し、段階的フロー（lint → build → test → e2e）を整理する
- [x] T002: Auth の Fast/Full ワークフローを調査し、段階的フロー（lint → build → test → e2e）を整理する
- [x] T003: Tools の Fast/Full ワークフローを調査し、段階的フロー（lint → build → test → e2e）を整理する
- [x] T004: Codec Converter の Fast/Full ワークフローを調査し、段階的フロー（lint → build → test → e2e）を整理する

### Phase 2: E2E テストのデバイス並列化

- [x] T005: Stock Tracker の E2E ジョブをデバイスごとに分割する（chromium-mobile / chromium-desktop / webkit-mobile）
- [x] T006: Niconico Mylist Assistant の E2E ジョブをデバイスごとに分割する
- [x] T007: Admin の E2E ジョブをデバイスごとに分割する
- [x] T008: Auth の E2E ジョブをデバイスごとに分割する
- [x] T009: Tools の E2E ジョブをデバイスごとに分割する
- [x] T010: Codec Converter の E2E ジョブをデバイスごとに分割する

### Phase 3: Fast/Full ワークフローの統合

- [ ] T011: Admin の fast/full を `admin-verify.yml` に統合し、旧ファイルを削除する
- [ ] T012: Auth の fast/full を `auth-verify-app.yml`（または `auth-app-verify.yml`）に統合し、旧ファイルを削除する（既存の `auth-verify.yml` はインフラ CDK 専用のため別名を使用）
- [ ] T013: Tools の fast/full を `tools-verify.yml` に統合し、旧ファイルを削除する
- [ ] T014: Codec Converter の fast/full を `codec-converter-verify.yml` に統合し、旧ファイルを削除する
- [ ] T015: Stock Tracker の fast/full を `stock-tracker-verify.yml` に統合し、旧ファイルを削除する
- [ ] T016: Niconico Mylist Assistant の fast/full を `niconico-mylist-assistant-verify.yml` に統合し、旧ファイルを削除する

### Phase 4: 動作確認

- [ ] T017: `integration/**` ブランチへのPRで chromium-mobile のみの E2E が実行されることを確認する
- [ ] T018: `develop` ブランチへのPRで全デバイスの E2E が並列実行されることを確認する
- [ ] T019: `develop` へのPRでカバレッジチェックが実行されることを確認する
- [ ] T020: 全サービスの段階的フローが正しく機能することを確認する（lint 失敗時にビルドがスキップされること等）

## 実装時の注意事項

### `if:` 条件とジョブの依存関係

- `if:` でスキップされたジョブを `needs:` に含むジョブは、スキップジョブの結果を `skipped` として扱う
- `report` ジョブなどの集約ジョブでは `result == 'success' || result == 'skipped'` で成否を判定すること
- PR のターゲットブランチは `github.base_ref` で参照できる（`github.ref` ではない）

### 優先順位

- 段階的フローの適用と E2E 並列化が本質的な改善
- Fast/Full 統合は追加の改善（複雑性が上がるため、実現困難な場合はスキップ可）

### `report` ジョブのコメント内容

統合後は1つのワークフローで Fast/Full 両方の動作をするため、  
PR コメントに実行モード（Fast/Full）を明示して視認性を保つこと。

## 参考ドキュメント

- [テスト戦略](../docs/development/testing.md) - E2E テスト要件、Fast/Full CI の定義
- [ブランチ戦略](../docs/branching.md) - integration/develop ブランチの役割

## 備考・未決定事項

- Fast/Full 統合の実現可能性は実装時に判断する（複雑度が上がる場合はスキップ可）
- E2E 並列化による実際の時間短縮効果は実装後に計測する
- `auth-verify.yml` は auth インフラ（CDK）専用のワークフローで E2E テストなし。auth のアプリ（auth-web）の E2E は `auth-verify-fast.yml` / `auth-verify-full.yml` に含まれており、これらが改善対象
- libs 系（browser/common/nextjs/react/ui/infra-common）は E2E テストなし・単一ファイル構成のため今回の改善対象外
