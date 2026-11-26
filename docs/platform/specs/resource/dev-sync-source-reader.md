---
sources:
  - infra/shared/lib/iam/dev-sync-source-reader-stack.ts
  - infra/shared/lib/account-scope.ts
sources_hash: f78d4b29d68e3d4ab2fccd93450f48e7a9533f4738b7030222a51eeea92ba93c
---

# dev-sync の読み取りロール

dev アカウントの dev-sync の Lambda が、prod アカウントの DynamoDB テーブルを読むために引き受ける IAM ロール。prod アカウントにだけ作る ([shared のデプロイ先](../deploy.md)のスタック一覧)。

## リソース

| 名前 | 種類 | 置くアカウント | 用途 |
|---|---|---|---|
| `nagiyu-dev-sync-source-reader` | IAM ロール | prod | dev-sync が prod のテーブルを読むときの身元。読み取りの権限しか持たない |

- スタックは [shared のデプロイ先](../deploy.md)の「スタック」の一覧にある
- スタックの Output `SourceReaderRoleArnExport` に、ロールの ARN を出す。dev 側の Lambda は、この Output を参照せず、ロール名から組み立てた ARN を環境変数で受け取る ([同期の実行環境](../../../services/dev-sync/specs/resource/batch-runtime.md))

## 信頼ポリシー

| 項目 | 値 |
|---|---|
| 信頼する主体 | dev アカウントのアカウントプリンシパル |
| 条件 | `aws:PrincipalArn` が `nagiyu-dev-sync-dev-execution` (dev-sync の Lambda の実行ロール) の ARN と等しい (`ArnEquals`) |

条件により、dev アカウントのうち、dev-sync の実行ロールだけがこのロールを引き受けられる。最大セッション時間は指定しない。

## 権限

| 対象 | 許可する操作 |
|---|---|
| 下の 2 つのテーブルと、そのインデックスすべて (`{テーブルの ARN}/index/*`) | `dynamodb:Scan`、`dynamodb:Query`、`dynamodb:GetItem` |

対象のテーブルは次のとおり。テーブルごとに 1 つの文 (`AllowReadTable…`) を持つ。

| テーブル |
|---|
| `nagiyu-niconico-mylist-assistant-dynamodb-prod` |
| `nagiyu-stock-tracker-main-prod` |

- 書き込み・削除の操作は許さない
- この一覧は、dev-sync のマニフェストのコピー元 (`sourceTable`) と、手で合わせる。パッケージをまたぐ import をしないため、自動では一致しない。足す手順と、足さないときの結果は[同期の実行環境](../../../services/dev-sync/specs/resource/batch-runtime.md)の「手順」にある

## 理由

- AssumeRole でアカウントの境界を越えるのは、対象のテーブルが AWS マネージドキーで暗号化されているため。DynamoDB のリソースポリシーでクロスアカウントの読み取りを許可する方法が使えない
- ロールを prod 側に置くのは、読み取られるデータを持つアカウントの側で、ロールと権限を管理するため。prod のデータへの経路を、prod 側だけで把握できる
- dev アカウントは prod に依存させない方針である ([AWS アカウントとアクセス](../../rules/aws-accounts.md))。prod と dev をつなぐのは dev-sync のデータコピーだけで、prod への入口をこの 1 ロールに絞る。dev 側の実行ロールが持つのは、このロールを引き受ける権限だけである
- 信頼ポリシーの主体を、実行ロールの ARN の直書きにせず、アカウントのプリンシパルと `aws:PrincipalArn` の条件にする。IAM は、存在しないロールをプリンシパルに書くとロールの作成を拒否する。条件にしておけば、このロールを実行ロールより先に作れる
