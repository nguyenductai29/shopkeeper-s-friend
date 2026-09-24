import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { isPlaceholderImageUrl } from "@/lib/fileStore";

type ProductImageProps = {
  src?: string | string[] | null;
  alt?: string;
  className?: string;
  iconClassName?: string;
};

export function ProductImage({ src, alt = "", className, iconClassName }: ProductImageProps) {
  const sources = (Array.isArray(src) ? src : [src])
    .map((value) => String(value || "").trim())
    .filter((value) => value && !isPlaceholderImageUrl(value));
  const sourceKey = sources.join("|");
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [sourceKey]);

  const activeSrc = sources[sourceIndex];

  if (!activeSrc) {
    return <Package className={cn("h-5 w-5 text-muted-foreground/40", iconClassName)} />;
  }

  return (
    <img
      src={activeSrc}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => {
        if (sourceIndex < sources.length - 1) {
          setSourceIndex((current) => current + 1);
        } else {
          setSourceIndex(sources.length);
        }
      }}
    />
  );
}
