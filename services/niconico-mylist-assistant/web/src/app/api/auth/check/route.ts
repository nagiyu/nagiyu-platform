import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
    });
  } catch (error) {
    // セキュリティ上の理由から、エラーの詳細は公開しない
    // 開発環境でのデバッグのために、console.error でログに記録
    if (process.env.NODE_ENV === 'development') {
      console.error('Authentication error:', error);
    }
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
