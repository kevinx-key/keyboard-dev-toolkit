/**
 * Stabilizer Offset Lookup (Cherry 标准中心距)
 *
 * 规则（2026-10-09）：2u–5.75u 默认配 2u 卫星轴（23.8mm 间距）；
 * 6u = 95mm；6.25u–6.75u = 100mm；≥7u = 114.3mm 间距。
 * 返回值为半间距（轴心到单侧卫星轴孔中心的距离）。
 */
export function getStabOffset(size: number): number | null {
  if (size < 2) return null;
  if (size < 6) return 11.9;      // 2u 卫星轴（23.8mm / 2），用于 2u–5.75u
  if (size < 6.25) return 47.5;   // 6u（95mm / 2）
  if (size < 7) return 50;        // 6.25u–6.75u（100mm / 2）
  return 57.15;                    // 7u 及以上（114.3mm / 2）
}
