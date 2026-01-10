import '@testing-library/jest-dom';

// Mock TextEncoder/TextDecoder for jsdom
if (typeof TextEncoder === 'undefined') {
  global.TextEncoder = require('util').TextEncoder;
  global.TextDecoder = require('util').TextDecoder;
}
