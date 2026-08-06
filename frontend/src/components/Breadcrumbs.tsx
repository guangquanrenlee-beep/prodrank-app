import Link from "next/link";

/**
 * Breadcrumb navigation — visible trail + BreadcrumbList JSON-LD.
 *
 * Usage: <Breadcrumbs items={[{ label: "Tools", href: "/tools" }, { label: "Schema Validator" }]} />
 * The last item is the current page (plain text, no link).
 * Emits BreadcrumbList structured data for SEO/GEO crawlers.
 */
export default function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  if (!items.length) return null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      ...(item.href ? { item: `https://prodrank.app${item.href}` } : {}),
    })),
  };

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-zinc-500 mb-4 flex-wrap">
      <Link href="/" className="hover:text-zinc-300 transition">Home</Link>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            <span className="text-zinc-700">/</span>
            {item.href && !isLast ? (
              <Link href={item.href} className="hover:text-zinc-300 transition">{item.label}</Link>
            ) : (
              <span className={isLast ? "text-zinc-300" : ""}>{item.label}</span>
            )}
          </span>
        );
      })}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </nav>
  );
}
