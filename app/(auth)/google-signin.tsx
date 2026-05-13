"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function GoogleSignIn({ label = "Continue with Google" }: { label?: string }) {
  const [pending, setPending] = useState(false);

  async function handle() {
    setPending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        setPending(false);
        toast.error(`OAuth error: ${error.message}`);
      }
    } catch (e) {
      setPending(false);
      toast.error(e instanceof Error ? e.message : "OAuth failed");
    }
  }

  return (
    <Button type="button" variant="outline" className="w-full" onClick={handle} disabled={pending}>
      {pending ? "Redirecting..." : label}
    </Button>
  );
}
