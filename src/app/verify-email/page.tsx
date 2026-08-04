"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthCard } from "@/components/auth-card";

type Status = "verifying" | "success" | "error";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<Status>("verifying");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Missing verification token.");
      return;
    }

    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setStatus("error");
          setError(data.error ?? "Unable to verify email.");
          return;
        }
        setStatus("success");
      })
      .catch(() => {
        setStatus("error");
        setError("Something went wrong. Please try again.");
      });
  }, [token]);

  return (
    <AuthCard title="Email verification">
      <div className="mt-6">
        {status === "verifying" && <p className="text-sm text-slate-400">Verifying your email…</p>}
        {status === "success" && (
          <p className="rounded-lg bg-emerald-900/50 border border-emerald-800 px-3 py-2 text-sm text-emerald-300">
            Your email has been verified successfully.
          </p>
        )}
        {status === "error" && (
          <p className="rounded-lg bg-red-900/50 border border-red-800 px-3 py-2 text-sm text-red-300">{error}</p>
        )}
        <p className="mt-6 text-center text-sm text-slate-400">
          <Link href="/dashboard" className="font-semibold text-red-400 hover:underline">
            Go to dashboard
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
