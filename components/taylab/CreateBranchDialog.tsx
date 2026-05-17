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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createBranchAction } from "@/app/(dashboard)/taylab/branches/actions";

type BranchTypeOption = "territorial" | "wing";

interface ConstituencyChoice {
  constituency: string;
  constituency_type: "GRC" | "SMC";
  district: string | null;
}

interface CreateBranchDialogProps {
  /** Directory rows loaded server-side so the territorial branch picker
   *  forces a canonical constituency name from constituency_directory.
   *  Prevents the "Kampong Glam" (neighbourhood) vs "JALAN BESAR GRC"
   *  (canonical) mismatch we hit on the seed branch. */
  constituencies: ConstituencyChoice[];
}

export function CreateBranchDialog({ constituencies }: CreateBranchDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [branchType, setBranchType] = React.useState<BranchTypeOption>("territorial");
  const [name, setName] = React.useState("");
  const [constituency, setConstituency] = React.useState("");
  const [hqEmail, setHqEmail] = React.useState("");
  const [adminEmail, setAdminEmail] = React.useState("");
  const [adminName, setAdminName] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isWing = branchType === "wing";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await createBranchAction({
      name,
      branchType,
      // Constituency is meaningful for territorial branches only; wings sit
      // above constituencies and don't have one of their own.
      constituency: isWing ? "" : constituency,
      hqEmail,
      masterAdminEmail: adminEmail,
      masterAdminName: adminName,
    });
    setPending(false);
    if (result.ok) {
      const adminLabel = isWing ? "Wing Admin" : "Master Admin";
      toast.success(`Branch created — ${adminEmail} invited as ${adminLabel}.`);
      setOpen(false);
      setBranchType("territorial");
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
          {/* Branch type — territorial (constituency branch) vs wing (parent
              layer that runs events + routes leads). Wings can't have a
              constituency and their first admin is provisioned as
              `wing_admin` rather than `branch_master_admin`. */}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-text-primary">
              Branch type
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <label
                className={`flex cursor-pointer flex-col gap-1 rounded-md border p-3 text-sm transition-colors ${
                  branchType === "territorial"
                    ? "border-text-primary bg-surface-page"
                    : "border-border hover:bg-surface-page"
                }`}
              >
                <input
                  type="radio"
                  name="branchType"
                  value="territorial"
                  checked={branchType === "territorial"}
                  onChange={() => setBranchType("territorial")}
                  className="sr-only"
                />
                <span className="font-medium">Territorial</span>
                <span className="text-xs text-text-muted">
                  Constituency branch (e.g. Kampong Glam, Tampines).
                </span>
              </label>
              <label
                className={`flex cursor-pointer flex-col gap-1 rounded-md border p-3 text-sm transition-colors ${
                  branchType === "wing"
                    ? "border-text-primary bg-surface-page"
                    : "border-border hover:bg-surface-page"
                }`}
              >
                <input
                  type="radio"
                  name="branchType"
                  value="wing"
                  checked={branchType === "wing"}
                  onChange={() => setBranchType("wing")}
                  className="sr-only"
                />
                <span className="font-medium">Wing</span>
                <span className="text-xs text-text-muted">
                  Parent layer (e.g. Young PAP). Runs events; routes leads.
                </span>
              </label>
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            <Label htmlFor="b-name">Branch name</Label>
            <Input
              id="b-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="off"
              placeholder={isWing ? "e.g. Young PAP" : "e.g. PAP Tampines"}
            />
          </div>
          {!isWing && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="b-constituency">Constituency</Label>
              <Select value={constituency} onValueChange={setConstituency}>
                <SelectTrigger id="b-constituency">
                  <SelectValue placeholder="Pick a constituency…" />
                </SelectTrigger>
                <SelectContent>
                  {constituencies.map((c) => (
                    <SelectItem key={c.constituency} value={c.constituency}>
                      {c.constituency}
                      {c.district ? ` · ${c.district} District` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-text-muted">
                Source: constituency directory ({constituencies.length} entries).
              </p>
            </div>
          )}
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
              <Label htmlFor="adm-name">
                {isWing ? "Wing Admin name" : "Master Admin name"}
              </Label>
              <Input
                id="adm-name"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="adm-email">
                {isWing ? "Wing Admin email" : "Master Admin email"}
              </Label>
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
