/**
 * @tier organism
 * @consumes ui/Button, ui/Card, ui/Input, ui/Label, ui/Select, ui/Switch, sonner
 * @used-by app/(dashboard)/wing/settings/page.tsx
 *
 * CRUD editor for wing_whatsapp_links. Renders existing links as cards,
 * plus an "Add link" form below. Each link has a scope (main / district /
 * constituency) — the scope select toggles which dependent field shows.
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  upsertWhatsAppLinkAction,
  toggleWhatsAppLinkAction,
  deleteWhatsAppLinkAction,
} from "@/app/(dashboard)/wing/settings/whatsapp-actions";

interface LinkRow {
  id: string;
  label: string;
  invite_url: string;
  district: string | null;
  constituency: string | null;
  display_order: number;
  is_active: boolean;
  notes: string | null;
}

interface ConstituencyOption {
  constituency: string;
  district: string | null;
}

interface WhatsAppLinksEditorProps {
  initialLinks: LinkRow[];
  constituencies: ConstituencyOption[];
}

const DISTRICTS = [
  "Central Singapore",
  "North East",
  "North West",
  "South East",
  "South West",
] as const;

type Scope = "main" | "district" | "constituency";

function scopeOf(link: LinkRow): Scope {
  if (link.constituency) return "constituency";
  if (link.district) return "district";
  return "main";
}

export function WhatsAppLinksEditor({ initialLinks, constituencies }: WhatsAppLinksEditorProps) {
  const router = useRouter();
  const [showForm, setShowForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  function openCreate() {
    setEditingId(null);
    setShowForm(true);
  }
  function openEdit(id: string) {
    setEditingId(id);
    setShowForm(true);
  }
  function close() {
    setShowForm(false);
    setEditingId(null);
  }

  async function handleToggle(id: string, next: boolean) {
    const result = await toggleWhatsAppLinkAction({ id, active: next });
    if (result.ok) {
      toast.success(next ? "Link active." : "Link disabled.");
      router.refresh();
    } else {
      toast.error(result.error ?? "Couldn't update.");
    }
  }

  async function handleDelete(id: string, label: string) {
    if (!window.confirm(`Delete "${label}"? This can't be undone.`)) return;
    const result = await deleteWhatsAppLinkAction({ id });
    if (result.ok) {
      toast.success("Link deleted.");
      router.refresh();
    } else {
      toast.error(result.error ?? "Couldn't delete.");
    }
  }

  const editing = editingId ? initialLinks.find((l) => l.id === editingId) ?? null : null;

  return (
    <div className="flex flex-col gap-4">
      {initialLinks.length === 0 && !showForm && (
        <p className="text-sm text-text-muted">
          No links yet. Add at least one — leads see them on the capture confirmation screen.
        </p>
      )}

      {initialLinks.map((link) => (
        <div
          key={link.id}
          className={`flex flex-col gap-2 rounded-md border p-4 ${
            link.is_active ? "border-border bg-surface-card" : "border-border bg-surface-page opacity-60"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-text-primary">{link.label}</span>
                <ScopeBadge link={link} />
                {!link.is_active && (
                  <span className="text-xs uppercase tracking-wide text-text-muted">
                    Disabled
                  </span>
                )}
              </div>
              <a
                href={link.invite_url}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-xs text-text-muted underline"
              >
                {link.invite_url}
              </a>
              {link.notes && (
                <p className="text-xs text-text-secondary">Note: {link.notes}</p>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleToggle(link.id, !link.is_active)}
              >
                {link.is_active ? "Disable" : "Enable"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => openEdit(link.id)}>
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => handleDelete(link.id, link.label)}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      ))}

      {showForm ? (
        <LinkForm
          initial={editing}
          constituencies={constituencies}
          onClose={close}
          onSaved={() => {
            close();
            router.refresh();
          }}
        />
      ) : (
        <div className="flex justify-end">
          <Button type="button" onClick={openCreate}>
            Add link
          </Button>
        </div>
      )}
    </div>
  );
}

function ScopeBadge({ link }: { link: LinkRow }) {
  const tone =
    link.constituency
      ? "border-state-info text-state-info"
      : link.district
        ? "border-state-warning text-state-warning"
        : "border-state-success text-state-success";
  const label = link.constituency
    ? `Constituency · ${link.constituency}`
    : link.district
      ? `District · ${link.district}`
      : "Main";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
  );
}

function LinkForm({
  initial,
  constituencies,
  onClose,
  onSaved,
}: {
  initial: LinkRow | null;
  constituencies: ConstituencyOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = React.useState(initial?.label ?? "");
  const [inviteUrl, setInviteUrl] = React.useState(initial?.invite_url ?? "");
  const [scope, setScope] = React.useState<Scope>(initial ? scopeOf(initial) : "main");
  const [district, setDistrict] = React.useState<string>(initial?.district ?? "");
  const [constituency, setConstituency] = React.useState<string>(initial?.constituency ?? "");
  const [displayOrder, setDisplayOrder] = React.useState<number>(initial?.display_order ?? 100);
  const [notes, setNotes] = React.useState(initial?.notes ?? "");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await upsertWhatsAppLinkAction({
      id: initial?.id,
      label,
      invite_url: inviteUrl,
      scope,
      district: scope === "district" ? (district as (typeof DISTRICTS)[number]) : undefined,
      constituency: scope === "constituency" ? constituency : undefined,
      display_order: displayOrder,
      notes,
    });
    setPending(false);
    if (result.ok) {
      toast.success(initial ? "Link saved." : "Link added.");
      onSaved();
    } else {
      setError(result.error ?? "Couldn't save.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-md border border-border bg-surface-card p-4"
    >
      <p className="text-sm font-semibold text-text-primary">
        {initial ? "Edit link" : "Add a WhatsApp community link"}
      </p>

      {error && (
        <div className="rounded-md border border-state-error bg-surface-page p-3 text-sm text-state-error">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="wa-label">Label</Label>
          <Input
            id="wa-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Young PAP Main Community"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="wa-order">Display order</Label>
          <Input
            id="wa-order"
            type="number"
            min={0}
            max={9999}
            value={Number.isFinite(displayOrder) ? displayOrder : ""}
            onChange={(e) => setDisplayOrder(Number.parseInt(e.target.value, 10) || 0)}
            className="w-24"
          />
          <p className="text-xs text-text-muted">
            Smaller numbers show first. Main usually 0-10; district 100-200.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="wa-url">WhatsApp invite URL</Label>
        <Input
          id="wa-url"
          type="url"
          value={inviteUrl}
          onChange={(e) => setInviteUrl(e.target.value)}
          placeholder="https://chat.whatsapp.com/XXXXXXXX"
          required
        />
        <p className="text-xs text-text-muted">
          Must start with <code>https://chat.whatsapp.com/</code>.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="wa-scope">Scope</Label>
        <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
          <SelectTrigger id="wa-scope">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="main">Main — shown to every lead</SelectItem>
            <SelectItem value="district">District — match by district</SelectItem>
            <SelectItem value="constituency">Constituency — match by GRC/SMC</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {scope === "district" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="wa-district">District</Label>
          <Select value={district} onValueChange={setDistrict}>
            <SelectTrigger id="wa-district">
              <SelectValue placeholder="Pick a district…" />
            </SelectTrigger>
            <SelectContent>
              {DISTRICTS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {scope === "constituency" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="wa-constituency">Constituency</Label>
          <Select value={constituency} onValueChange={setConstituency}>
            <SelectTrigger id="wa-constituency">
              <SelectValue placeholder="Pick a constituency…" />
            </SelectTrigger>
            <SelectContent>
              {constituencies.map((c) => (
                <SelectItem key={c.constituency} value={c.constituency}>
                  {c.constituency}
                  {c.district ? ` · ${c.district}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="wa-notes">Notes (optional)</Label>
        <Input
          id="wa-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal context only — not shown to leads."
          maxLength={500}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : initial ? "Save changes" : "Add link"}
        </Button>
      </div>
    </form>
  );
}
