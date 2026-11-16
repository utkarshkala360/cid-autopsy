// Real brand assets (src/app/icon.svg is the favicon; public/logo.svg is the
// full wordmark; public/logo-mark.svg is the icon only, same artwork as the
// favicon but as a stable static path — Next serves app/icon.svg through a
// generated /icon route, not a plain /icon.svg one, so it can't be reused
// directly here) — this component is the one place either gets rendered, so
// the header/auth-screen/sidebar brand marks never drift from each other.
export function Logo({ className = "h-8" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src="/board/logo.svg"
      alt="360 Cloud Board"
      className={`w-auto ${className}`}
    />
  );
}

export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/board/logo-mark.svg" alt="360 Cloud Board" className={className} />;
}
