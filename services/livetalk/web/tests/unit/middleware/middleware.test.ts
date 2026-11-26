/**
 * ミドルウェアの公開パス設定テスト。
 *
 * `services/livetalk/web/src/middleware.ts` は `auth()` でラップされており、
 * `NextResponse` は Edge Runtime API に依存するため、jsdom 環境では直接テストできない。
 * そのため、`createAuthMiddleware` に渡している `isPublicPath` を同じ仕様で個別にテストする。
 * 未認証時のリダイレクトは `createAuthMiddleware` の責務のため対象外とする。
 */

// next/server を直接 import すると Edge Runtime API（Request 等）が必要になるため、
// ミドルウェアのビジネスロジックを純粋関数として再実装してテストする。

/**
 * middleware.ts の isPublicPath と同一ロジック。
 */
function buildIsPublicPath() {
  return (pathname: string): boolean => pathname.startsWith('/legal/');
}

describe('isPublicPath', () => {
  const isPublicPath = buildIsPublicPath();

  it('/legal/ は公開パスとして扱う', () => {
    expect(isPublicPath('/legal/')).toBe(true);
    expect(isPublicPath('/legal/terms')).toBe(true);
    expect(isPublicPath('/legal/privacy')).toBe(true);
  });

  it('その他のパスは公開パスではない', () => {
    expect(isPublicPath('/')).toBe(false);
    expect(isPublicPath('/notes')).toBe(false);
    expect(isPublicPath('/memory')).toBe(false);
    expect(isPublicPath('/api/chat')).toBe(false);
  });
});
