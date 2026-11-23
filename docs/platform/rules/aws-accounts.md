---
sources: []
---

# AWS アカウントとアクセス

AWS アカウントの構成と、人・CI・Claude が AWS に入る方式の規則。構成は AWS Organizations と IAM Identity Center にあり、リポジトリの外なので、出典は持たない。

## アカウント構成

アカウントは 3 つで、Organizations の OU `Workloads` の下に `Prod` と `Dev` を置く。

| アカウント | 役割 | 所属 |
|---|---|---|
| 管理アカウント | 請求、Organizations、IAM Identity Center だけ。ワークロードは置かない | Root 直下 |
| prod | 本番の資材 | `Workloads / Prod` |
| dev | dev の資材 (integration と develop のデプロイ先) | `Workloads / Dev` |

### 管理アカウントは、資材を持つアカウントとは別にする

管理アカウントには、ワークロードを置かない。次の理由で、本番の資材があるアカウントを管理アカウントにしない。

- SCP は管理アカウントには効かない。本番を管理アカウントにすると、最も守りたい本番にガードレールを掛けられない。
- 本番の資格情報が漏れたとき、組織の操作や他アカウントへの切り替えまで被害が及ぶ。
- 管理アカウントは後から変えられない。やり直すには組織ごと作り直す。

### OU は `Workloads / {Prod, Dev}` の 2 階層にする

SCP を OU 単位で掛ける器にするため。共通のガードレール (ルートユーザーの禁止、使わないリージョンの禁止など) は `Workloads` に 1 回付ければ prod と dev の両方に効く。環境ごとの差分だけを `Prod` と `Dev` に付ける。管理アカウントは SCP の対象外なので、Root 直下に置く。

### ルートユーザーのメールアドレスは `+` エイリアスにする

3 つのアカウントとも、ルートユーザーにはアカウントごとに別のメールアドレスが要る。受信箱を増やさないため、`+` エイリアスを使う。日常のログインはルートではなく Identity Center で行うので、ルートのアドレスは日常の運用に響かない。

### Control Tower は使わない

個人の規模には過剰なため、Organizations だけで運用する。

## dev は prod から独立させる

dev アカウントは、prod アカウントに依存させない。prod と dev をつなぐのは、dev-sync によるデータのコピー ([dev-sync](../../development/dev-sync.md)) だけにする。DNS、IAM、S3 のバケットなどの共有の基盤は、各アカウントの中で完結させる。

理由は、本番の資格情報や設定の誤りが dev に波及しないようにし、dev での実験が本番に影響しないようにするため。アカウントを分けた効果を、共有の基盤の便宜のために削らない。具体例は次のとおり。

- DNS は、dev のゾーンを dev アカウントに置き、prod から NS で委任する ([ドメインと証明書](../specs/resource/dns-certificate.md))。
- GitHub Actions のロールは、prod のロールを prod に、dev と PR のロールを dev に置く ([GitHub Actions のロール](../specs/resource/github-actions-oidc.md))。
- Claude の身元 (ユーザー) は prod に置き、信頼を prod から dev への一方向にする ([Claude の AWS アクセス](../specs/resource/claude-access.md))。

## 主体ごとのアクセス方式

| 主体 | 方式 | 理由 |
|---|---|---|
| 人 (コンソール、ローカルの CLI) | IAM Identity Center (SSO) | 長期のキーを持たないため。一時認証情報だけで済む |
| GitHub Actions | GitHub OIDC + AssumeRole ([GitHub Actions のロール](../specs/resource/github-actions-oidc.md)) | ワークフローごとの信頼条件を、トークンで絞れるため。長期のキーを持たない |
| Claude Code on the web | prod のキー保持ユーザーから、両アカウントのロールを引き受ける ([Claude の AWS アクセス](../specs/resource/claude-access.md)) | コンテナに OIDC など身元を示す手段がなく、長期のキーが 1 本だけ要るため |

### IAM Identity Center

- インスタンスは、組織インスタンスで、リージョンは us-east-1 の単一、暗号化は AWS 所有のキーにする。マルチリージョンのインスタンスは、カスタマーマネージドの KMS キーが必須になり、費用とキーポリシーの誤操作によるロックアウトのリスクが増える。us-east-1 に障害があって SSO に入れなくなっても、管理アカウントのルートユーザーで入れる (メンバーアカウントのルートは SCP で禁止しているが、管理アカウントから SCP を外せば使える) ので、冗長にする利点は小さい。
- ID ソースは、Identity Center のディレクトリにする。外部の IdP は使わない。個人の規模で、ユーザーを管理する先を増やさないため。
- 許可セットは、AWS 管理ポリシーをそのまま使う `AdministratorAccess` と `ReadOnlyAccess` の 2 種類に絞る。細かい許可セットを作らないのは、人が 1 人で、ローカルからのデプロイも稀なため、粒度を増やす利点より管理の手間が上回るから。必要になった時点で足す。

### MFA

