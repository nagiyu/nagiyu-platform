<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/services/admin/deployment.md に統合して削除します。
-->

# Admin ワークフロー改善 要件定義書

---

## 1. ビジネス要件

### 1.1 背景・目的

Admin サービスを新規環境に初回デプロイする際、GitHub Actions ワークフロー（`admin-deploy.yml`）が Secrets Manager のシークレット取得ステップで失敗する。
シークレット（`nagiyu-admin-vapid-{env}`）はデプロイ中に作成されるが、取得ステップがその前に実行されるためエラーが発生する。

他のサービスでは「ECR・シークレットなどの資材は Lambda より前にデプロイ済みとする」パターンが採用されており、Admin でも ECR は同様の構成になっている。Secrets Manager も同じパターンに統一することで、初回デプロイを安定させる。

### 1.2 対象ユーザー

- Admin サービスの運用・デプロイを行う開発者・インフラ担当者

### 1.3 ビジネスゴール

- Admin サービスの初回デプロイが手動介入なしで完了できること
- デプロイワークフローが他サービスと同一パターンに統一されること

---

## 2. 機能要件

### 2.1 ユースケース

#### UC-001: Admin サービスの初回デプロイ

- **概要**: 新規環境（dev / prod）へ Admin サービスを初めてデプロイする
- **アクター**: CI/CD システム（GitHub Actions）
- **前提条件**: ECR リポジトリ・シークレットが未作成の状態
- **正常フロー**:
    1. `infrastructure` ジョブが ECR スタックをデプロイする
    2. `infrastructure` ジョブが AdminInfra スタック（Secrets Manager シークレットを含む）をデプロイする
    3. `build` ジョブが Docker イメージをビルドして ECR にプッシュする
    4. `deploy` ジョブが Secrets Manager からシークレットを取得する
    5. `deploy` ジョブが Lambda および CloudFront スタックをデプロイする
- **代替フロー**: `workflow_dispatch` による手動実行でも同一フローが実行される
- **例外フロー**: シークレットが取得できない場合はデプロイを中断する

#### UC-002: Admin サービスの再デプロイ（2回目以降）

- **概要**: 既存環境へ更新をデプロイする
- **アクター**: CI/CD システム（GitHub Actions）
- **前提条件**: ECR・シークレットがすでに作成済み
- **正常フロー**:
    1. `infrastructure` ジョブが ECR スタックを確認・更新する
    2. `infrastructure` ジョブが AdminInfra スタックを確認・更新する
    3. `build` ジョブが Docker イメージをビルドして ECR にプッシュする
    4. `deploy` ジョブが Secrets Manager からシークレットを取得する
    5. `deploy` ジョブが Lambda および CloudFront スタックをデプロイする
- **例外フロー**: UC-001 と同様

### 2.2 機能一覧

| 機能ID | 機能名                          | 説明                                                                  | 優先度 |
| ------ | ------------------------------- | --------------------------------------------------------------------- | ------ |
| F-001  | AdminInfra スタックの事前デプロイ | `infrastructure` ジョブで `NagiyuAdminInfra{Suffix}` スタックをデプロイする | 高     |
| F-002  | デプロイ順序の保証              | ECR → AdminInfra → (Docker build) → Secrets取得 → Lambda/CloudFront の順序を保証する | 高     |

---

## 3. 非機能要件

### 3.1 パフォーマンス要件

| 項目         | 要件                                   |
| ------------ | -------------------------------------- |
| デプロイ時間 | 現行と同等（追加ステップは数分以内）   |

### 3.2 セキュリティ要件

- シークレットの値（VAPID 公開鍵・秘密鍵）は AWS Secrets Manager で管理し、GitHub Actions のログに出力しない
- CDK context 経由でシークレット値を Lambda に渡す既存の方式は変更しない

### 3.3 可用性要件

| 項目               | 要件                                                     |
| ------------------ | -------------------------------------------------------- |
| 初回デプロイ成功率 | 手動介入なしで 100% 完了できること                       |

### 3.4 保守性・拡張性要件

- 他サービスのデプロイワークフローと同一パターンに統一し、保守性を高める
- `admin-deploy.yml` の `infrastructure` ジョブに AdminInfra スタックのデプロイステップを追加する

---

## 4. ドメインオブジェクト

| エンティティ         | 説明                                                           |
| -------------------- | -------------------------------------------------------------- |
| AdminInfra スタック  | SNS・DynamoDB・Secrets Manager を含む CDK スタック（`NagiyuAdminInfra{Suffix}`） |
| VAPID シークレット   | Web Push 通知用の公開鍵・秘密鍵ペア（`nagiyu-admin-vapid-{env}`）|
| ECR スタック         | Docker イメージ格納用のリポジトリ（`NagiyuAdminECR{Suffix}`）  |
| Lambda スタック      | Next.js アプリの実行環境（`NagiyuAdminLambda{Suffix}`）        |
| CloudFront スタック  | グローバル配信・エッジキャッシュ（`NagiyuAdminCloudFront{Suffix}`）|

---

## 5. スコープ外

- ❌ VAPID キーの実際の値の設定（シークレットへの実値投入は別途手動で行う運用）
- ❌ 他サービスのワークフローへの変更
- ❌ CDK スタック構成自体の変更（スタック分割・統合）
- ❌ Lambda・CloudFront スタックのデプロイ順序変更
