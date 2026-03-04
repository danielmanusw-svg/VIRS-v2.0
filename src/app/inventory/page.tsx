"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { InventorySidebar } from "@/components/inventory/InventorySidebar";
import { InventoryTable } from "@/components/inventory/InventoryTable";
import { Folder } from "lucide-react";

const COLLECTION_COLORS: Record<string, string> = {
  "Tap Filters": "text-sky-500",
  "Cartridges": "text-purple-500",
  "Adaptors": "text-orange-500",
  "Bathroom": "text-emerald-500",
  "Other": "text-slate-500",
  "No Count": "text-rose-400"
};

interface Variant {
  id: number;
  shopify_variant_id: string;
  title: string;
  sku: string | null;
  supplier_cost: number;
  bundle_multiplier: number;
  master_product_id: number | null;
  master_product_name: string | null;
  stock_quantity: number;
  shipping_costs: Record<string, number>;
}

interface Product {
  id: number;
  shopify_product_id: string;
  title: string;
  vendor: string | null;
  image_url: string | null;
  variants: Variant[];
}

interface MasterProduct {
  id: number;
  name: string;
  stock_quantity: number;
  is_manual_stock: boolean;
  image_url: string | null;
  variants?: Variant[];
}

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [masterProducts, setMasterProducts] = useState<MasterProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);

  // View State
  const [currentView, setCurrentView] = useState<"all" | number>("all");
  const [collectionItems, setCollectionItems] = useState<any[]>([]);

  // Collection State (Lifted from Sidebar)
  const [collections, setCollections] = useState<any[]>([]);
  const [allAssignedItems, setAllAssignedItems] = useState<{ item_type: string, item_id: number }[]>([]);
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false);

  // Selection mode & State (Lifted from Table)
  const [selectionMode, setSelectionMode] = useState<'none' | 'master' | 'master_add' | 'collection'>('none');
  const [selectedVariants, setSelectedVariants] = useState<Set<number>>(new Set()); // For master grouping
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set()); // For collection actions "type:id"
  const [addingToMasterId, setAddingToMasterId] = useState<number | null>(null);

  const [groupModal, setGroupModal] = useState(false);
  const [groupName, setGroupName] = useState("");

  // Collection Action State
  const [addToCollectionModal, setAddToCollectionModal] = useState(false);

  // Fetch collections
  const fetchCollections = useCallback(async () => {
    try {
      const res = await fetch("/api/collections");
      if (res.ok) {
        const data = await res.json();
        setCollections(data);
      }
    } catch (e) {
      toast.error("Failed to load collections");
    }
  }, []);

  // Fetch all data necessary
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [productsRes, masterRes, allAssignedRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/master-products"),
        fetch("/api/collections/all-items"),
      ]);

      if (productsRes.ok) {
        const pData = await productsRes.json();
        setProducts(pData);
      }
      if (masterRes.ok) {
        const mData = await masterRes.json();
        setMasterProducts(mData);
      }
      if (allAssignedRes.ok) {
        const assignedData = await allAssignedRes.json();
        setAllAssignedItems(assignedData);
      }

      if (currentView !== "all") {
        const colRes = await fetch(`/api/collections/${currentView}`);
        if (colRes.ok) {
          const colData = await colRes.json();
          // Store collection items to filter the view
          setCollectionItems(colData.items);
        }
      }

      // Also fetch collections to keep sidebar updated
      fetchCollections();

    } catch (e) {
      toast.error("Failed to load inventory data");
    } finally {
      setLoading(false);
    }
  }, [currentView, fetchCollections]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // -- Collection Handlers --
  async function createCollection(name: string) {
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error("Failed");
    toast.success("Collection created");
    fetchCollections();
  }

  async function renameCollection(id: number, name: string) {
    const res = await fetch(`/api/collections/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error("Failed");
    toast.success("Collection renamed");
    fetchCollections();
  }

  async function deleteCollection(id: number) {
    const res = await fetch(`/api/collections/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed");
    toast.success("Collection deleted");
    if (currentView === id) setCurrentView("all");
    fetchCollections();
  }

  async function addItemsToCollection(collectionId: number) {
    const items = Array.from(selectedItems).map(key => {
      const [type, id] = key.split(':');
      return { type, id: parseInt(id) };
    });

    try {
      const res = await fetch(`/api/collections/${collectionId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (res.ok) {
        toast.success(`Added ${items.length} items`);
        setSelectedItems(new Set());
        setSelectionMode('none');
        setAddToCollectionModal(false);
        fetchCollections(); // Update counts
      } else {
        toast.error("Failed to add items");
      }
    } catch {
      toast.error("Error adding items");
    }
  }

  async function removeItemsFromCollection() {
    if (currentView === "all") return;
    const items = Array.from(selectedItems).map(key => {
      const [type, id] = key.split(':');
      return { item_type: type, item_id: parseInt(id) };
    });

    try {
      const res = await fetch(`/api/collections/${currentView}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remove_items: items }),
      });
      if (res.ok) {
        toast.success("Items removed from collection");
        setSelectedItems(new Set());
        setSelectionMode('none');
        fetchAllData(); // Refresh view
        fetchCollections(); // Refresh counts
      } else {
        toast.error("Failed to remove items");
      }
    } catch {
      toast.error("Error removing items");
    }
  }

  async function handleImport() {
    setImporting(true);
    setConfirmImport(false);
    try {
      const res = await fetch("/api/sync/products", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Import complete: ${data.records_processed} processed`);
      fetchAllData();
    } catch (err: any) {
      toast.error(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function saveStock(variantId: number, quantity: string) {
    try {
      const res = await fetch(`/api/stock/${variantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity: parseInt(quantity, 10),
          adjustment_type: "manual_set",
        }),
      });
      if (!res.ok) throw new Error("Failed to update stock");
      toast.success("Stock updated");
      await fetchAllData();
    } catch {
      toast.error("Failed to update stock");
    }
  }

  async function saveSupplierCost(variantId: number, cost: string) {
    try {
      const res = await fetch(`/api/stock/${variantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier_cost: parseFloat(cost) }),
      });
      if (!res.ok) throw new Error("Failed to update cost");
      toast.success("Supplier cost updated");
      await fetchAllData();
    } catch {
      toast.error("Failed to update supplier cost");
    }
  }

  async function saveMultiplier(variantId: number, value: string) {
    try {
      const res = await fetch(`/api/stock/${variantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundle_multiplier: parseInt(value, 10) }),
      });
      if (!res.ok) throw new Error("Failed to update multiplier");
      toast.success("Bundle multiplier updated");
      await fetchAllData();
    } catch {
      toast.error("Failed to update multiplier");
    }
  }

  async function ungroupVariant(variantId: number, masterProductId: number) {
    try {
      const res = await fetch(
        `/api/master-products/${masterProductId}/variants`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variant_ids: [variantId] }),
        }
      );
      if (!res.ok) throw new Error("Failed to ungroup");
      toast.success("Variant ungrouped");
      await fetchAllData();
    } catch {
      toast.error("Failed to ungroup variant");
    }
  }

  async function deleteMasterProduct(id: number) {
    if (!confirm("Are you sure you want to delete this master product? All linked variants will become ungrouped.")) return;
    try {
      const res = await fetch(`/api/master-products/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete master product");
      toast.success("Master product deleted");
      await fetchAllData();
    } catch {
      toast.error("Failed to delete master product");
    }
  }

  async function addVariantsToMaster() {
    if (!addingToMasterId || selectedVariants.size === 0) return;
    try {
      const res = await fetch(`/api/master-products/${addingToMasterId}/variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant_ids: Array.from(selectedVariants) }),
      });
      if (!res.ok) throw new Error("Failed to add variants");
      toast.success("Variants added to master product");
      setSelectionMode('none');
      setSelectedVariants(new Set());
      setAddingToMasterId(null);
      await fetchAllData();
    } catch {
      toast.error("Failed to add variants to master product");
    }
  }

  // Sort collections for sidebar and dialogs
  const sortedCollections = [...collections].sort((a, b) => {
    const order = ["Tap Filters", "Cartridges", "Adaptors", "Bathroom", "Other", "No Count"];
    const idxA = order.indexOf(a.name);
    const idxB = order.indexOf(b.name);

    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;

    return a.name.localeCompare(b.name);
  });

  // Filter Logic based on currentView
  const filteredMasters = currentView === "all" ? masterProducts.filter(mp => {
    if (!showUnassignedOnly) return true;

    // Unassigned logic: Neither the master product nor its variants are in ANY collection
    const variantsForMaster = products.flatMap(p => p.variants).filter(v => v.master_product_id === mp.id);
    const inAnyCollection = allAssignedItems.some(ci =>
      (ci.item_type === 'master_product' && ci.item_id === mp.id) ||
      (ci.item_type === 'variant' && variantsForMaster.some(v => v.id === ci.item_id))
    );
    return !inAnyCollection;
  }) : masterProducts.filter(mp => {
    // Include master if:
    // 1. Explicitly in collection
    // 2. Any of its variants are in collection
    const variantsForMaster = products.flatMap(p => p.variants).filter(v => v.master_product_id === mp.id);
    return collectionItems.some((ci: any) =>
      (ci.item_type === 'master_product' && ci.item_id === mp.id) ||
      (ci.item_type === 'variant' && variantsForMaster.some(v => v.id === ci.item_id))
    );
  });

  const filteredProducts = currentView === "all" ? products.filter(p => {
    if (!showUnassignedOnly) return true;

    // Unassigned logic: None of its variants (or their parent master product) are in ANY collection
    const inAnyCollection = p.variants.some(v =>
      allAssignedItems.some(ci =>
        (ci.item_type === 'variant' && ci.item_id === v.id) ||
        (ci.item_type === 'master_product' && ci.item_id === v.master_product_id)
      )
    );
    return !inAnyCollection;
  }) : products.filter(p => {
    // Include if:
    // 1. A variant is explicitly in collection
    // 2. A variant belongs to a Master Product that is in collection (or inferred to be visible)
    return p.variants.some(v =>
      collectionItems.some((ci: any) => ci.item_type === 'variant' && ci.item_id === v.id) ||
      (v.master_product_id && filteredMasters.some(mp => mp.id === v.master_product_id))
    );
  });

  // Bulk / Deep Selection Handler
  const handleToggleItems = useCallback((items: { type: 'variant' | 'master', id: number }[], action?: 'add' | 'remove') => {
    setSelectedItems(prev => {
      const next = new Set(prev);

      items.forEach(({ type, id }) => {
        const key = `${type}:${id}`;
        const isSelected = prev.has(key);

        // Logic: 
        // If action is specific (add/remove), do that.
        // If no action, toggle (if singular). 
        // For batch without action, usually we want to set them all to MATCH the first item's toggle target? 
        // Or just 'add' if not present, 'remove' if present?
        // Let's assume the caller determines the intent or we default to 'toggle'.

        if (action === 'add') {
          next.add(key);
          // Deep select logic for Master
          if (type === 'master') {
            // Find all variants for this master
            const variants = products.flatMap(p => p.variants).filter(v => v.master_product_id === id);
            variants.forEach(v => next.add(`variant:${v.id}`));
          }
        } else if (action === 'remove') {
          next.delete(key);
          // Deep deselect logic for Master
          if (type === 'master') {
            const variants = products.flatMap(p => p.variants).filter(v => v.master_product_id === id);
            variants.forEach(v => next.delete(`variant:${v.id}`));
          }
        } else {
          // Toggle
          if (isSelected) {
            next.delete(key);
            if (type === 'master') {
              const variants = products.flatMap(p => p.variants).filter(v => v.master_product_id === id);
              variants.forEach(v => next.delete(`variant:${v.id}`));
            }
          } else {
            next.add(key);
            if (type === 'master') {
              const variants = products.flatMap(p => p.variants).filter(v => v.master_product_id === id);
              variants.forEach(v => next.add(`variant:${v.id}`));
            }
          }
        }
      });

      return next;
    });
  }, [products]);

  return (
    <div className="flex h-screen overflow-hidden">
      <InventorySidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        collections={sortedCollections}
        onCreateCollection={createCollection}
        onRenameCollection={renameCollection}
        onDeleteCollection={deleteCollection}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="p-6 border-b flex items-center justify-between bg-background z-10">
          <h1 className="text-2xl font-bold">
            {currentView === "all" ? "All Products" : collections.find(c => c.id === currentView)?.name || "Collection"}
          </h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleImport} disabled={importing}>
              {importing ? "Syncing..." : "Sync from Shopify"}
            </Button>

            {currentView === "all" && (
              <Button
                variant={showUnassignedOnly ? "secondary" : "outline"}
                onClick={() => setShowUnassignedOnly(!showUnassignedOnly)}
              >
                {showUnassignedOnly ? "Showing Unassigned" : "Show Unassigned"}
              </Button>
            )}

            {selectionMode === 'none' ? (
              <>
                <Button onClick={() => setSelectionMode('master')} variant="default">
                  Create Master Product
                </Button>
                <Button onClick={() => setSelectionMode('collection')} variant="outline">
                  {currentView === 'all' ? "Send to Collection" : "Manage Collection"}
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-2 bg-muted p-1 rounded-md">
                <span className="text-sm font-medium px-2">
                  {selectionMode === 'master' ? "Creating Master Product..." :
                    selectionMode === 'master_add' ? `Adding to ${masterProducts.find(m => m.id === addingToMasterId)?.name || 'Master Product'}...` :
                      currentView === 'all' ? "Select items to add..." : "Select items to remove..."}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelectionMode('none');
                    setSelectedVariants(new Set());
                    setSelectedItems(new Set()); // Clear both
                    setAddingToMasterId(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <InventoryTable
            products={filteredProducts}
            masterProducts={filteredMasters}
            onRefresh={fetchAllData}
            selectionMode={selectionMode}
            selectedVariants={selectedVariants}
            selectedItems={selectedItems}
            onToggleSelection={(id) => {
              const newSet = new Set(selectedVariants);
              if (newSet.has(id)) newSet.delete(id);
              else newSet.add(id);
              setSelectedVariants(newSet);
            }}
            onToggleItems={handleToggleItems}
            onUpdateStock={async (id, type, val) => {
              if (type === 'variant') await saveStock(id, val);
              else {
                const res = await fetch(`/api/master-products/${id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ stock_quantity: parseInt(val, 10) }),
                });
                if (res.ok) {
                  toast.success("Master Stock updated");
                  fetchAllData();
                } else {
                  toast.error("Failed");
                }
              }
            }}
            onUpdateCost={async (id, val) => saveSupplierCost(id, val)}
            onUpdateMultiplier={async (id, val) => saveMultiplier(id, val)}
            onUngroup={async (vid, mid) => ungroupVariant(vid, mid)}
            onDeleteMaster={async (id) => deleteMasterProduct(id)}
            onStartAddingToMaster={(id) => {
              setAddingToMasterId(id);
              setSelectionMode('master_add');
            }}
          />
        </div>
      </div>

      <Dialog open={groupModal} onOpenChange={setGroupModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Master Product</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Master Product Name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button onClick={async () => {
              if (!groupName.trim()) return;
              try {
                await fetch("/api/master-products", {
                  method: 'POST',
                  body: JSON.stringify({ name: groupName, variant_ids: Array.from(selectedVariants) })
                });
                toast.success("Group created");
                setGroupModal(false);
                setSelectionMode('none');
                setSelectedVariants(new Set());
                fetchAllData();
                fetchCollections();
              } catch { toast.error("Failed"); }
            }}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to Collection Dialog */}
      <Dialog open={addToCollectionModal} onOpenChange={setAddToCollectionModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Collection</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            {sortedCollections.map(col => (
              <Button key={col.id} variant="outline" className="justify-start gap-2" onClick={() => addItemsToCollection(col.id)}>
                <Folder className={`h-4 w-4 ${COLLECTION_COLORS[col.name] || 'text-sky-500'}`} />
                <div className="flex items-center gap-2 flex-1">
                  <span>{col.name}</span>
                  <Badge variant="secondary" className="ml-auto">{col.itemCount}</Badge>
                </div>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* FABs */}
      {selectionMode === 'master' && selectedVariants.size >= 2 && (
        <div className="fixed bottom-8 right-8 animate-in fade-in slide-in-from-bottom-4">
          <Button size="lg" className="shadow-lg" onClick={() => setGroupModal(true)}>
            Group {selectedVariants.size} Items
          </Button>
        </div>
      )}

      {selectionMode === 'master_add' && selectedVariants.size > 0 && addingToMasterId && (
        <div className="fixed bottom-8 right-8 animate-in fade-in slide-in-from-bottom-4 z-50">
          <Button size="lg" className="shadow-lg" onClick={addVariantsToMaster}>
            Add {selectedVariants.size} Items to Master Product
          </Button>
        </div>
      )}

      {selectionMode === 'collection' && selectedItems.size > 0 && (
        <div className="fixed bottom-8 right-8 animate-in fade-in slide-in-from-bottom-4">
          {currentView === 'all' ? (
            <Button size="lg" className="shadow-lg" onClick={() => setAddToCollectionModal(true)}>
              Add {selectedItems.size} Items to Collection
            </Button>
          ) : (
            <Button size="lg" variant="destructive" className="shadow-lg" onClick={removeItemsFromCollection}>
              Remove {selectedItems.size} Items
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
