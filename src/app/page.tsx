"use client";

import dynamic from "next/dynamic";

const EditorPage = dynamic(() => import("@/components/EditorPage"), {
  ssr: false,
});

export default function Home() {
  return <EditorPage />;
}
