"use client";

import type { KeyProps } from "../../lib/kle-types";
import { parseLabelColor, getLabelFontSize } from "../../lib/kle-types";
import { sanitizeLabelHtml } from "../../lib/sanitize";
import { LABEL_STYLES_CSS } from "../../lib/key-renderer";

interface LabelRendererProps {
  labels: string[];
  isDecal: boolean;
  faceLeft: number;
  faceTop: number;
  faceWidth: number;
  faceHeight: number;
  bboxW: number;
  bboxH: number;
  keyData: KeyProps;
}

/**
 * Render all 12 label positions for a single key.
 * Positions are computed from key geometry and sanitized for safe output.
 */
export default function LabelRenderer({
  labels,
  isDecal,
  faceLeft,
  faceTop,
  faceWidth,
  faceHeight,
  bboxW,
  bboxH,
  keyData,
}: LabelRendererProps) {
  // Decal labels fill the entire bbox; regular labels sit on the keycap face
  const isDSAorSA = keyData.p && /(?:^|\s)(?:DSA|SA)(?:\s|$)/.test(keyData.p);
  return (
    <div
      style={{
        position: "absolute",
        left: !isDecal ? faceLeft : 0,
        top: !isDecal ? faceTop : 0,
        width: !isDecal ? faceWidth : bboxW,
        height: !isDecal ? faceHeight : bboxH,
        padding: 1,
        zIndex: 3,
        pointerEvents: "none",
        fontFamily: isDSAorSA ? "engravers_gothic_fsregular" : undefined,
      }}
    >
      {labels.slice(0, 12).map((label, pos) => {
        if (!label) return null;
        const labelStyle = LABEL_STYLES_CSS[pos] || {};
        const parsed = parseLabelColor(label);
        const sanitizedHtml = sanitizeLabelHtml(parsed.text);
        // Auto-wrap if contains <br> or natural spaces
        const needsWrap =
          /<br\s*\/?>/i.test(sanitizedHtml) || /\s/.test(sanitizedHtml);
        return (
          <span
            key={pos}
            style={{
              position: "absolute",
              fontSize: getLabelFontSize(keyData, pos),
              lineHeight: 1.2,
              whiteSpace: needsWrap ? "pre-wrap" : "nowrap",
              color: parsed.color || keyData.t || "#000000",
              pointerEvents: "none",
              ...labelStyle,
            }}
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        );
      })}
    </div>
  );
}

LabelRenderer.displayName = "LabelRenderer";
