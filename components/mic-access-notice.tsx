"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** The page origin, or null when the browser treats the page as secure (mic allowed). */
function insecureOrigin() {
  return window.isSecureContext ? null : window.location.origin;
}

/**
 * Browsers only allow the microphone on HTTPS or localhost. Opening the laptop's
 * dev server from a phone (http://192.168.x.x:3000) is neither, so explain how
 * to allow it instead of letting the mic fail with no context.
 */
export function MicAccessNotice() {
  const origin = useSyncExternalStore(subscribe, insecureOrigin, () => null);
  if (!origin) return null;

  return (
    <div role="alert" className="mx-auto mb-4 max-w-2xl rounded-2xl border border-warn/40 bg-warn-soft p-4 text-sm text-warn">
      <p className="font-bold">The microphone is blocked on this address</p>
      <p className="mt-1 text-text/90">
        Phones only allow the microphone on HTTPS or localhost. This page is open at <code className="font-semibold">{origin}</code>.
        To allow it in Chrome on Android, just for this address:
      </p>
      <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-text/90">
        <li>
          Open <code className="font-semibold">chrome://flags/#unsafely-treat-insecure-origin-as-secure</code>
        </li>
        <li>
          Type <code className="font-semibold">{origin}</code> in the box and set it to <strong>Enabled</strong>
        </li>
        <li>Tap <strong>Relaunch</strong>, then reopen this page</li>
      </ol>
    </div>
  );
}
