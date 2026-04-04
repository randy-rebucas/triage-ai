import { clsx } from "clsx";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  color?: "blue" | "white" | "gray" | "current";
  className?: string;
}

const sizeMap = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-10 w-10",
};

const colorMap = {
  blue: "border-blue-600 border-t-transparent",
  white: "border-white border-t-transparent",
  gray: "border-gray-400 border-t-transparent",
  current: "border-current border-t-transparent",
};

export function LoadingSpinner({
  size = "md",
  color = "blue",
  className,
}: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={clsx(
        "animate-spin rounded-full border-2",
        sizeMap[size],
        colorMap[color],
        className
      )}
    />
  );
}

export function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-sm text-gray-500">Loading...</p>
      </div>
    </div>
  );
}
