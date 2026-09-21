import { brand } from "@repo/shared/brand.config";

export function BrandMark({ tint }: { tint?: string }) {
  if (brand.logo.image) {
    return <img src={brand.logo.image} alt={brand.name} className="h-8 w-8" />;
  }
  return (
    <span
      className="inline-flex h-8 w-8 items-center justify-center rounded-md font-bold text-white"
      style={{ background: tint || "rgba(255,255,255,0.15)" }}
    >
      {brand.logo.text}
    </span>
  );
}
