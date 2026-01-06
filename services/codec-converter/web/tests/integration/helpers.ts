import { test as base, expect } from '@playwright/test';

/**
 * Extend Playwright test with custom fixtures and helpers
 */
export const test = base.extend({
  // Add custom fixtures here if needed
});

export { expect };

/**
 * Helper function to wait for job status to change
 * @param page - Playwright page object
 * @param expectedStatus - The status to wait for (e.g., 'COMPLETED', 'FAILED')
 * @param timeout - Maximum time to wait in milliseconds (default: 120000ms = 2 minutes)
 */
export async function waitForJobStatus(
  page: any,
  expectedStatus: string,
  timeout = 120000
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    // Look for status text on the page
    const statusElement = page.locator(`text=${expectedStatus}`);
    const isVisible = await statusElement.isVisible().catch(() => false);
    
    if (isVisible) {
      return;
    }
    
    // Wait a bit before checking again
    await page.waitForTimeout(2000);
    
    // Optionally reload the page to get updated status
    // (depends on implementation - some might use polling)
  }
  
  throw new Error(`Timeout waiting for job status: ${expectedStatus}`);
}

/**
 * Helper function to create a test video file blob
 * @param sizeInMB - Size of the file in megabytes
 * @returns Buffer containing a minimal valid MP4 file
 */
export function createTestVideoFile(sizeInMB: number): Buffer {
  // Minimal valid MP4 file header (ftyp + mdat boxes)
  // This is a simplified MP4 that most parsers will accept
  const ftypBox = Buffer.from([
    0x00, 0x00, 0x00, 0x20, // box size (32 bytes)
    0x66, 0x74, 0x79, 0x70, // 'ftyp'
    0x69, 0x73, 0x6f, 0x6d, // major brand 'isom'
    0x00, 0x00, 0x02, 0x00, // minor version
    0x69, 0x73, 0x6f, 0x6d, // compatible brand 'isom'
    0x69, 0x73, 0x6f, 0x32, // compatible brand 'iso2'
    0x61, 0x76, 0x63, 0x31, // compatible brand 'avc1'
    0x6d, 0x70, 0x34, 0x31, // compatible brand 'mp41'
  ]);

  const mdatHeaderSize = 8;
  const targetSize = sizeInMB * 1024 * 1024;
  const dataSize = targetSize - ftypBox.length - mdatHeaderSize;

  const mdatHeader = Buffer.alloc(mdatHeaderSize);
  mdatHeader.writeUInt32BE(dataSize + mdatHeaderSize, 0);
  mdatHeader.write('mdat', 4);

  const padding = Buffer.alloc(Math.max(0, dataSize));

  return Buffer.concat([ftypBox, mdatHeader, padding]);
}

/**
 * Helper to generate a unique test file name
 */
export function generateTestFileName(): string {
  return `test-video-${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`;
}
