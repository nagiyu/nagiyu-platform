---
id: auth/term/session-roles
title: セッションのロール
kind: term
service: auth
sources:
  - services/auth/web/src/lib/auth/auth.ts
  - libs/nextjs/src/auth-config.ts
  - libs/common/src/auth/role-grants.ts
sources_hash: 363b99cd7911134625294a4429d4c9601f5e7d1a50a88d6bfd3a3d24e69a8b79
terms: [platform/term/role, auth/term/role-grant]
related_cards: [auth/flow/sign-in, auth/flow/billing-entitlement, auth/screen/refresh, auth/screen/dashboard]
related_adr:
  - services/auth/architecture.md#ADR-008
  - services/auth/architecture.md#4.3 セッション管理
---

# セッションのロール

ログイン中の利用者の JWT に入っているロール。各サービスは、これを読んで権限を判定する。DB の今の値とは、ずれることがある。

## 説明

- ログイン時に、手動ロールと有効な[課金の権利](./role-grant.md)のロールを合わせて入れる (権利の期限は、この算出のときだけ判定する)
- Auth がセッションを読むとき、次のどれかで DB から読み直す
    - 前回の取得から 5 分を過ぎている
    - `/refresh` が更新を起こした ([権限更新画面](../screen/refresh.md))
- 読み直したとき、ユーザーが DB にいなければロールを空にする。DB の読み取りが失敗したときは、今のロールを残して Admin のエラー履歴へ報告する
- Auth 以外のサービスは、JWT を読むだけで DB を読み直さない。ロールの変更や権利の期限切れは、利用者が Auth を通る (再ログインや `/refresh`) まで、そのサービスに届かないことがある
- セッションの有効期間は 30 日

## 関連するカード

- [サインインの経路](../flow/sign-in.md): ログイン時に入れる
- [契約がロールになる経路](../flow/billing-entitlement.md): 契約の変化が届くしくみ
- [権限更新画面](../screen/refresh.md): 読み直しを起こす
