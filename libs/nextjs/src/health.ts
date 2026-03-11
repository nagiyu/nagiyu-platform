import { NextResponse } from 'next/server';

export interface HealthRouteOptions {
  service?: string;
  version?: string;
}

export function createHealthRoute(options?: HealthRouteOptions) {
  return async function GET() {
    return NextResponse.json({
      status: 'ok',
      ...(options?.service && { service: options.service }),
      ...(options?.version && { version: options.version }),
      timestamp: new Date().toISOString(),
    });
  };
}
