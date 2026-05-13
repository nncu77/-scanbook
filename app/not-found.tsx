import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <h1 className="text-6xl font-bold tracking-tight mb-2">404</h1>
      <p className="text-muted-foreground mb-6">This page doesn&apos;t exist.</p>
      <Link href="/" className={buttonVariants()}>
        Go home
      </Link>
    </div>
  );
}
