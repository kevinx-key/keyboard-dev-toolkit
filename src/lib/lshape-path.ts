/**
 * 合并 L 形键帽的 SVG path 生成
 *
 * 生成两个矩形并集的外围轮廓，凸角圆弧（convex），凹角直角（sharp）。
 * 适用于 Big-ass Enter、ISO Enter 等非矩形键。
 */

export interface Rect {
  x: number; y: number; w: number; h: number;
}

/**
 * 生成 L 形外围轮廓的 SVG path data。
 * @param a 主矩形
 * @param b 扩展矩形
 * @param divW 容器宽度（用于边界检查）
 * @param divH 容器高度
 * @param r 圆角半径（px）
 */
export function computeLShapeSvgPath(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
  divW: number, divH: number, r: number = 5
): string {
  if (divW <= 0 || divH <= 0) return "";
  const ar = ax + aw, ab = ay + ah;
  const br = bx + bw, bb = by + bh;
  r = Math.min(r, Math.min(aw, ah, bw, bh) / 2);

  // Arc from (x1,y1) toward (x2,y2) around corner center with given sweep
  const A = (x: number, y: number, s: number) => `A ${r} ${r} 0 0 ${s} ${x} ${y}`;

  // ── Case 1: Extension LEFT, notch TOP-LEFT (bigass enter) ──
  if (bx < ax && by > ay) {
    const maxR = Math.max(ar, br);
    const maxB = Math.max(ab, bb);
    return [
      `M ${maxR} ${ay + r}`,
      A(maxR - r, ay, 0),
      `L ${ax + r} ${ay}`,
      A(ax, ay + r, 0),
      `L ${ax} ${by}`,
      `L ${bx + r} ${by}`,
      A(bx, by + r, 0),
      `L ${bx} ${maxB - r}`,
      A(bx + r, maxB, 0),
      `L ${maxR - r} ${maxB}`,
      A(maxR, maxB - r, 0),
      'Z',
    ].join(' ');
  }

  // ── Case 2: Extension LEFT, notch BOTTOM-LEFT (ISO Enter) ──
  if (bx < ax && by <= ay && br >= ar) {
    const M = Math.max(ab, bb);
    return [
      `M ${ar} ${ay + r}`,
      A(ar - r, ay, 0),
      `L ${bx + r} ${ay}`,
      A(bx, ay + r, 0),
      `L ${bx} ${bb - r}`,
      A(bx + r, bb, 0),
      `L ${ax - r} ${bb}`,
      `L ${ax} ${bb}`,
      `L ${ax} ${M - r}`,
      A(ax + r, M, 0),
      `L ${ar - r} ${M}`,
      A(ar, M - r, 0),
      'Z',
    ].join(' ');
  }

  // ── Case 3: Extension RIGHT, notch BOTTOM-RIGHT ──
  if (bx >= ax && by >= ay) {
    const maxR = Math.max(ar, br);
    const maxB = Math.max(ab, bb);
    return [
      `M ${maxR} ${by + r}`,
      A(maxR - r, by, 0),
      `L ${bx + r} ${by}`,
      A(bx, by + r, 0),
      `L ${bx} ${maxB - r}`,
      A(bx + r, maxB, 0),
      `L ${maxR - r} ${maxB}`,
      A(maxR, maxB - r, 0),
      `L ${maxR} ${ay + r}`,
      A(maxR - r, ay, 0),
      `L ${ax + r} ${ay}`,
      A(ax, ay + r, 0),
      `L ${ax} ${by - r}`,
      A(ax + r, by, 0),
      'Z',
    ].join(' ');
  }

  // ── Case 4: Extension RIGHT, notch TOP-RIGHT ──
  if (bx >= ax && by < ay) {
    const maxR = Math.max(ar, br);
    const maxB = Math.max(ab, bb);
    return [
      `M ${maxR} ${by + r}`,
      A(maxR - r, by, 0),
      `L ${bx + r} ${by}`,
      A(bx, by + r, 0),
      `L ${bx} ${ay - r}`,
      `L ${bx} ${ay}`,
      `L ${ax + r} ${ay}`,
      A(ax, ay + r, 0),
      `L ${ax} ${maxB - r}`,
      A(ax + r, maxB, 0),
      `L ${maxR - r} ${maxB}`,
      A(maxR, maxB - r, 0),
      'Z',
    ].join(' ');
  }

  return '';
}
