---
id: quick-clip/term/usage-tier
title: 利用の段と上限
kind: term
service: quick-clip
sources:
  - services/quick-clip/core/src/libs/usage-plan.ts
  - services/quick-clip/web/src/lib/server/usage-context.ts
  - libs/common/src/auth/roles.ts
  - libs/common/src/auth/permissions.ts
sources_hash: 45c2d4412d885fb3ed85a25f66c3a79d5b9a8a2578df9bd34bdda611e9de0106
terms: [platform/term/role, auth/term/plan-tier]
related_cards: [quick-clip/api/usage, quick-clip/api/jobs, quick-clip/flow/usage-metering, quick-clip/screen/upload]
related_adr:
  - services/quick-clip/architecture.md#ADR-018
---

# 利用の段と上限

使える量を決める 5 つの区分。段ごとに、月の回数 ([AI 解析](./ai-analysis.md)ありとなしで別々) と、1 本の動画の長さの上限を持つ。

## 説明

| 段 | `tier` | AI 解析あり (月) | AI 解析なし (月) | 1 本の長さ |
|---|---|---|---|---|
| 未ログイン | `anonymous` | 0 回 | 3 回 | 60 分 |
| 無料 (ログイン) | `free` | 1 回 | 3 回 | 120 分 |
| スタンダード | `standard` | 4 回 | 5 回 | 180 分 |
| プロ | `pro` | 8 回 | 10 回 | 240 分 |
| 使い放題 | `unlimited` | 上限なし | 上限なし | 240 分 |

- 月は日本時間の暦月で区切る。上限なしは、API の応答では `null`
- 段は、ログイン中の利用者が持つロールの権限で、上の段から順に決める
    - `quick-clip:unlimited` があれば使い放題。なければ `quick-clip:pro` があればプロ、`quick-clip:standard` があればスタンダード。どれもなければ無料
    - ログインしていない (セッションがない) 利用者は未ログイン
    - セッションの検証が例外になったときも、未ログインとして扱う
- 使い放題は有料の[段](../../auth/term/plan-tier.md)ではなく、管理者が手動で付けるロール。プロと両方持っていても使い放題になる。回数は数えず、長さの上限だけを受ける。[ロール](../../platform/term/role.md)の定義にある
- 回数を数える主体は、ログイン中は `USER#{ユーザー ID}`、未ログインは Cookie の匿名 ID (`ANON#{ID}`)。数え方は[利用回数の流れ](../flow/usage-metering.md)にある

## 関連するカード

- [利用状況 API](../api/usage.md)・[ジョブ API](../api/jobs.md)
- [利用回数の流れ](../flow/usage-metering.md)
- [アップロード画面](../screen/upload.md): 残り回数と、上限のときの案内を出す
