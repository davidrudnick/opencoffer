import { cn } from "@/lib/utils";

/* Material 3 data table — within a card, dividers between rows, mono numbers. */

export function DataTable({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-2xl bg-surface-low", className)}>
      <table className="w-full min-w-[640px] md:min-w-0">{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-surface-container">{children}</thead>;
}

export function Tr({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "border-b border-outline-variant transition-colors last:border-0 hover:bg-on-surface/[0.04]",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function Th({
  children,
  align = "left",
  className,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <th
      className={cn(
        "label-m px-4 py-3 text-on-surface-variant",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className,
  mono,
  colSpan,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  mono?: boolean;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "body-m px-4 py-4 align-middle text-on-surface",
        mono && "font-mono tabular-nums",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}
