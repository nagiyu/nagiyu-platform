---
sources: []
---

# ブランチの規約

ブランチの種類と、それぞれに入れるものの規則と、その理由。ブランチとデプロイの対応は各デプロイのワークフローの `on` にあるが、ブランチの使い方の規則そのものを強制する設定ファイルはないため、出典は持たない。

```
作業ブランチ  →  integration/**  →  develop  →  master
             (Fast CI)          (Full CI)     (本番)
```

## ブランチの種類

| 種類 | 名前 | デプロイ | 目的 |
|---|---|---|---|
| 作業ブランチ | 自由 | なし | 個別の作業 |
| 統合ブランチ | `integration/{issue-number}-{slug}` | dev 環境、docs の公開サイト | Issue 単位で資材を組み立て、dev 環境で検証する |
| develop | `develop` | dev 環境、docs の公開サイト | 完成した資材だけが載る、いつでもリリース可能な地点 |
| release | `release/vX.Y.Z` | なし | リリースの準備 (バージョン更新など) |
| master | `master` | 本番 | 本番に出ている資材 |

docs の公開サイトは 1 つで、`develop` と `integration/**` の push で更新される (`.github/workflows/docs-pages-deploy.yml`)。integration に積んだ文書は、develop に入る前から公開サイトに出る。振る舞いは [docs の検証と公開](../specs/ci/docs.md) にある。

## 作業ブランチ

### 作業ブランチの名前は自由にする

PR のマージで消えるため、名前で追跡する場面がない。どの Issue の作業かは、PR の関連 Issue で追える。

## 統合ブランチ (integration)

### integration は Issue 単位で切る

名前は `integration/{issue-number}-{slug}`、分岐元は `develop` にする。

アプリ単位で切ると、同じアプリの別の Issue が混ざり、片方が完成しても、もう片方が終わるまで develop に出せなくなる。

integration の目的と、切るか否かの判断は `CLAUDE.md` の「integration の考え方」を正とする。

### dev 環境に資材が出る変更は、ファイルの種類によらず integration に載せる

デプロイは変更したファイルのパスで決まり、拡張子では決まらない。`services/` の下の Markdown は、サービスのデプロイ対象に含まれるため dev 環境に出る。たとえば Portal の技術記事 (`services/portal/web/src/content/tech/`) は Markdown だが、`.github/workflows/root-deploy.yml` の paths に当たるため、dev 環境の描画を見て検証する対象である。

`CLAUDE.md` や `docs/` の更新、小さなワークフローの改修のように dev 環境に何も出ないものは、integration を切らずに `develop` へ直接 PR を出してよい。

## develop

### develop には完成した資材だけを載せる

integration での検証が済み、完結した単位だけを載せる。リリースしたいときに、いつでも `master` へ出せる状態を保つためである (`CLAUDE.md` の「integration の考え方」)。

## リリース

### master と develop の資材をずらしたままにしない

master に入れた変更は develop にも入れる。リリースは `develop` から `release/vX.Y.Z` を切って行うため、master にだけ入った変更は、次のリリースで本番から消える。

一時的にずらすことは許容する。たとえば本番だけで失敗する変更 (DynamoDB の GSI を 1 回の更新で 2 つ作る、など) を段階的に反映するため、片方を外してリリースし、次のリリースで戻すような場合である。外したら戻すまでを 1 組として扱い、ずれたまま残さない。

### release ブランチは `release/vX.Y.Z` で準備し、master 向けと develop 向けの両方に PR を出す

起点は状況で決める。

| 状況 | 起点 |
|---|---|
| 通常 | `develop` |
| develop に、まだ本番に出せない資材が載っている | `master` (必要な修正だけを入れる) |

本番の不具合修正も、急ぎかどうかにかかわらずリリースとして扱い、「hotfix」という別の手順は設けない。起点の選び方は上の表で足りる。急ぎの事情があっても、「master と develop の資材をずらしたままにしない」の範囲で都度判断する。

手順は release スキル (`.claude/skills/release/SKILL.md`) にある。

## dev 環境

### dev 環境で確かめる前に、自分の資材が載っているかを確かめる

dev 環境は複数の integration と develop で共有しており、最後にデプロイしたものが残る。同じサービスに別の integration が push されると、自分の資材は上書きされる。さらに、デプロイの順番待ちは 1 つしか持てないため、待っているデプロイは後の push に取り消される。そのため、反映確認と動作確認の前に、デプロイが成功し、自分の資材が載っていることを確かめる。同じサービスへ同時に push する対応は並べず、1 本ずつ進める。進め方は milestone-conductor スキル (`.claude/skills/milestone-conductor/SKILL.md`) にある。

## デプロイと CI

デプロイのトリガーと paths は [ワークフローを書くときの規約](./workflows.md)、デプロイ先は [shared のデプロイ先](../specs/deploy.md) にある。PR の検証は、向き先で Fast CI (`integration/**` 向け) と Full CI (`develop` 向け) に分かれ、その内容は [サービスの PR 検証](../specs/ci/service-verify.md) にある。
