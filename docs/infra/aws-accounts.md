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
- 上記の移行は develop への取り込み（[#3819](https://github.com/nagiyu/nagiyu-platform/issues/3819) / PR [#3859](https://github.com/nagiyu/nagiyu-platform/pull/3859)）で完了している。ただし prod アカウントに残る旧 dev 資材（旧バケット・旧ロール・旧アクセスキー等）の削除、および prod に対する SCP 適用は別 Issue（[#3820](https://github.com/nagiyu/nagiyu-platform/issues/3820)）で行う。それまでの間、prod アカウントには使われなくなった旧 dev 資材が残存する。

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
| Claude Code on the web | IAM ユーザー `nagiyu-claude-readonly`（長期キー） | 後述 |
| ルートユーザー | 日常利用しない（MFA 付きで封印） | 後述 |

### IAM Identity Center

- **インスタンス**: 組織インスタンス。単一リージョン（us-east-1）で、暗号化は AWS 所有キー。
    - マルチリージョンインスタンスはカスタマーマネージド KMS キーが必須になり、費用とキーポリシー誤操作によるロックアウトリスクが増える。us-east-1 障害時に SSO に入れなくなっても各アカウントのルートユーザーで入れるため、個人規模では冗長化の利点が小さい。
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

### Claude Code on the web は IAM ユーザーのまま

Claude Code on the web のコンテナは環境変数に置いた認証情報を非対話で使う。Identity Center の一時認証情報は期限（最大 12 時間）ごとにブラウザでの再ログインが必要なため、この用途には合わない。閲覧専用ポリシーに絞った IAM ユーザーの長期キーを使い続ける（詳細は [IAM](./shared/iam.md) を参照）。

### ルートユーザーの封印

- **管理アカウント**: MFA を設定し、日常は使わない。Identity Center が使えない場合の最終手段（break-glass）として残す。
- **prod アカウント**: MFA 付きのまま日常は使わない。
- 組織の「ルートアクセスの一元管理」（管理アカウントからメンバーのルート認証情報を削除する機能）は、SCP によるルートユーザー利用禁止と合わせて判断する。削除すると復旧に管理アカウントからの操作が必要になり、可逆性が下がるため、現時点では有効化していない。

---

## 構築手順（再構築・アカウント追加時の参考）

### 1. 管理アカウントと Organizations

1. 新規 AWS アカウントを作成する（ルートのメールアドレスは `+` エイリアス、サポートプランは Basic）。
2. 管理アカウントのルートユーザーに MFA を設定する（予備デバイスも登録しておく）。
3. Organizations を「すべての機能」で有効化する。
4. OU `Workloads`、その配下に `Prod` / `Dev` を作成する。
5. 既存アカウントを **アカウント ID 指定**で招待し、既存アカウント側で承諾する。承諾以降、請求は管理アカウントに一括される。
6. 参加したアカウントを該当 OU（既存アカウントは `Prod`）へ移動する。

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
- **自己監視 SNS サブスクリプションの初回失敗**: HTTPS エンドポイントへの SNS サブスクリプションは登録時に到達確認が行われるが、監視対象アプリのスタックより監視基盤（AdminInfra 等）のスタックが先に作られる構成では、初回デプロイ時にアプリがまだ存在せず到達確認に失敗する。初回だけ該当サブスクリプションを一時的に無効化し、アプリのデプロイ後に有効化し直す。
- **Secrets Manager の PLACEHOLDER 値**: CDK で作成した直後のシークレットは PLACEHOLDER 値が入っているため、実際の値を投入したあとに依存する Lambda 等の再デプロイが必要になる。Google OAuth を使うサービスでは、新アカウントのドメイン向けのリダイレクト URI（例: `https://auth.dev.nagiyu.com/api/auth/callback/google`）を Google Cloud Console 側にも追加する必要がある。

---

## 関連ドキュメント

- [IAM](./shared/iam.md) - デプロイポリシー、GitHub Actions OIDC ロール、Claude 閲覧専用ユーザー
- [初回セットアップ](./setup.md)
- [デプロイ手順](./deploy.md)
