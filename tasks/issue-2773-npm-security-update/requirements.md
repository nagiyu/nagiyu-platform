<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/development/package-management.md に必要に応じて反映し、削除します。
-->

# npm セキュリティ対応・パッケージ統一 要件定義書

---

## 1. ビジネス要件

### 1.1 背景・目的

2026年第15週（2026-04-13）の週次 npm 管理レポート（Issue #2773）にて、以下の問題が検出された。

- **Critical 脆弱性 1件**・**High 脆弱性 1件** のセキュリティリスクが存在する
- quick-clip サービスで使用している `@aws-sdk` 系パッケージのバージョンが他サービスと乖離している
- `infra/quick-clip` の CDK 関連パッケージが他インフラと乖離している

本タスクでは上記問題を解消し、プラットフォームのセキュリティレベルと依存関係の一貫性を維持する。

### 1.2 対象ユーザー

- プラットフォーム開発・運用チーム（セキュリティリスク低減）
- エンドユーザー（脆弱性に起因するサービス停止・情報漏えいの防止）

### 1.3 ビジネスゴール

- Critical・High 脆弱性をゼロにする
- モノレポ内の主要パッケージバージョンを統一し、管理コストを下げる

---

## 2. 機能要件

### 2.1 ユースケース

#### UC-001: axios の Critical 脆弱性を解消する

- **概要**: `axios` の transitive 依存に含まれる SSRF 脆弱性（GHSA-3p68-rc4w-qgx5・GHSA-fvcv-3m26-pcqx）を `overrides` で解消する
- **アクター**: 開発者
- **前提条件**: `axios <=1.14.0` が transitive 依存として解決されている
- **正常フロー**:
    1. ルート `package.json` の `overrides` に `axios` を追加し `>=1.15.0` に固定する
    2. `npm install` を実行して `package-lock.json` を更新する
    3. `npm audit` で Critical 脆弱性が解消されていることを確認する
    4. ビルドとテストが通過することを確認する
- **例外フロー**: `overrides` 適用後にビルドエラーが発生した場合はバージョン指定を調整する

#### UC-002: Next.js の High 脆弱性を解消する

- **概要**: `next` の DoS 脆弱性（GHSA-q4gf-8mx6-v5v3）を直接依存の更新で解消する
- **アクター**: 開発者
- **前提条件**: `next ^16.2.2` が直接依存として使用されている
- **正常フロー**:
    1. 対象ワークスペースの `package.json` で `next` を `^16.2.3` 以上に更新する
    2. `npm install` を実行して `package-lock.json` を更新する
    3. `npm audit` で High 脆弱性が解消されていることを確認する
    4. ビルドとテストが通過することを確認する
- **例外フロー**: `eslint-config-next` 等の依存パッケージを合わせて更新する

#### UC-003: quick-clip の `@aws-sdk` パッケージバージョンを統一する

- **概要**: quick-clip サービス（core・web・lambda）が `^3.1010.0` を使用しているのを他サービスと同じ `^3.1024.0` に揃える
- **アクター**: 開発者
- **前提条件**: 他の大多数のサービスは `^3.1024.0` を使用している
- **正常フロー**:
    1. 対象ワークスペースの `@aws-sdk` 系パッケージを `^3.1024.0` に更新する
    2. `npm install` を実行して `package-lock.json` を更新する
    3. ビルドとテストが通過することを確認する

#### UC-004: infra/quick-clip の CDK パッケージを統一する

- **概要**: `infra/quick-clip` が使用している `aws-cdk-lib ^2.243.0`・`constructs ^10.4.4` を他インフラと同じバージョンに揃える
- **アクター**: 開発者
- **前提条件**: 他の大多数の infra は `aws-cdk-lib ^2.248.0`・`constructs ^10.6.0` を使用している
- **正常フロー**:
    1. `infra/quick-clip/package.json` の CDK パッケージを最新バージョンに更新する
    2. `npm install` を実行する
    3. CDK の synth・diff が通過することを確認する

### 2.2 機能一覧

| 機能ID | 機能名 | 説明 | 優先度 |
| ------ | ------ | ---- | ------ |
| F-001  | axios overrides 設定 | axios を overrides で >=1.15.0 に固定 | 高 |
| F-002  | Next.js 更新 | next を ^16.2.3 以上に更新 | 高 |
| F-003  | quick-clip aws-sdk 統一 | @aws-sdk 系を ^3.1024.0 に更新 | 中 |
| F-004  | infra/quick-clip CDK 統一 | aws-cdk-lib・constructs を他インフラに統一 | 中 |

### 2.3 想定画面の概要

画面変更なし。

---

## 3. 非機能要件

### 3.1 パフォーマンス要件

パッケージ更新による機能変更はないため、既存パフォーマンス要件を維持する。

### 3.2 セキュリティ要件

| 項目 | 要件 |
| ---- | ---- |
| axios | overrides 適用後に `npm audit` で Critical 脆弱性が検出されないこと |
| Next.js | 更新後に `npm audit` で High 脆弱性が検出されないこと |
| overrides 管理 | 適用理由と参照 Advisory URL をコメントで残す（package-management.md 方針準拠） |

### 3.3 可用性要件

- 本タスクはパッケージ更新のみで、サービスの可用性要件に変更なし

### 3.4 保守性・拡張性要件

- overrides に追加したエントリは、直接依存側が修正版をリリースした際に削除レビューを行う
- バージョン統一後は定期メンテナンス時に一括更新できる状態を維持する

---

## 4. ドメインオブジェクト

| エンティティ | 説明 |
| ----------- | ---- |
| overrides | package.json の overrides フィールド。transitive 依存のバージョンを上書き固定する |
| 直接依存 | package.json の dependencies / devDependencies に直接記載されるパッケージ |
| transitive 依存 | 直接依存パッケージが依存する間接的なパッケージ |

---

## 5. スコープ外

- ❌ Priority 3（改善推奨）に分類されるマイナー／パッチ更新（別タスク or 次回定期メンテで対応）
- ❌ メジャーバージョンアップ（next-auth ベータ版への対応など）
- ❌ 依存パッケージの追加・削除に伴う機能改修

---

## 6. 用語集

| 用語 | 定義 |
| ---- | ---- |
| overrides | npm の機能。transitive 依存パッケージのバージョンを強制的に上書きするフィールド |
| SSRF | Server-Side Request Forgery。サーバー側で意図しない外部リクエストが発生する脆弱性 |
| DoS | Denial of Service。サービス不能攻撃 |
| Advisory | GitHub Advisory Database に登録された脆弱性情報 |
