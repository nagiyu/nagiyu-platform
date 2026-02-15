import { NextRequest, NextResponse } from 'next/server';
import { POST as registerMylistPost } from '../../mylist/register/route';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

interface BatchSubmitRequestBody {
  email: string;
  password: string;
  mylistName?: string;
  filters: {
    excludeSkip: boolean;
    favoritesOnly: boolean;
  };
}

const DEFAULT_MAX_COUNT = 100;

function createRegisterRequestBody(body: BatchSubmitRequestBody) {
  return {
    maxCount: DEFAULT_MAX_COUNT,
    favoriteOnly: body.filters.favoritesOnly,
    excludeSkip: body.filters.excludeSkip,
    mylistName: body.mylistName,
    niconicoAccount: {
      email: body.email,
      password: body.password,
    },
  };
}

export async function POST(request: NextRequest) {
  let body: BatchSubmitRequestBody;
  try {
    body = (await request.json()) as BatchSubmitRequestBody;
  } catch {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_REQUEST_BODY,
        },
      },
      { status: 400 }
    );
  }

  if (!body.email) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.NICONICO_EMAIL_REQUIRED,
        },
      },
      { status: 400 }
    );
  }

  if (!body.password) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.NICONICO_PASSWORD_REQUIRED,
        },
      },
      { status: 400 }
    );
  }

  if (!body.filters) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.FILTERS_REQUIRED,
        },
      },
      { status: 400 }
    );
  }

  const { excludeSkip, favoritesOnly } = body.filters;
  if (typeof excludeSkip !== 'boolean' || typeof favoritesOnly !== 'boolean') {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.FILTERS_MUST_BE_BOOLEAN,
        },
      },
      { status: 400 }
    );
  }

  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');
  const registerRequest = new NextRequest(request.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(createRegisterRequestBody(body)),
  });
  return registerMylistPost(registerRequest);
}
