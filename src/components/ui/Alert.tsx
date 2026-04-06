import { clsx } from "clsx";

type AlertVariant = "info" | "success" | "warning" | "error" | "emergency";

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}

const styles: Record<AlertVariant, { container: string; icon: string; title: string }> = {
  info: {
    container: "bg-blue-50 border-blue-200 text-blue-800",
    icon: "text-blue-500",
    title: "text-blue-800",
  },
  success: {
    container: "bg-green-50 border-green-200 text-green-800",
    icon: "text-green-500",
    title: "text-green-800",
  },
  warning: {
    container: "bg-yellow-50 border-yellow-200 text-yellow-800",
    icon: "text-yellow-600",
    title: "text-yellow-900",
  },
  error: {
    container: "bg-red-50 border-red-200 text-red-800",
    icon: "text-red-500",
    title: "text-red-800",
  },
  emergency: {
    container: "bg-red-100 border-red-400 text-red-900 motion-safe:animate-pulse-slow",
    icon: "text-red-600",
    title: "text-red-900 font-bold",
  },
};

const defaultIcons: Record<AlertVariant, string> = {
  info: "ℹ",
  success: "✓",
  warning: "⚠",
  error: "✕",
  emergency: "🚨",
};

export function Alert({
  variant = "info",
  title,
  children,
  className,
  icon,
}: AlertProps) {
  const s = styles[variant];

  return (
    <div
      role="alert"
      className={clsx(
        "flex gap-3 rounded-xl border p-4",
        s.container,
        className
      )}
    >
      <span className={clsx("shrink-0 text-lg leading-none", s.icon)}>
        {icon || defaultIcons[variant]}
      </span>
      <div className="flex-1 min-w-0">
        {title && (
          <p className={clsx("font-semibold mb-1 text-sm", s.title)}>
            {title}
          </p>
        )}
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}
