import '@testing-library/jest-dom';

// Mock Next.js server APIs that are not available in test environment
class MockHeaders {
  private map = new Map<string, string>();

  append(name: string, value: string) {
    const existing = this.map.get(name.toLowerCase());
    this.map.set(name.toLowerCase(), existing ? `${existing}, ${value}` : value);
  }

  delete(name: string) {
    this.map.delete(name.toLowerCase());
  }

  get(name: string) {
    return this.map.get(name.toLowerCase()) || null;
  }

  has(name: string) {
    return this.map.has(name.toLowerCase());
  }

  set(name: string, value: string) {
    this.map.set(name.toLowerCase(), value);
  }

  forEach(callback: (value: string, name: string) => void) {
    this.map.forEach((value, name) => callback(value, name));
  }

  entries() {
    return this.map.entries();
  }

  keys() {
    return this.map.keys();
  }

  values() {
    return this.map.values();
  }

  [Symbol.iterator]() {
    return this.map.entries();
  }
}

class MockRequest {
  url: string;
  method: string;
  headers: MockHeaders;
  body: any;

  constructor(input: string | URL, init?: RequestInit) {
    this.url = typeof input === 'string' ? input : input.toString();
    this.method = init?.method || 'GET';
    this.headers = new MockHeaders();
    this.body = init?.body;

    // Set headers from init
    if (init?.headers) {
      if (init.headers instanceof Headers || init.headers instanceof MockHeaders) {
        init.headers.forEach((value, key) => {
          this.headers.set(key, value);
        });
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(([key, value]) => {
          this.headers.set(key, value);
        });
      } else {
        Object.entries(init.headers).forEach(([key, value]) => {
          if (typeof value === 'string') {
            this.headers.set(key, value);
          }
        });
      }
    }
  }

  async json() {
    if (typeof this.body === 'string') {
      return JSON.parse(this.body);
    }
    return this.body;
  }
}

class MockResponse {
  body: any;
  status: number;
  headers: MockHeaders;

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    this.body = body;
    this.status = init?.status || 200;
    this.headers = new MockHeaders();
    if (init?.headers) {
      if (init.headers instanceof Headers || init.headers instanceof MockHeaders) {
        init.headers.forEach((value, key) => {
          this.headers.set(key, value);
        });
      }
    }
  }

  async json() {
    if (typeof this.body === 'string') {
      return JSON.parse(this.body);
    }
    return this.body;
  }

  static json(data: any, init?: ResponseInit) {
    const response = new MockResponse(JSON.stringify(data), init);
    response.body = data; // Store the actual data for easy access
    return response;
  }
}

global.Request = MockRequest as any;
global.Response = MockResponse as any;
global.Headers = MockHeaders as any;

// Mock next-auth module to avoid ESM issues
jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    handlers: {},
    auth: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  })),
}));

jest.mock('next-auth/providers/google', () => ({
  __esModule: true,
  default: jest.fn(() => ({})),
}));
