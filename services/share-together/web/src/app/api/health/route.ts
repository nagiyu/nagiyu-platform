import { NextResponse } from 'next/server';
import type { HealthResponse } from '@/types';

export async function GET() {
  const response: HealthResponse = {
    data: {
      status: 'ok',
    },
  };

  return NextResponse.json(response);
}
