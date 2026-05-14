import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { imageProxyUrl } from "@/lib/fileStore";

type ProductImageProps = {
  src?: string | null;
  alt?: string;
  className?: string;
  iconClassName?: string;
};

export function ProductImage({ src, alt = "", className, iconClassName }: ProductImageProps) {
  const resolvedSrc = imageProxyUrl(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [resolvedSrc]);

  if (!resolvedSrc || failed) {
    return <Package className={cn("h-5 w-5 text-muted-foreground/40", iconClassName)} />;
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
