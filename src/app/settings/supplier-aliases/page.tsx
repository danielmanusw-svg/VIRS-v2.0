"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// ─── Known invoice categories from the supplier ─────────────────────────────

interface InvoiceCategory {
  label: string;
  type: "standard" | "prebought" | "grouped";
  description: string;
}

const INVOICE_CATEGORIES: InvoiceCategory[] = [
  { label: "Stainless Steel", type: "prebought", description: "Filter unit with 2/3/4/6 cartridges included. Pre-bought — invoice should only show shipping." },
  { label: "360° Adapters", type: "standard", description: "360° rotating adapters, by country." },
  { label: "Shower Filter", type: "standard", description: "Shower filter unit, by country." },
  { label: "Plastic Filter", type: "standard", description: "Plastic filter with 2/3/4/5/6 cartridges included." },
  { label: "Plastic Screen", type: "standard", description: "Plastic screen filter variant." },
  { label: "All Adapters", type: "grouped", description: "All adaptor variants grouped — same cost and shipping." },
  { label: "Shower Filter Cartridge", type: "standard", description: "Replacement cartridges for shower filter." },
  { label: "Plastic and Stainless Steel Cartridges", type: "standard", description: "Shared cartridges (e.g. FIL003CLR series). Also includes SSCRT variants." },
  { label: "Bath Filter", type: "standard", description: "Bath filter unit, by country." },
  { label: "Small Bottle", type: "standard", description: "Small bottle filter." },
  { label: "650ml Bottle", type: "prebought", description: "650ml bottle — pre-bought, invoice should only show shipping." },
  { label: "1L Bottle", type: "prebought", description: "1L bottle — pre-bought, invoice should only show shipping." },
  { label: "Black New Plastic Stock", type: "standard", description: "Black new plastic stock item." },
];

// ─── Types ──────────────────────────────────────────────────────────────────

interface SupplierAlias {
  id: number;
  supplier_label: string;
  master_product_id: number | null;
  master_product_name: string | null;
  variant_id: number | null;
  variant_title: string | null;
  variant_sku: string | null;
  bundle_multiplier: number;
  created_at: string;
}

interface MasterProductOption {
  id: number;
  name: string;
}

interface VariantOption {
  id: number;
  title: string;
  sku: string | null;
  product_title: string;
  master_product_id: number | null;
}

interface CollectionItem {
  item_type: string;
  item_id: number;
  collection_id?: number;
}

interface Collection {
  id: number;
  name: string;
  itemCount: number;
}

// ─── Grouped alias card data ────────────────────────────────────────────────

