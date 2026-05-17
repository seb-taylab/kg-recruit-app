/**
 * @tier organism
 * @consumes ui/Dialog, ui/Button, ui/Input, ui/Label, ui/Alert, sonner
 * @used-by app/(dashboard)/wing/events/page.tsx
 *
 * Minimal create-event flow for wing admins. The slug becomes the capture
 * URL handle (/capture/<slug>), so it must be unique within the wing — the
 * server action surfaces the duplicate-key error inline.
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createEventAction } from "@/app/(dashboard)/wing/events/actions";

export function CreateEventDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [eventDate, setEventDate] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Auto-derive a slug from the event name as the user types — they can
  // still override before submitting. Standard kebab-case from alphanumeric
  // runs.
  function handleNameChange(value: string) {
    setName(value);
    // Only auto-fill the slug if the user hasn't manually edited it yet
    // (initial state) — otherwise we'd clobber their override.
    if (slug === "" || slug === toSlug(name)) {
      setSlug(toSlug(value));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await createEventAction({ name, slug, eventDate, location });
    setPending(false);
    if (result.ok) {
      toast.success(`Event "${name}" created — capture URL ready.`);
      setOpen(false);
      setName("");
      setSlug("");
      setEventDate("");
      setLocation("");
      router.refresh();
    } else {
      setError(result.error ?? "Couldn't create — try again in a minute.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">New event</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create an event</DialogTitle>
          <DialogDescription>
            Each event gets its own capture URL — open it on the booth tablet
            and the form is ready for attendees.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ev-name">Event name</Label>
            <Input
              id="ev-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
              autoComplete="off"
              placeholder="e.g. YP40 — 40th Anniversary"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ev-slug">URL slug</Label>
            <Input
              id="ev-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              autoComplete="off"
              placeholder="yp40"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
            />
            <p className="text-xs text-text-muted">
              Capture URL becomes <code>/capture/{slug || "<slug>"}</code>
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ev-date">Event date (optional)</Label>
              <Input
                id="ev-date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ev-location">Location (optional)</Label>
              <Input
                id="ev-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                autoComplete="off"
                placeholder="e.g. Sengkang CC"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
