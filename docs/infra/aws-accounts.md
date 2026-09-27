# AWS アカウント構成とアクセス管理

本ドキュメントは、nagiyu-platform の AWS アカウント構成（AWS Organizations）と、人・CI・Claude が AWS にアクセスする方式の設計判断をまとめる。

---

## 概要

AWS Organizations でアカウントを役割ごとに分離し、人のログインは IAM Identity Center（SSO）に集約する。

| アカウント | 役割 | 所属 OU |
| --- | --- | --- |
| 管理アカウント | 請求・Organizations・IAM Identity Center のみ。ワークロードは置かない | Root 直下 |
| prod（既存アカウント） | 本番資材 | `Workloads / Prod` |
| dev | dev 資材（integration / develop のデプロイ先） | `Workloads / Dev` |

- Control Tower は個人規模では過剰なため採用せず、素の Organizations で運用する。
- dev アカウントは prod アカウントから**完全に独立**させる方針とする（[#3819](https://github.com/nagiyu/nagiyu-platform/issues/3819)）。prod と dev の依存は dev-sync によるデータコピー（[dev-sync](../development/dev-sync.md) を参照）だけに絞り、それ以外（DNS・IAM・S3 バケット等の共有基盤）は各アカウントで完結させる。理由は「本番の資格情報・設定ミスが dev 側に波及しない」「dev 側の実験的な変更が本番に影響しない」というアカウント分離の効果を、共有基盤の便宜のために削らないため。
- 上記の移行は develop への取り込み（[#3819](https://github.com/nagiyu/nagiyu-platform/issues/3819) / PR [#3859](https://github.com/nagiyu/nagiyu-platform/pull/3859)）で完了している。prod アカウント（旧単一アカウント）に残っていた旧 dev 資材・旧キー・マルチアカウント化以前の資材は [#3820](https://github.com/nagiyu/nagiyu-platform/issues/3820) / [#3868](https://github.com/nagiyu/nagiyu-platform/issues/3868) で撤去し、SCP も適用済み（後述）。

---

## 設計判断

### 管理アカウントを新規に作り、既存アカウントを prod にした

既存アカウントをそのまま管理アカウントにすることも技術的には可能だったが、採用しなかった。

- **SCP が管理アカウントには効かない**。既存アカウント（本番資材あり）を管理アカウントにすると、最も守りたい本番にガードレールを掛けられない。
- **本番の資格情報が組織全体の権限になる**。本番のデプロイロールや閲覧ユーザーが漏洩した場合に、組織操作や他アカウントへの切替まで波及する。
- **管理アカウントは後から変更できない**。やり直すには組織ごと作り直す必要がある。

逆に「既存を管理アカウントにして prod / dev を新設」する案は、DynamoDB 等のステートフル資材の移行を伴うため避けた。既存アカウントを招待してそのまま prod とすることで、資材を動かさずに済んでいる。

### OU は `Workloads / {Prod, Dev}` の 2 階層

SCP を OU 単位で掛けるための器として作る。共通のガードレール（ルートユーザー利用禁止・未使用リージョン禁止など）は `Workloads` に 1 回付ければ prod / dev の両方に効き、環境ごとの差分だけを `Prod` / `Dev` に付ける。管理アカウントは SCP の対象外なので Root 直下に置く。

### 管理アカウントのメールアドレスは Gmail の `+` エイリアス

AWS アカウントのルートユーザーはアカウントごとに別のメールアドレスが必要なため、管理アカウントには `+` エイリアスを使う（受信箱は同じ）。日常のログインはルートではなく Identity Center のユーザーで行うため、ルートのアドレスが何であっても日常運用には影響しない。

---

## アクセス方式

| 主体 | 方式 | 補足 |
| --- | --- | --- |
| 人（コンソール・ローカル CLI） | IAM Identity Center（SSO） | 長期キーを持たない |
| GitHub Actions | GitHub OIDC + AssumeRole | [IAM](./shared/iam.md) を参照 |
| Claude Code on the web | prod のキー保持ユーザー（長期キー）から、両アカウントの `nagiyu-claude` ロールを AssumeRole | 後述 |
| ルートユーザー | prod / dev は SCP で利用禁止。管理アカウントのみ break-glass として残す | 後述 |

### IAM Identity Center

- **インスタンス**: 組織インスタンス。単一リージョン（us-east-1）で、暗号化は AWS 所有キー。
    - マルチリージョンインスタンスはカスタマーマネージド KMS キーが必須になり、費用とキーポリシー誤操作によるロックアウトリスクが増える。us-east-1 障害時に SSO に入れなくなっても管理アカウントのルートユーザーで入れる（メンバーアカウントのルートは SCP で禁止しているが、管理アカウントから SCP を外せば使える）ため、個人規模では冗長化の利点が小さい。
- **ID ソース**: Identity Center ディレクトリ（外部 IdP は使わない）。
- **MFA**: サインインのたびに要求。未登録ならサインイン時に登録を強制する。
- **許可セット**: AWS 管理ポリシーをそのまま使う 2 種類に絞る。

| 許可セット | 用途 | 割り当て先 |
| --- | --- | --- |
| `AdministratorAccess` | 設定変更・ローカルからのデプロイ | prod / 管理アカウント |
| `ReadOnlyAccess` | 日常の閲覧・調査 | prod |

- 旧ローカル開発ユーザー（デプロイ用 4 ポリシーを付与）に相当する細かい許可セットは作らなかった。人は 1 人で、ローカルからのデプロイも稀なため、粒度を増やす利点より管理コストが上回る。必要になった時点で追加する。
- dev アカウントを作成したら、同じ許可セットを割り当てる。

### ローカル CLI

`aws configure sso` で SSO セッションとプロファイルを作り、`aws sso login` で一時認証情報を取得する。プロファイルは「アカウント × 許可セット」ごとに作る（例: `nagiyu-prod-admin` / `nagiyu-prod-readonly`）。

```bash
aws sso login --sso-session nagiyu
aws sts get-caller-identity --profile nagiyu-prod-admin
```

CDK も `--profile`（または `AWS_PROFILE`）でそのまま使える。セッションが切れたら `aws sso login` をやり直す。

### Claude Code on the web は長期キー 1 本 + 両アカウントのロール

```
キー保持ユーザー（prod）── AssumeRole ──┬→ prod: nagiyu-claude ロール = 共通閲覧ポリシー
                                          └→ dev : nagiyu-claude ロール = 共通閲覧ポリシー + dev 操作ポリシー
```

#### 長期キーを 1 本だけ残す

Claude Code on the web のコンテナには、クラウドに身元を証明する手段（OIDC トークン等）がない。そのため、長期の秘密なしでは AWS に認証できない。次の代替案はいずれも採用しなかった。

- Identity Center などの一時認証情報を人が都度環境変数に入れる：最大 12 時間ほどで失効し、運用が回らない
- IAM Roles Anywhere：証明書の秘密鍵が長期の秘密になるだけで、実質的な改善にならない
- GitHub Actions を中継して OIDC で読む：リポジトリが public のため、ログや成果物から閲覧結果が公開されてしまう

クラウドセッションへの OIDC トークン発行（[anthropics/claude-code#81502](https://github.com/anthropics/claude-code/issues/81502)）が実装されたら、ロールの信頼先を Claude の OIDC プロバイダに差し替えて、キー保持ユーザーを削除する。ロールの信頼ポリシーを変えるだけで済むよう、身元（ユーザー）と権限（ロール）を分けてある。

#### 身元は prod に置く

キー保持ユーザーは prod アカウントに置き、権限は両アカウントの `nagiyu-claude` ロールへの AssumeRole だけにする（自分では何も閲覧できない）。身元は、届くアカウントのうち最も信頼度の高い側に置き、信頼は prod → dev の一方向にする。dev に置くと、dev で IAM を操作できる主体が prod を閲覧できるようになる。たとえば dev の OIDC ロールは `iam:CreateAccessKey` を含み、PR からも引き受けられるため、PR のワークフローからキーを発行して prod を閲覧する経路ができてしまう。

#### ロールは両アカウントで対称にする

`nagiyu-claude` ロールは、両アカウントで同じスタック・同じ名前・同じ信頼関係・同じ共通閲覧ポリシーにする。dev と prod の違いは、dev にだけ付く追加ポリシー 1 点に集約し、構造は分けない。prod は閲覧に徹する。

プロファイルは `nagiyu-prod` / `nagiyu-dev` の 2 つを用意し、既定のプロファイルは作らない。毎回どちらのアカウントかを明示させ、意図せず prod を操作する事故を防ぐ。

#### dev の追加ポリシーの基準

基準は「**実行は可、何が実行されるかの変更は不可**」とし、今後の拡張もこの基準で判断する。dev には prod へ届く経路（dev-sync Lambda のロールから prod テーブル読み取りロールへ）があるため、dev での操作権限が prod の権限に波及しないことが要件になる。

| 操作 | 可否 | 理由 |
| --- | --- | --- |
| Lambda の実行（対象を列挙） | 可 | CI がデプロイしたコードを実行するだけで、権限は広がらない |
| Lambda のコード・設定の変更 | 不可 | dev-sync Lambda に任意のコードを載せると、prod テーブルを直接読めてしまう（PII の Deny も迂回される） |
| IAM 操作・PassRole・AssumeRole | 不可 | 権限昇格の入口になる |
| Secrets の取得・KMS の復号 | 不可 | 共通閲覧ポリシーの Deny を維持する |

実行を許す関数は、ワイルドカードではなく関数名で列挙する。新しく足した関数が自動では許可されないようにし、その都度この基準で判断するため。選定の考え方は次のとおり。

- 手で実行する場面があるスケジュール起動のバッチに絞る。Web 系の関数や画面の操作から呼ばれるハンドラは、手で実行する場面がないので含めない
- 外部送信（Web Push 等）を伴う関数と、一回きりの移行用の関数は含めない
- prod へ届く dev-sync は含めない
- OpenAI 等の有料 API を使う関数でも、改修の対象になるシステムの中核のバッチは、検証のために含める

旧構成の閲覧専用ユーザー `nagiyu-claude-readonly` は、切り替えと動作確認が済むまで並べて残している（撤去は Issue #3871）。

### ルートユーザーの封印

- **管理アカウント**: MFA を設定し、日常は使わない。Identity Center が使えない場合の最終手段（break-glass）として残す。SCP は管理アカウントには効かない。
- **prod / dev アカウント**: SCP でルートユーザーの操作をすべて拒否している（後述）。ルートでしかできない操作（アカウント設定の変更等）が必要になったら、管理アカウントから一時的に SCP を外して行う。
- モバイルからの閲覧もルートではなく Identity Center で行う（AWS Console Mobile App の「Use a sign-in URL」にアクセスポータル URL を入れてサインインできることを確認済み）。ルート禁止を入れる前提として確認した。
- 組織の「ルートアクセスの一元管理」（管理アカウントからメンバーのルート認証情報を削除する機能）は有効化しない。SCP で操作は封じられており、認証情報まで削除すると復旧に管理アカウントからの操作が必要になって可逆性が下がる一方、上乗せされる安全性は小さいため。

---

## SCP（ガードレール）

`Workloads` OU に `WorkloadsBaseline` を 1 本アタッチし、prod / dev の両方に効かせている（Prod / Dev 固有の差分は現状なし）。SCP は Organizations のコンソールで管理しており、CDK 管理ではない。

| 内容 | 理由 |
| --- | --- |
| ルートユーザーの利用禁止 | ルートの認証情報が漏洩しても被害を止める最後の防壁。日常のログインは Identity Center に寄せている |
| 組織からの離脱禁止 | 離脱されると SCP と一括請求の管理外に出てしまうため |
| us-east-1 以外のリージョン禁止 | 全資材が us-east-1 にあり、他リージョンは使わない。未使用リージョンに資材が作られる（誤操作・漏洩した認証情報の悪用）のを防ぐ |

- リージョン禁止では、グローバルサービス（IAM / STS / Organizations / CloudFront / Route53 / SSO / 請求系等）を `NotAction` で除外している。STS / IAM を除外しているため、あるアカウントのユーザーから他アカウントのロールを AssumeRole する構成も妨げない。
- **「CloudTrail 停止禁止」は入れていない**。CloudTrail の証跡（trail）は作らず、イベント履歴（管理イベント 90 日・無効化不可）だけで運用しているため、守る対象がない。個人規模の調査なら 90 日で足りている。
- 適用時は `Dev` OU に先にアタッチして dev へのデプロイが通ることを確認してから、`Workloads` へ付け替えた。内容を変更する際も同じ順で確認する。

<details><summary>WorkloadsBaseline（2026-09 時点）</summary>

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyRootUser",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "ArnLike": { "aws:PrincipalArn": "arn:aws:iam::*:root" }
      }
    },
    {
      "Sid": "DenyLeaveOrganization",
      "Effect": "Deny",
      "Action": "organizations:LeaveOrganization",
      "Resource": "*"
    },
    {
      "Sid": "DenyOutsideUsEast1",
      "Effect": "Deny",
      "NotAction": [
        "account:*",
        "budgets:*",
        "ce:*",
        "cloudfront:*",
        "cur:*",
        "globalaccelerator:*",
        "health:*",
        "iam:*",
        "organizations:*",
        "pricing:*",
        "route53:*",
        "route53domains:*",
        "s3:GetAccountPublicAccessBlock",
        "s3:ListAllMyBuckets",
        "s3:GetBucketLocation",
        "shield:*",
        "sso:*",
        "sts:*",
        "support:*",
        "trustedadvisor:*",
        "waf:*",
        "wafv2:*",
        "waf-regional:*"
      ],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": { "aws:RequestedRegion": ["us-east-1"] }
      }
    }
  ]
}
```

</details>

---

## 構築手順（再構築・アカウント追加時の参考）

### 1. 管理アカウントと Organizations

1. 新規 AWS アカウントを作成する（ルートのメールアドレスは `+` エイリアス、サポートプランは Basic）。
2. 管理アカウントのルートユーザーに MFA を設定する（予備デバイスも登録しておく）。
3. Organizations を「すべての機能」で有効化する。
4. OU `Workloads`、その配下に `Prod` / `Dev` を作成する。
5. 既存アカウントを **アカウント ID 指定**で招待し、既存アカウント側で承諾する。承諾以降、請求は管理アカウントに一括される。
6. 参加したアカウントを該当 OU（既存アカウントは `Prod`）へ移動する。
7. Organizations のポリシーで SCP を有効化し、`WorkloadsBaseline`（前述）を作成して `Workloads` にアタッチする。

### 2. IAM Identity Center

1. 管理アカウントの us-east-1 で Identity Center を有効化する（組織インスタンス・単一リージョン）。
2. 必要に応じてアクセスポータル URL のサブドメインをカスタマイズする。
3. 認証設定で MFA を「サインインのたびに」、未登録時は「サインイン時に登録を要求」にする。
4. ユーザーを作成し、招待メールからパスワードと MFA を設定する。
5. 許可セット `AdministratorAccess` / `ReadOnlyAccess` を事前定義ポリシーから作成する（セッション時間は既定の 1 時間では短いため延ばしている）。
6. アカウントにユーザーと許可セットを割り当てる。
7. アクセスポータルから各アカウント・各許可セットでコンソールに入れること、`aws sts get-caller-identity` が `AWSReservedSSO_*` ロールを返すことを確認する。

### 3. 新規アカウントを一から構築する際に詰まった点

dev アカウントを新規作成して `infra/shared` 等をデプロイした際に実際に発生した、アカウント自体の初期状態に起因する詰まりどころ。次に新規アカウントを構築する際の参考として残す。

- **Lambda の同時実行数上限**: 新規アカウントは既定で 10 しかなく、`ReservedConcurrentExecutions` を使うサービス（stock-tracker 等）のデプロイが失敗する。Service Quotas で引き上げを事前に申請する必要がある。
- **S3 バケット名のグローバル一意性**: 旧アカウントに同名バケットが残っていると新アカウントで同名バケットを作成できない。削除した直後もしばらく（数分〜）409 で作成に失敗する。
    - 逆に、旧アカウント側のスタックは「同名バケットを自分の資材」と認識したまま残る。移行後に旧アカウントのスタックを削除すると、新アカウントに作り直したバケットに対して削除（中身の自動削除・バケットポリシー削除）を試みて AccessDenied で `DELETE_FAILED` になる（#3868）。この場合は `delete-stack --retain-resources` で S3 関連リソースをスタックから切り離して削除する。新アカウントのバケットには影響しない。
- **自己監視 SNS サブスクリプションの初回失敗**: HTTPS エンドポイントへの SNS サブスクリプションは登録時に到達確認が行われるが、監視対象アプリのスタックより監視基盤（AdminInfra 等）のスタックが先に作られる構成では、初回デプロイ時にアプリがまだ存在せず到達確認に失敗する。初回だけ該当サブスクリプションを一時的に無効化し、アプリのデプロイ後に有効化し直す。
- **Secrets Manager の PLACEHOLDER 値**: CDK で作成した直後のシークレットは PLACEHOLDER 値が入っているため、実際の値を投入したあとに依存する Lambda 等の再デプロイが必要になる。Google OAuth を使うサービスでは、新アカウントのドメイン向けのリダイレクト URI（例: `https://auth.dev.nagiyu.com/api/auth/callback/google`）を Google Cloud Console 側にも追加する必要がある。

---

## 関連ドキュメント

- [IAM](./shared/iam.md) - デプロイポリシー、GitHub Actions OIDC ロール、Claude 用ロールとキー保持ユーザー
- [初回セットアップ](./setup.md)
- [デプロイ手順](./deploy.md)
