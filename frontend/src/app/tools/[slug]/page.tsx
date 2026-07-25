import { TOOLS } from "@/lib/content";
import { ToolClient } from "./ToolClient";
import { notFound } from "next/navigation";

export function generateStaticParams() { return TOOLS.map(t => ({ slug: t.slug })); }

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = TOOLS.find(t => t.slug === slug);
  if (!tool) notFound();
  return <ToolClient tool={tool} />;
}
