import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'admin',
    version: process.env.APP_VERSION || '1.0.0',
    timestamp: new Date().toISOString(),
  });
}
