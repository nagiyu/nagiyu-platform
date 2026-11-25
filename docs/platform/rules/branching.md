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
| 統合ブランチ | `integration/{issue-number}-{slug}` | dev 環境 | Issue 単位で資材を組み立て、dev 環境で検証する |
| develop | `develop` | dev 環境 | 完成した資材だけが載る、いつでもリリース可能な地点 |
| release | `release/vX.Y.Z` | なし | リリースの準備 (バージョン更新など) |
| master | `master` | 本番 | 本番に出ている資材 |

## 作業ブランチ

### 作業ブランチの名前は自由にする

PR のマージで消えるため、名前で追跡する場面がない。どの Issue の作業かは、PR の関連 Issue で追える。

## 統合ブランチ (integration)

### integration は Issue 単位で切る

名前は `integration/{issue-number}-{slug}`、分岐元は `develop` にする。

develop を「いつでもリリース可能」に保つためである。完成前の資材が develop に載ると、完成済みの資材だけを先にリリースできなくなる。integration はその手前で資材を組み立て、dev 環境で検証する場であり、develop に載るのは常に完結した単位になる。

アプリ単位で切ると、同じアプリの別の Issue が混ざり、片方が完成しても、もう片方が終わるまで develop に出せなくなる。

integration を切るか否かの判断は `CLAUDE.md` の「integration の考え方」を正とする。

### dev 環境に資材が出ない変更は integration を切らない

`CLAUDE.md` や docs の更新、小さなワークフローの改修などは、`develop` へ直接 PR を出してよい。dev 環境で検証するものがないためである。

例外として、Portal の技術記事は Markdown だが integration を経由する。原稿の差分では良し悪しが判断できず、dev 環境の描画を見て初めて検証できるためである。書き方は portal-article スキル (`.claude/skills/portal-article/SKILL.md`) に従う。

## develop

### develop には完成した資材だけを載せる

全サービスの資材が集まる地点で、dev 環境へ自動デプロイされる。リリースしたいときに、いつでも `master` へ出せる状態を保つ。

## リリース

### master と develop の資材をずらしたままにしない

master に入れた変更は develop にも入れる。

一時的にずらすことは許容する。たとえば本番だけで失敗する変更 (DynamoDB の GSI を 1 回の更新で 2 つ作る、など) を段階的に反映するため、片方を外してリリースし、次のリリースで戻すような場合である。外したら戻すまでを 1 組として扱い、ずれたまま残さない。

### release ブランチは `release/vX.Y.Z` で準備し、master 向けと develop 向けの両方に PR を出す

起点は状況で決める。

| 状況 | 起点 |
|---|---|
| 通常 | `develop` |
| develop に、まだ本番に出せない資材が載っている | `master` (必要な修正だけを入れる) |

本番の不具合修正も、急ぎかどうかにかかわらずリリースとして扱う。「hotfix」という別の手順は設けない。手順が 1 つなら、守ることも 1 つで済むためである。個別の事情がある場合は、上の「master と develop の資材をずらしたままにしない」の範囲で都度判断する。

手順は release スキル (`.claude/skills/release/SKILL.md`) にある。

## dev 環境

### dev 環境は後勝ちで上書きされると心得る

dev 環境は複数の integration と develop で共有しており、最後にデプロイしたものが残る。同時に複数の integration を検証すると、互いの状態を上書きしうる。

## デプロイと CI

デプロイのトリガーと paths は [ワークフローを書くときの規約](./workflows.md)、デプロイ先は [shared のデプロイ先](../specs/deploy.md) にある。PR の検証は、向き先で Fast CI (`integration/**` 向け) と Full CI (`develop` 向け) に分かれ、その内容は [サービスの PR 検証](../specs/ci/service-verify.md) にある。
