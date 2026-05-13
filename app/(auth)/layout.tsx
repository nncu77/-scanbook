import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  let alreadySignedIn = false;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      if (data.user) alreadySignedIn = true;
    } catch {
      // Supabase not configured — render auth pages so user can see the form.
    }
  }
  if (alreadySignedIn) redirect("/dashboard");

  return (
    <div className="flex items-center justify-center py-16 px-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
