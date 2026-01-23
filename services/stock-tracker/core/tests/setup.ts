/**
 * Jest setup file for ESM support
 * Makes Jest globals available in ESM mode
 */

// Re-export Jest globals to make them available globally
import { jest } from '@jest/globals';

// Make jest available globally
global.jest = jest;
