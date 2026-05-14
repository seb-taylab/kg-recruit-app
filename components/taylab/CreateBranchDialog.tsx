/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §2 (Dialog form)
 * @consumes ui/Dialog, ui/Button, ui/Input, ui/Label, ui/Alert, sonner
 * @used-by app/(dashboard)/taylab/branches/page.tsx
 *
 * Provision a new branch + its initial Master Admin in one shot. Both
 * happen in the same server action so a partial state (branch without an
 * admin) is rolled back.
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
import { createBranchAction } from "@/app/(dashboard)/taylab/branches/actions";

export function CreateBranchDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [constituency, setConstituency] = React.useState("");
  const [hqEmail, setHqEmail] = React.useState("");
  const [adminEmail, setAdminEmail] = React.useState("");
  const [adminName, setAdminName] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await createBranchAction({
      name,
      constituency,
      hqEmail,
      masterAdminEmail: adminEmail,
      masterAdminName: adminName,
    });
    setPending(false);
    if (result.ok) {
      toast.success(`Branch created — ${adminEmail} invited as Master Admin.`);
      setOpen(false);
      setName("");
      setConstituency("");
      setHqEmail("");
      setAdminEmail("");
      setAdminName("");
      router.refresh();
    } else {
      setError(result.error ?? "Couldn't create — try again in a minute.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">New branch</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a branch</DialogTitle>
          <DialogDescription>
            Provisions the tenant and emails the first Master Admin a sign-in link.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="b-name">Branch name</Label>
            <Input
              id="b-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="b-constituency">Constituency (optional)</Label>
            <Input
              id="b-constituency"
              value={constituency}
              onChange={(e) => setConstituency(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="b-hq">HQ email (optional)</Label>
            <Input
              id="b-hq"
              type="email"
              value={hqEmail}
              onChange={(e) => setHqEmail(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="adm-name">Master Admin name</Label>
              <Input
                id="adm-name"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="adm-email">Master Admin email</Label>
              <Input
                id="adm-email"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create branch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
