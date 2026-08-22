"use client";

export function SectionHeader({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="kle-section-title"
      style={{
        fontSize: 10,
        marginBottom: 6,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
