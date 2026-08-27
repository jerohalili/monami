"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { IconLogo } from "@/components/icons";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <IconLogo width={36} height={36} className="animate-pulse text-violet-400" />
          <p className="text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return <>{children}</>;
}