- Identity Center は、サインインのたびに MFA を求める。未登録なら、サインイン時に登録を強いる。
- 管理アカウントのルートユーザーにも MFA を設定し、予備のデバイスも登録する。

### ルートユーザーを封印する

- 管理アカウントのルートは、日常では使わない。Identity Center が使えないときの最後の手段 (break-glass) として残す。
- prod と dev のルートは、SCP で操作をすべて拒否する。ルートでしかできない操作 (アカウント設定の変更など) が要るときは、管理アカウントから一時的に SCP を外して行う。
- モバイルからの閲覧も、ルートではなく Identity Center で行う。ルートを禁止する前提として、AWS Console Mobile App の「Use a sign-in URL」にアクセスポータルの URL を入れれば入れる。
- 組織の「ルートアクセスの一元管理」(管理アカウントからメンバーのルートの認証情報を削除する機能) は有効にしない。操作は SCP で封じてあり、認証情報まで消すと、復旧に管理アカウントからの操作が要って可逆性が下がる。上乗せされる安全性は小さい。

## SCP

SCP は Organizations のコンソールにあり、リポジトリの外なので、内容の写しは持たない。確かめる場所は、管理アカウントの Organizations → ポリシー → サービスコントロールポリシーで、`WorkloadsBaseline` が `Workloads` の OU にアタッチされていること。prod と dev の両方に効き、`Prod` と `Dev` に固有のものはない。

| 禁じること | 理由 |
|---|---|
| ルートユーザーの利用 | ルートの認証情報が漏れても被害を止める、最後の防壁。日常のログインは Identity Center に寄せてある |
| 組織からの離脱 | 離脱されると、SCP と一括請求の管理の外に出る |
| us-east-1 以外のリージョンの利用 | 全資材が us-east-1 にあり、ほかは使わない。使わないリージョンに資材が作られるのを (誤操作や、漏れた認証情報の悪用で) 防ぐ |

- リージョンの禁止では、グローバルなサービス (IAM、STS、Organizations、CloudFront、Route53、SSO、請求など) を除外している。STS と IAM を除いてあるので、別アカウントのロールを AssumeRole する構成は妨げない。
- 変えるときは、`Dev` の OU に先にアタッチして、dev へのデプロイが通ることを確かめてから、`Workloads` に付け替える。

## CloudTrail の証跡は作らない

イベント履歴 (管理イベント 90 日、無効にできない) だけで運用する。個人の規模の調査なら 90 日で足りる。証跡を作らないので、「CloudTrail の停止を禁じる SCP」も入れない。守る対象がないため。Claude に許す CloudTrail の操作は[Claude の AWS アクセス](../specs/resource/claude-access.md)にある。

## 手順

### ローカルで AWS に入る

人のローカルの作業 (手動のデプロイ、調査) は、SSO で入る。

1. `aws configure sso` で、SSO のセッションとプロファイルを作る。アクセスポータルの URL と、SSO のリージョン (us-east-1) を入れ、アカウントと許可セットを選ぶ。プロファイルは「アカウント × 許可セット」ごとに作る。名前は手元の設定で、リポジトリでは決めない。
2. `aws sso login --sso-session <セッション名>` で、一時認証情報を取る。切れたらやり直す。
3. 確かめる: `aws sts get-caller-identity --profile <プロファイル名>` が `AWSReservedSSO_*` のロールを返すこと。

CDK も同じプロファイル (`--profile`) で使える。

### 新しいアカウントで、デプロイが詰まる点

新しいアカウントの初期の状態が原因で、デプロイが失敗することがある。

- **Lambda の同時実行数の上限**: 新しいアカウントは既定で 10 しかない。`ReservedConcurrentExecutions` を使うサービス (stock-tracker など) のデプロイが失敗するので、Service Quotas で引き上げを先に申請する。
- **S3 のバケット名の一意性**: バケット名は全アカウントで一意なので、別のアカウントに同名のバケットがあると作れない。消した直後も、しばらく (数分) は 409 で失敗する。削除ポリシーが `RETAIN` のバケットは、スタックを消しても残るので、同じ名前では作り直せない。作り直すときは、先にバケットを消すか、別の名前にする。
- **SNS のサブスクリプションの初回の到達確認**: HTTPS エンドポイントへのサブスクリプションは、登録時に到達確認がある。監視の基盤のスタックが、監視対象のアプリのスタックより先に作られる構成だと、初回はアプリがなく、確認に失敗する。初回だけ該当のサブスクリプションを一時的に無効にし、アプリをデプロイしてから有効に戻す。
- **Secrets Manager の `PLACEHOLDER`**: CDK で作った直後のシークレットには `PLACEHOLDER` が入っている。実際の値を入れたあとで、それを使う Lambda などをデプロイし直す。Google OAuth を使うサービスは、新しいアカウントのドメインのリダイレクト URI (例: `https://auth.dev.nagiyu.com/api/auth/callback/google`) も、Google Cloud Console に足す。
