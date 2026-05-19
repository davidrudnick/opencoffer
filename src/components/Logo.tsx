import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * OpenCoffer brand mark.
 * Renders the rounded-square chart-line logo at the requested pixel size,
 * with the wordmark optionally to its right.
 */
export function Logo({
  size = 36,
  withWordmark = false,
  className,
  priority,
}: {
  size?: number;
  withWordmark?: boolean;
  className?: string;
  priority?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <Image
        src="/logo.png"
        alt="OpenCoffer"
        width={size}
        height={size}
        priority={priority}
        className="shrink-0"
      />
      {withWordmark && (
        <span className="title-m text-on-surface">OpenCoffer</span>
      )}
    </span>
  );
}
