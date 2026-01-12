import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// Mock TextEncoder/TextDecoder for jsdom
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder as typeof global.TextDecoder;
}

// Mock Next.js Web APIs for Edge Runtime
if (typeof global.Request === 'undefined') {
  global.Request = class Request {} as unknown as typeof global.Request;
}
if (typeof global.Response === 'undefined') {
  global.Response = class Response {} as unknown as typeof global.Response;
}
if (typeof global.Headers === 'undefined') {
  global.Headers = class Headers extends Map {} as unknown as typeof global.Headers;
}
