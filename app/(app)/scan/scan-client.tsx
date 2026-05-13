"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const MAX_JOBS = 5;
const MAX_DIM = 1600;
const TARGET_BYTES = 1_000_000;

type JobStatus = "queued" | "compressing" | "processing" | "done" | "error";
interface Job {
  id: string;
  filename: string;
  preview: string;
  status: JobStatus;
  error?: string;
  receiptId?: string;
}

async function compressToJpeg(file: File): Promise<Blob> {
  if (file.type === "image/jpeg" && file.size < 800_000) return file;
  const img = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(img, 0, 0, w, h);

  let quality = 0.85;
  let blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob((b) => res(b), "image/jpeg", quality)
  );
  while (blob && blob.size > TARGET_BYTES && quality > 0.4) {
    quality -= 0.1;
    blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", quality)
    );
  }
  if (!blob) throw new Error("compression failed");
  return blob;
}

function statusBadge(s: JobStatus) {
  switch (s) {
    case "queued": return <Badge variant="outline">Queued</Badge>;
    case "compressing": return <Badge variant="secondary">Compressing</Badge>;
    case "processing": return <Badge variant="secondary">Extracting</Badge>;
    case "done": return <Badge>Done</Badge>;
    case "error": return <Badge variant="destructive">Error</Badge>;
  }
}

export function ScanClient() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [running, setRunning] = useState(false);

  function patchJob(id: string, patch: Partial<Job>) {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }

  async function runJob(job: Job, blob: Blob) {
    patchJob(job.id, { status: "processing" });
    const form = new FormData();
    form.append("image", blob, job.filename);
    try {
      const res = await fetch("/api/receipts", { method: "POST", body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        patchJob(job.id, { status: "error", error: body.error ?? `HTTP ${res.status}` });
        return;
      }
      const body = (await res.json()) as { receipt: { id: string } };
      patchJob(job.id, { status: "done", receiptId: body.receipt.id });
    } catch (e) {
      patchJob(job.id, { status: "error", error: e instanceof Error ? e.message : "network error" });
    }
  }

  async function onFiles(files: FileList) {
    const accepted = Array.from(files).slice(0, MAX_JOBS - jobs.filter((j) => j.status !== "error").length);
    if (accepted.length === 0) return;

    const newJobs: Job[] = accepted.map((f) => ({
      id: crypto.randomUUID(),
      filename: f.name,
      preview: URL.createObjectURL(f),
      status: "queued",
    }));
    setJobs((prev) => [...prev, ...newJobs]);

    setRunning(true);
    for (let i = 0; i < accepted.length; i++) {
      const job = newJobs[i];
      const file = accepted[i];
      patchJob(job.id, { status: "compressing" });
      let blob: Blob;
      try {
        blob = await compressToJpeg(file);
      } catch (e) {
        patchJob(job.id, { status: "error", error: e instanceof Error ? e.message : "compress error" });
        continue;
      }
      // Replace preview with compressed blob so it's smaller in memory
      const newPreview = URL.createObjectURL(blob);
      URL.revokeObjectURL(job.preview);
      patchJob(job.id, { preview: newPreview });
      await runJob({ ...job, preview: newPreview }, blob);
    }
    setRunning(false);
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) void onFiles(e.target.files);
    e.target.value = ""; // allow re-picking the same file
  }

  function reset() {
    for (const j of jobs) URL.revokeObjectURL(j.preview);
    setJobs([]);
  }

  const slotsLeft = MAX_JOBS - jobs.filter((j) => j.status !== "error").length;
  const anyDone = jobs.some((j) => j.status === "done");

  return (
    <div className="max-w-md mx-auto px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Scan receipts</h1>
        <p className="text-muted-foreground text-sm">
          Take photos or pick up to {MAX_JOBS} images at once. Processed one by one.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={onChange}
            className="hidden"
          />
          <Button
            size="lg"
            className="w-full h-24 text-base"
            disabled={running || slotsLeft <= 0}
            onClick={() => inputRef.current?.click()}
          >
            {running
              ? "Processing..."
              : slotsLeft <= 0
                ? `Max ${MAX_JOBS} reached — clear to scan more`
                : `📷 Add up to ${slotsLeft} image${slotsLeft === 1 ? "" : "s"}`}
          </Button>
          {jobs.length > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">{jobs.length} image{jobs.length === 1 ? "" : "s"}</span>
              <Button variant="ghost" size="sm" disabled={running} onClick={reset}>
                Clear all
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {jobs.length > 0 && (
        <div className="space-y-2">
          {jobs.map((j) => (
            <div key={j.id} className="flex items-center gap-3 border rounded-md p-2">
              <Image
                src={j.preview}
                alt=""
                width={64}
                height={64}
                unoptimized
                className="w-16 h-16 object-cover rounded border"
              />
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm">{j.filename}</div>
                <div className="mt-1 flex items-center gap-2">
                  {statusBadge(j.status)}
                  {j.error && <span className="text-xs text-destructive truncate">{j.error}</span>}
                </div>
              </div>
              {j.status === "done" && j.receiptId && (
                <Link
                  href={`/receipts/${j.receiptId}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  View
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {anyDone && !running && (
        <div className="flex justify-center">
          <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
            Go to dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
