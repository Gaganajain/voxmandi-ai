/** BazaarBuddy AI mark: two speech bubbles, one per side of the conversation. */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--color-accent)" />
      <path
        d="M7 9.5A2.5 2.5 0 0 1 9.5 7h8A2.5 2.5 0 0 1 20 9.5v5a2.5 2.5 0 0 1-2.5 2.5H12l-3.5 3v-3H9.5A2.5 2.5 0 0 1 7 14.5z"
        fill="var(--color-on-accent)"
      />
      <path
        d="M14 19.5v1a2.5 2.5 0 0 0 2.5 2.5H20l3.5 3v-3h.5a2.5 2.5 0 0 0 2.5-2.5v-5A2.5 2.5 0 0 0 24 13h-1.5"
        fill="none"
        stroke="var(--color-on-accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="font-display text-lg font-extrabold tracking-tight sm:text-xl">
      BazaarBuddy <span className="text-accent">AI</span>
    </span>
  );
}
