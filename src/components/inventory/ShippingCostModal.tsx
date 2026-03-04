"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MARKET_CODES = ["EU", "UK", "US", "AU"] as const;

interface ShippingCostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variantId: number;
  variantTitle: string;
  currentCosts: Record<string, number>;
  onSave: (variantId: number, costs: Record<string, number>) => Promise<void>;
}

export function ShippingCostModal({
  open,
  onOpenChange,
  variantId,
  variantTitle,
  currentCosts,
  onSave,
}: ShippingCostModalProps) {
  const [costs, setCosts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const code of MARKET_CODES) {
      initial[code] = (currentCosts[code] ?? 0).toString();
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const parsed: Record<string, number> = {};
      for (const code of MARKET_CODES) {
        parsed[code] = parseFloat(costs[code]) || 0;
      }
      await onSave(variantId, parsed);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Shipping Costs — {variantTitle}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {MARKET_CODES.map((code) => (
            <div key={code} className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{code}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                className="col-span-3"
                value={costs[code]}
                onChange={(e) =>
                  setCosts((prev) => ({ ...prev, [code]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
