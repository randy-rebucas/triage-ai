import { clsx } from "clsx";

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "critical";

interface BadgeProps {
  variant?: BadgeVariant;
  size?: "sm" | "md";
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-gray-100 text-gray-700",
  success: "bg-green-100 text-green-800",
  warning: "bg-yellow-100 text-yellow-800",
  danger: "bg-orange-100 text-orange-800",
  info: "bg-blue-100 text-blue-800",
  critical: "bg-red-100 text-red-800 font-semibold animate-pulse-slow",
};

const dotColors: Record<BadgeVariant, string> = {
  default: "bg-gray-400",
  success: "bg-green-500",
  warning: "bg-yellow-500",
  danger: "bg-orange-500",
  info: "bg-blue-500",
  critical: "bg-red-500",
};

export function Badge({
  variant = "default",
  size = "md",
  dot = false,
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
        variantStyles[variant],
        className
      )}
    >
      {dot && (
        <span
          className={clsx(
            "inline-block h-1.5 w-1.5 rounded-full",
            dotColors[variant]
          )}
        />
      )}
      {children}
    </span>
  );
}

/** Maps a RiskLevel string to the appropriate Badge variant */
export function RiskBadge({
  level,
  score,
}: {
  level: string;
  score?: number;
}) {
  const variantMap: Record<string, BadgeVariant> = {
    low: "success",
    medium: "warning",
    high: "danger",
    critical: "critical",
  };

  const labelMap: Record<string, string> = {
    low: "Low Risk",
    medium: "Medium Risk",
    high: "High Risk",
    critical: "CRITICAL",
  };

  const variant = variantMap[level] || "default";
  const label = labelMap[level] || level;

  return (
    <Badge variant={variant} dot>
      {label}
      {score !== undefined && ` (${score}/100)`}
    </Badge>
  );
}
