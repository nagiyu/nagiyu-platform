import { NextRequest } from 'next/server';
import { POST as registerMylistPost } from '../../mylist/register/route';

interface BatchSubmitRequestBody {
  email?: string;
  password?: string;
  mylistName?: string;
  filters?: {
    excludeSkip?: boolean;
    favoritesOnly?: boolean;
  };
}

const DEFAULT_MAX_COUNT = 100;

function createRegisterRequestBody(body: BatchSubmitRequestBody) {
  return {
    maxCount: DEFAULT_MAX_COUNT,
    favoriteOnly: body.filters?.favoritesOnly,
    excludeSkip: body.filters?.excludeSkip,
    mylistName: body.mylistName,
    niconicoAccount: {
      email: body.email,
      password: body.password,
    },
  };
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as BatchSubmitRequestBody;
  const registerRequest = new NextRequest(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(createRegisterRequestBody(body)),
  });
  return registerMylistPost(registerRequest);
}
