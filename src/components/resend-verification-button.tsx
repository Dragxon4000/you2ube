"use client";

import { useState } from "react";

export function ResendVerificationButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      const data = await res.json();
      setMessage(data.message ?? data.error ?? "Done.");
    } catch {
      setMessage("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={handleClick}
        disabled={loading}
        className="text-sm font-semibold text-amber-300 underline decoration-dotted underline-offset-2 hover:text-amber-200 disabled:opacity-60"
      >
        {loading ? "Sending…" : "Resend verification email"}
      </button>
      {message && <p className="mt-2 text-xs text-amber-400">{message}</p>}
    </div>
  );
}
