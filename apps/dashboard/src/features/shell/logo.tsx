import { cn } from "@/lib/utils";

const HOLES = [
  [8, 8],
  [12, 8],
  [16, 8],
  [8, 12],
  [16, 12],
  [8, 16],
  [12, 16],
  [16, 16],
] as const;

/** The Tamiz mark: a sieve whose centre hole is the local, safe route (design `logoMark`). */
export function LogoMark({ className = "size-6" }: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn(className, "shrink-0")} aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" className="fill-foreground" />
      {HOLES.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.5" className="fill-background" />
      ))}
      <circle cx="12" cy="12" r="1.9" className="fill-local" />
    </svg>
  );
}
