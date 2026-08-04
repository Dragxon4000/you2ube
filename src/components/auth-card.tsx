import type { ReactNode } from "react";

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center px-6 py-12 bg-slate-950">
      <section className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-10 shadow-[0_24px_60px_rgba(0,0,0,0.4)]">
        <h1 className="text-2xl font-semibold text-white">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-slate-400">{subtitle}</p>}
        {children}
      </section>
    </main>
  );
}
