/**
 * Utility functions for codec-converter
 */

/**
 * Get current Unix timestamp in seconds
 * @returns Current timestamp as Unix epoch seconds
 */
export function getUnixTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}
