import { NextResponse } from 'next/server';

export function GET(): NextResponse {
  return NextResponse.json({
    status: 'ok',
    version: process.env.APP_VERSION || 'unknown',
  });
}
