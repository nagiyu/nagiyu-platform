// Mock next/server module

export class NextRequest {
  public nextUrl: {
    searchParams: URLSearchParams;
  };

  constructor(url: string, init?: RequestInit) {
    const urlObj = new URL(url);
    this.nextUrl = {
      searchParams: urlObj.searchParams,
    };
  }

  async json() {
    return {};
  }
}

export class NextResponse {
  public status: number;
  private body: any;

  constructor(body?: any, init?: { status?: number }) {
    this.body = body;
    this.status = init?.status || 200;
  }

  static json(data: any, init?: { status?: number }) {
    return new NextResponse(data, init);
  }

  async json() {
    return this.body;
  }
}
