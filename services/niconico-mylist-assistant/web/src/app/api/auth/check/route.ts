import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const user = await verifyToken(token);

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
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
