/**
 * Stabilizer Offset Lookup
 *
 * Single source of truth for stabilizer offset calculations used by
 * both plate-export and pcb-export modules.
 *
 * Rules: 2u=23.8mm, 3u=38.1mm, 6u=95mm, 6.25u=100mm, 7u=114.3mm spacing
 * Returned values are half-spacing (offset from center to one stabilizer stem).
 */

/**
 * Get the stabilizer offset (mm from center to one stem) for a given key size.
 *
 * @param size Key size in key units (e.g. 2, 2.25, 2.75, 6, 6.25, 7)
 * @returns Offset in mm, or null if no stabilizer is needed (size < 2)
 */
export function getStabOffset(size: number): number | null {
  if (size < 2) return null;
  if (size < 3) return 11.9;      // 2u spacing (23.8mm / 2)
  if (size < 6) return 19.05;     // 3u spacing (38.1mm / 2)
  if (size < 6.25) return 47.5;   // 6u spacing (95mm / 2)
  if (size < 7) return 50;        // 6.25u spacing (100mm / 2)
  return 57.15;                    // 7u spacing (114.3mm / 2)
}
