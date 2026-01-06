import { NextResponse } from 'next/server';

export function middleware() {
  // Phase 1: パススルー (JWT 検証は次のタスクで実装)
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
