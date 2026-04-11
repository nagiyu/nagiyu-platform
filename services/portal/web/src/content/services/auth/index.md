---
title: 'nagiyu Auth - 認証サービス（SSO）'
description: 'nagiyuプラットフォームの認証サービス。Google OAuth 2.0を使ったシングルサインオン（SSO）を提供し、各サービスで統一されたログイン体験を実現します。'
service: 'auth'
type: 'overview'
updatedAt: '2026-04-10'
---

## nagiyu Auth とは

nagiyu Auth は、nagiyu プラットフォームを構成する各サービスに対して、統一されたシングルサインオン（SSO）を提供する認証サービスです。Google OAuth 2.0 を基盤としており、Google アカウントさえあれば各サービスへのログインが可能です。一度ログインすると、すべての nagiyu サービスをシームレスに利用できます。

## 主な機能

### Google OAuth 2.0 によるログイン

Google アカウントを使ってシンプルかつセキュアにログインできます。パスワードの管理が不要で、Google の高度なセキュリティ（二段階認証など）をそのまま活用できます。

### シングルサインオン（SSO）

一度 nagiyu Auth でログインすると、Quick Clip・Codec Converter・Stock Tracker など、nagiyu プラットフォームのすべてのサービスで再ログインなしに利用できます。

### セッション管理

ログイン状態はセキュアな HTTP-only Cookie によって管理されます。セッションの有効期限や複数デバイスでのログイン状況を管理画面から確認・制御できます。

### アカウント情報の管理

ダッシュボードからプロフィール情報の確認・更新や、連携しているサービスの確認ができます。

## セキュリティ

### OAuth 2.0 の採用

nagiyu Auth は Google OAuth 2.0 の Authorization Code Flow を採用しています。パスワードはnagiyu のサーバーに保存されず、認証情報は Google が管理します。

### HTTPS 通信

すべての通信は HTTPS（TLS）で暗号化されています。認証トークンや Cookie はセキュアフラグが設定されており、HTTPS 接続でのみ送信されます。

### CSRF 保護

クロスサイトリクエストフォージェリ（CSRF）攻撃を防ぐための対策が実装されています。

## 対象ユーザー

nagiyu Auth は、nagiyu プラットフォームの各サービスを利用するすべてのユーザーが対象です。エンドユーザーとして利用するだけでなく、開発者として nagiyu の API を利用する場合にも認証が必要になります。

## 利用の開始

[https://auth.nagiyu.com](https://auth.nagiyu.com) にアクセスし、「Google でログイン」ボタンをクリックするだけで登録・ログインが完了します。初回ログイン時に自動的にアカウントが作成されます。
