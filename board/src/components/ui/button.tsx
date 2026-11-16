import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@board/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-panel disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover",
        secondary:
          "border border-border bg-panel text-ink shadow-2xs hover:bg-muted",
        ghost: "text-ink hover:bg-muted",
        destructive: "bg-status-blocked text-white shadow-xs hover:bg-status-blocked/90",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4 text-xs",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export function Button({
  className,
  variant,
  size,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
