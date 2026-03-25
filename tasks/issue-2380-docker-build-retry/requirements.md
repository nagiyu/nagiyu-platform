<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/development/ に統合して削除します。
-->

# Docker ビルド失敗の抑制 - 要件定義

---

## 1. ビジネス要件

### 1.1 背景・目的

CI にて Docker ビルドが下記エラーで失敗することが頻発している。

```
Step 21/29 : COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter
0.9.1: Pulling from awsguru/aws-lambda-adapter
invalid from flag value public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1: toomanyrequests: Rate exceeded
Error: Process completed with exit code 1.
```

Lambda Adapter（`public.ecr.aws/awsguru/aws-lambda-adapter`）を使用しているサービスが多く、
並列ビルド時に Public ECR のレート制限に頻繁に抵触している。
現状は S3 ロックによる同時実行数制限（最大 3）を設けているが、抑制が不十分なため、
`toomanyrequests` エラーが発生した場合に待機してリトライする方式を導入する。

### 1.2 対象

- **プライマリー**: CI/CD パイプライン（GitHub Actions）
- **影響を受けるサービス**: Lambda Adapter を使用する全サービス（stock-tracker、admin、tools、auth 等）

### 1.3 ビジネスゴール

- Docker ビルドの `toomanyrequests` エラーによる CI 失敗を撲滅する
- 開発者が手動でリランする手間をなくし、CI の安定稼働を実現する

---

## 2. 機能要件

### 2.1 ユースケース

#### UC-001: Docker ビルドのリトライ

- **概要**: Docker ビルドが `toomanyrequests` エラーで失敗した場合、一定時間待機後にリトライする
- **アクター**: GitHub Actions CI ジョブ
- **前提条件**: Docker ビルドが実行中であり、Public ECR からイメージを COPY している
- **正常フロー**:
    1. Docker ビルドを実行する
    2. `toomanyrequests` エラーが発生する
    3. 一定時間（60 秒以上）待機する
    4. Docker ビルドをリトライする
    5. ビルドが成功したら続行する
- **代替フロー**: エラーが `toomanyrequests` 以外の場合は即座に失敗させる
- **例外フロー**: 最大リトライ回数（5 回）を超えた場合はジョブを失敗させる

### 2.2 機能一覧

| 機能ID | 機能名                     | 説明                                                                   | 優先度 |
| ------ | -------------------------- | ---------------------------------------------------------------------- | ------ |
| F-001  | レートエラー検知           | Docker ビルド出力から `toomanyrequests` を検知する                     | 高     |
| F-002  | 待機付きリトライ           | 検知後に一定時間待機してからビルドをリトライする                       | 高     |
| F-003  | 最大リトライ回数制限       | 無限ループを防ぐため最大リトライ回数（5 回）を設ける                   | 高     |
| F-004  | リトライログ出力           | リトライ発生時にリトライ回数・待機時間をログに出力する                 | 中     |

---

## 3. 非機能要件

### 3.1 パフォーマンス要件

| 項目         | 要件                                               |
| ------------ | -------------------------------------------------- |
| 待機時間     | 1 回あたり 60 秒以上（レート制限解除を待つ最低値） |
| 最大待機時間 | 最大リトライ 5 回 × 60 秒 = 最長 5 分の遅延を許容 |

### 3.2 保守性・拡張性要件

- リトライロジックは `build-docker-image` アクション（または共通スクリプト）に集約し、
  各ワークフローへの変更を最小限にする
- 待機時間・最大リトライ回数はスクリプト内の定数で管理し、変更を容易にする

---

## 4. スコープ外

- ❌ Public ECR へのログイン対応（レート制限はパブリックイメージのため認証不要）
- ❌ ロック上限数の変更（既存の最大 3 制限は維持する）
- ❌ `toomanyrequests` 以外のエラーのリトライ