interface CategoryCard {
  label: string;
  type: "standard" | "prebought" | "grouped";
  description: string;
  aliases: SupplierAlias[];
  isMapped: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function SupplierAliasesPage() {
  const [aliases, setAliases] = useState<SupplierAlias[]>([]);
  const [masterProducts, setMasterProducts] = useState<MasterProductOption[]>([]);
  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionItems, setCollectionItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Map dialog
  const [mappingLabel, setMappingLabel] = useState<string | null>(null);
  const [mappingTarget, setMappingTarget] = useState("");
  const [mappingSaving, setMappingSaving] = useState(false);

  // Add custom category dialog
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState("");

  // Expand state for grouped cards
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Delete confirm
  const [deleteLabel, setDeleteLabel] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Inline filter-count editing
  const [editingMultiplier, setEditingMultiplier] = useState<{ aliasId: number; variantId: number; value: string } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [aliasRes, mpRes, prodRes, colRes, colItemsRes] = await Promise.all([
        fetch("/api/supplier-aliases"),
        fetch("/api/master-products"),
        fetch("/api/products"),
        fetch("/api/collections"),
        fetch("/api/collections/all-items"),
      ]);

      if (aliasRes.ok) setAliases(await aliasRes.json());

      if (mpRes.ok) {
        const mps = await mpRes.json();
        setMasterProducts(
          mps.map((mp: { id: number; name: string }) => ({ id: mp.id, name: mp.name }))
        );
      }

      if (prodRes.ok) {
        const prods = await prodRes.json();
        const allVariants: VariantOption[] = [];
        for (const p of prods) {
          for (const v of p.variants) {
            allVariants.push({ id: v.id, title: v.title, sku: v.sku, product_title: p.title, master_product_id: v.master_product_id ?? null });
          }
        }
        setVariants(allVariants);
      }

      if (colRes.ok) setCollections(await colRes.json());
      if (colItemsRes.ok) setCollectionItems(await colItemsRes.json());
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Build card data ────────────────────────────────────────────────────

  const aliasesByLabel = new Map<string, SupplierAlias[]>();
  for (const a of aliases) {
    const existing = aliasesByLabel.get(a.supplier_label) || [];
    existing.push(a);
    aliasesByLabel.set(a.supplier_label, existing);
  }

  // Known categories + any extra labels from DB not in the known list
  const knownLabels = new Set(INVOICE_CATEGORIES.map((c) => c.label));
  const cards: CategoryCard[] = INVOICE_CATEGORIES.map((cat) => ({
    ...cat,
    aliases: aliasesByLabel.get(cat.label) || [],
    isMapped: (aliasesByLabel.get(cat.label) || []).length > 0,
  }));

  // Add any DB aliases that don't match a known category
  for (const [label, als] of aliasesByLabel) {
    if (!knownLabels.has(label)) {
      cards.push({
        label,
        type: "standard",
        description: "Custom mapping",
        aliases: als,
        isMapped: als.length > 0,
      });
    }
  }

  // ─── Get adaptor variant IDs from the "Adaptor" collection ──────────────

  const adaptorCollection = collections.find(
    (c) => c.name.toLowerCase() === "adaptor" || c.name.toLowerCase() === "adaptors"
  );
  const adaptorVariantIds = adaptorCollection
    ? collectionItems
      .filter((ci) => ci.collection_id === adaptorCollection.id && ci.item_type === "variant")
      .map((ci) => ci.item_id)
    : [];

  // ─── Handlers ───────────────────────────────────────────────────────────

  async function handleAutoMapAdaptors() {
    if (adaptorVariantIds.length === 0) {
      toast.error("No adaptor variants found in the Adaptor collection");
      return;
    }

    // Delete existing "All Adapters" aliases first
    try {
      await fetch(`/api/supplier-aliases?label=${encodeURIComponent("All Adapters")}`, {
        method: "DELETE",
      });
    } catch { /* ignore if none exist */ }

    try {
      const res = await fetch("/api/supplier-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_label: "All Adapters",
          variant_ids: adaptorVariantIds,
        }),
      });
      if (!res.ok) throw new Error("Failed to auto-map");
      toast.success(`Mapped ${adaptorVariantIds.length} adaptor variants`);
      await fetchData();
    } catch {
      toast.error("Failed to auto-map adaptor variants");
    }
  }

  function openMappingDialog(label: string) {
    setMappingLabel(label);
    setMappingTarget("");
  }

  async function handleSaveMapping() {
    if (!mappingLabel || !mappingTarget) {
      toast.error("Select a product to map to");
      return;
    }

    setMappingSaving(true);
    try {
      let master_product_id: number | null = null;
      let variant_id: number | null = null;

      if (mappingTarget.startsWith("master_")) {
        master_product_id = parseInt(mappingTarget.slice(7));
      } else if (mappingTarget.startsWith("variant_")) {
        variant_id = parseInt(mappingTarget.slice(8));
      }

      const res = await fetch("/api/supplier-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_label: mappingLabel,
          master_product_id,
          variant_id,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      toast.success("Mapping saved");
      setMappingLabel(null);
      setMappingTarget("");
      await fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save mapping");
    } finally {
      setMappingSaving(false);
    }
  }

  async function handleDeleteCategory(label: string) {
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/supplier-aliases?label=${encodeURIComponent(label)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Mapping removed");
      setDeleteLabel(null);
      await fetchData();
    } catch {
      toast.error("Failed to delete mapping");
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteSingleAlias(aliasId: number) {
    try {
      const res = await fetch(`/api/supplier-aliases/${aliasId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Mapping removed");
      await fetchData();
    } catch {
      toast.error("Failed to delete");
    }
  }

  function handleAddCustomCategory() {
    if (!newCategoryLabel.trim()) {
      toast.error("Label is required");
      return;
    }
    // Just open the mapping dialog for this new label
    setShowAddDialog(false);
    openMappingDialog(newCategoryLabel.trim());
    setNewCategoryLabel("");
  }

  function toggleExpand(label: string) {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  async function handleSaveMultiplier() {
    if (!editingMultiplier) return;
    const parsed = parseInt(editingMultiplier.value, 10);
    if (isNaN(parsed) || parsed < 1) {
      toast.error("Filter count must be at least 1");
      return;
    }
    try {
      const res = await fetch(`/api/stock/${editingMultiplier.variantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundle_multiplier: parsed }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success(`Filter count updated to ${parsed}`);
      setEditingMultiplier(null);
      await fetchData();
    } catch {
      toast.error("Failed to update filter count");
    }
  }

  // ─── Target options for dropdowns ───────────────────────────────────────

  // Build sets of already-mapped IDs to exclude from the dropdown
  const mappedMasterProductIds = new Set(
    aliases.filter((a) => a.master_product_id !== null).map((a) => a.master_product_id!)
  );
  const mappedVariantIds = new Set(
    aliases.filter((a) => a.variant_id !== null).map((a) => a.variant_id!)
  );

  const availableMasterProducts = masterProducts.filter((mp) => !mappedMasterProductIds.has(mp.id));
  const availableVariants = variants.filter((v) => {
    // Exclude if this specific variant is already mapped
    if (mappedVariantIds.has(v.id)) return false;
    // Exclude if this variant's parent master product is already mapped
    if (v.master_product_id && mappedMasterProductIds.has(v.master_product_id)) return false;
    return true;
  });

  const targetOptions = (
    <>
      {availableMasterProducts.length > 0 && (
        <>
          {availableMasterProducts.map((mp) => (
            <SelectItem key={`master_${mp.id}`} value={`master_${mp.id}`}>
              🏷️ {mp.name}
            </SelectItem>
          ))}
        </>
      )}
      {availableVariants.map((v) => (
        <SelectItem key={`variant_${v.id}`} value={`variant_${v.id}`}>
          📦 {v.sku ? `${v.sku} – ` : ""}{v.title} ({v.product_title})
        </SelectItem>
      ))}
    </>
  );

  // ─── Display helper ─────────────────────────────────────────────────────

  function renderMappedProducts(als: SupplierAlias[]) {
    if (als.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {als.map((a) => (
          <span
            key={a.id}
            className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-0.5 text-xs text-zinc-200"
          >
            {a.master_product_name
              ? `🏷️ ${a.master_product_name}`
              : a.variant_sku
                ? `📦 ${a.variant_sku} – ${a.variant_title}`
                : `📦 ${a.variant_title}`}
            {/* Editable filter count for variant-level aliases */}
            {a.variant_id && (
              editingMultiplier?.aliasId === a.id ? (
                <span className="inline-flex items-center gap-0.5 ml-1">
                  <Input
                    className="w-10 h-5 text-xs px-1 py-0 bg-zinc-700 border-zinc-600"
                    value={editingMultiplier.value}
                    onChange={(e) => setEditingMultiplier({ ...editingMultiplier, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveMultiplier();
                      if (e.key === "Escape") setEditingMultiplier(null);
                    }}
                    autoFocus
                  />
                  <button
                    onClick={handleSaveMultiplier}
                    className="text-emerald-400 hover:text-emerald-300"
                    title="Save"
                  >
                    ✓
                  </button>
                </span>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingMultiplier({
                      aliasId: a.id,
                      variantId: a.variant_id!,
                      value: String(a.bundle_multiplier),
                    });
                  }}
                  className="ml-1 px-1 rounded bg-zinc-700 hover:bg-zinc-600 text-amber-400 transition-colors"
                  title="Click to set filter count (bundle multiplier)"
                >
                  ×{a.bundle_multiplier}
                </button>
              )
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteSingleAlias(a.id);
              }}
              className="ml-1 text-zinc-500 hover:text-red-400 transition-colors"
              title="Remove this mapping"
            >
              ×
            </button>
          </span>
        ))}
      </div>
    );
  }

  function typeBadge(type: "standard" | "prebought" | "grouped") {
    switch (type) {
      case "prebought":
        return (
          <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/30 hover:bg-blue-600/30">
            Pre-bought
          </Badge>
        );
      case "grouped":
        return (
          <Badge className="bg-purple-600/20 text-purple-400 border-purple-600/30 hover:bg-purple-600/30">
            Grouped
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="bg-zinc-700/50 text-zinc-400">
            Standard
          </Badge>
        );
    }
  }

  function statusIndicator(isMapped: boolean) {
    if (isMapped) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          Mapped
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-400">
        <span className="w-2 h-2 rounded-full bg-amber-400" />
        Unmapped
      </span>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Invoice Product Mapping</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const mappedCount = cards.filter((c) => c.isMapped).length;
  const totalCount = cards.length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invoice Product Mapping</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Map each supplier invoice category to your internal products. This is used to
            generate verification invoices and catch discrepancies.
          </p>
          <div className="flex items-center gap-4 mt-2">
            <span className="text-sm text-zinc-400">
              {mappedCount} of {totalCount} categories mapped
            </span>
            <div className="w-32 h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${totalCount > 0 ? (mappedCount / totalCount) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowAddDialog(true)}
        >
          + Add Category
        </Button>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map((card) => {
          const isExpanded = expandedCards.has(card.label);
          const borderColor = card.isMapped
            ? "border-l-emerald-500"
            : "border-l-amber-500";

          return (
            <Card
              key={card.label}
              className={`border-l-4 ${borderColor} bg-zinc-900/50 transition-all hover:bg-zinc-900/80`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      {card.label}
                    </CardTitle>
                    <p className="text-xs text-zinc-500 mt-0.5">{card.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {typeBadge(card.type)}
                    {statusIndicator(card.isMapped)}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {/* Mapped products display */}
                {card.isMapped ? (
                  <>
                    {card.type === "grouped" && card.aliases.length > 3 ? (
                      <>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {(isExpanded ? card.aliases : card.aliases.slice(0, 3)).map((a) => (
                            <span
                              key={a.id}
                              className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-0.5 text-xs text-zinc-200"
                            >
                              {a.master_product_name
                                ? `🏷️ ${a.master_product_name}`
                                : a.variant_sku
                                  ? `📦 ${a.variant_sku}`
                                  : `📦 ${a.variant_title}`}
                              {a.variant_id && (
                                editingMultiplier?.aliasId === a.id ? (
                                  <span className="inline-flex items-center gap-0.5 ml-1">
                                    <Input
                                      className="w-10 h-5 text-xs px-1 py-0 bg-zinc-700 border-zinc-600"
                                      value={editingMultiplier.value}
                                      onChange={(e) => setEditingMultiplier({ ...editingMultiplier, value: e.target.value })}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSaveMultiplier();
                                        if (e.key === "Escape") setEditingMultiplier(null);
                                      }}
                                      autoFocus
                                    />
                                    <button
                                      onClick={handleSaveMultiplier}
                                      className="text-emerald-400 hover:text-emerald-300"
                                      title="Save"
                                    >
                                      ✓
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingMultiplier({
                                        aliasId: a.id,
                                        variantId: a.variant_id!,
                                        value: String(a.bundle_multiplier),
                                      });
                                    }}
                                    className="ml-1 px-1 rounded bg-zinc-700 hover:bg-zinc-600 text-amber-400 transition-colors"
                                    title="Click to set filter count (bundle multiplier)"
                                  >
                                    ×{a.bundle_multiplier}
                                  </button>
                                )
                              )}
                              <button
                                onClick={() => handleDeleteSingleAlias(a.id)}
                                className="ml-1 text-zinc-500 hover:text-red-400 transition-colors"
                                title="Remove"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                        <button
                          onClick={() => toggleExpand(card.label)}
                          className="text-xs text-zinc-500 hover:text-zinc-300 mt-1.5 transition-colors"
                        >
                          {isExpanded
                            ? "▲ Show less"
                            : `▼ Show all ${card.aliases.length} variants`}
                        </button>
                      </>
                    ) : (
                      renderMappedProducts(card.aliases)
                    )}
                  </>
                ) : (
                  <p className="text-sm text-zinc-600 mt-1 italic">
                    No mapping configured
                  </p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-800">
                  {card.type === "grouped" && !card.isMapped && adaptorVariantIds.length > 0 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-purple-400 border-purple-600/30 hover:bg-purple-600/10"
                      onClick={handleAutoMapAdaptors}
                    >
                      ⚡ Auto-map {adaptorVariantIds.length} Adaptors
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openMappingDialog(card.label)}
                    >
                      {card.isMapped ? "+ Add Another" : "Map Now"}
                    </Button>
                  )}
                  {card.isMapped && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:text-red-300 hover:bg-red-950/20"
                      onClick={() => setDeleteLabel(card.label)}
                    >
                      Clear All
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Mapping dialog */}
      <Dialog
        open={mappingLabel !== null}
        onOpenChange={(open) => !open && setMappingLabel(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Map &ldquo;{mappingLabel}&rdquo;
            </DialogTitle>
            <DialogDescription>
              Select the internal product (Master Product or Variant) that this
              invoice category corresponds to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Select value={mappingTarget} onValueChange={setMappingTarget}>
              <SelectTrigger>
                <SelectValue placeholder="Select a product or variant..." />
              </SelectTrigger>
              <SelectContent className="max-h-64">{targetOptions}</SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMappingLabel(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveMapping} disabled={mappingSaving || !mappingTarget}>
              {mappingSaving ? "Saving..." : "Save Mapping"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add custom category dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Invoice Category</DialogTitle>
            <DialogDescription>
              Add a category that doesn&apos;t appear in the default list. This is useful
              if the supplier adds new products to future invoices.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="e.g. New Bottle XL"
              value={newCategoryLabel}
              onChange={(e) => setNewCategoryLabel(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddCustomCategory} disabled={!newCategoryLabel.trim()}>
              Continue to Map
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog
        open={deleteLabel !== null}
        onOpenChange={(open) => !open && setDeleteLabel(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear All Mappings?</DialogTitle>
            <DialogDescription>
              This will remove all product mappings for &ldquo;{deleteLabel}&rdquo;.
              You can re-map them afterwards.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteLabel(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => deleteLabel && handleDeleteCategory(deleteLabel)}
            >
              {deleting ? "Deleting..." : "Clear All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
