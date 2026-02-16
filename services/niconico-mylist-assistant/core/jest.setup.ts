// Setup global fetch mock for tests
import { jest } from '@jest/globals';

global.fetch = jest.fn() as any;
