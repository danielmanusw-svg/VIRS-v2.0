"use client";

import { useState, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, Package, Box, Image as ImageIcon } from "lucide-react";
import { ShippingCostModal } from "@/components/inventory/ShippingCostModal";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Types matching the API response structure roughly
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
    variants?: Variant[]; // Optional, will be populated by parent or sorting
}

// Flattened/Enriched type for display
interface EnrichedVariant extends Variant {
    product_title: string;
    product_image: string | null;
    product_vendor: string | null;
}

interface InventoryTableProps {
    products: Product[]; // Raw product list
    masterProducts: MasterProduct[];
    onRefresh: () => void;
    groupMode?: boolean; // Deprecated
    selectionMode: 'none' | 'master' | 'master_add' | 'collection';
    selectedVariants: Set<number>;
    onToggleSelection: (id: number) => void;
    // New handlers
    selectedItems: Set<string>;
    onToggleItems: (items: { type: 'variant' | 'master', id: number }[], action?: 'add' | 'remove') => void;

    onUpdateStock: (id: number, type: 'variant' | 'master', value: string) => Promise<void>;
    onUpdateCost: (id: number, value: string) => Promise<void>;
    onUpdateMultiplier: (id: number, value: string) => Promise<void>;
    onUngroup: (variantId: number, masterId: number) => Promise<void>;
    onDeleteMaster: (id: number) => Promise<void>;
    onStartAddingToMaster: (id: number) => void;
}

export function InventoryTable({
    products,
    masterProducts,
    onRefresh,
    selectionMode,
    selectedVariants,
    onToggleSelection,
    selectedItems,
    onToggleItems,
    onUpdateStock,
    onUpdateCost,
    onUpdateMultiplier,
    onUngroup,
    onDeleteMaster,
    onStartAddingToMaster,
}: InventoryTableProps) {
    // State for editable fields
    const [editingStock, setEditingStock] = useState<{ id: number; type: 'variant' | 'master'; value: string } | null>(null);
    const [editingCost, setEditingCost] = useState<{ id: number; value: string } | null>(null);
    const [editingMultiplier, setEditingMultiplier] = useState<{ id: number; value: string } | null>(null);

    const [shippingModal, setShippingModal] = useState<{
        open: boolean;
        variantId: number;
        variantTitle: string;
        currentCosts: Record<string, number>;
    }>({ open: false, variantId: 0, variantTitle: "", currentCosts: {} });

    // State for expanded master rows
    const [expandedMasters, setExpandedMasters] = useState<Set<number>>(new Set());

    // Prepare data
    // 1. Map Master Products to their variants
    const masterMap = new Map<number, MasterProduct & { linkedVariants: EnrichedVariant[] }>();

    masterProducts.forEach(mp => {
        masterMap.set(mp.id, { ...mp, linkedVariants: [] });
    });

    const standaloneVariants: EnrichedVariant[] = [];

    products.forEach((p) => {
        p.variants.forEach((v) => {
            const enriched: EnrichedVariant = {
                ...v,
                product_title: p.title,
                product_image: p.image_url,
                product_vendor: p.vendor,
            };

            if (v.master_product_id && masterMap.has(v.master_product_id)) {
                masterMap.get(v.master_product_id)!.linkedVariants.push(enriched);
            } else {
                standaloneVariants.push(enriched);
            }
        });
    });

    function toggleMaster(id: number) {
        const newSet = new Set(expandedMasters);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedMasters(newSet);
    }

    // Toggle Item
    const handleToggleItem = (type: 'variant' | 'master', id: number) => {
        onToggleItems([{ type, id }]);
    };

    // Toggle all visible
    const toggleAll = () => {
        const allItems: { type: 'variant' | 'master', id: number }[] = [];
        const allKeys = new Set<string>();

        // Collect all visible items
        masterMap.forEach(mp => {
            allItems.push({ type: 'master', id: mp.id });
            allKeys.add(`master:${mp.id}`);
        });

        standaloneVariants.forEach(v => {
            allItems.push({ type: 'variant', id: v.id });
            allKeys.add(`variant:${v.id}`);
        });

        // Check if ALL are currently selected (of visible top-level items)
        let allVisibleSelected = true;
        if (allItems.length === 0) allVisibleSelected = false;
        else {
            for (const key of allKeys) {
                if (!selectedItems.has(key)) {
                    allVisibleSelected = false;
                    break;
                }
            }
        }

        if (allVisibleSelected) {
            onToggleItems(allItems, 'remove');
        } else {
            onToggleItems(allItems, 'add');
        }
    };

    // Checkbox State for Header
    const isAllSelected = (() => {
        if (masterMap.size === 0 && standaloneVariants.length === 0) return false;

        let allVisibleSelected = true;
        for (const mp of masterMap.values()) {
            if (!selectedItems.has(`master:${mp.id}`)) {
                return false;
            }
        }
        for (const v of standaloneVariants) {
            if (!selectedItems.has(`variant:${v.id}`)) {
                return false;
            }
        }
        return true;
    })();

    // Helper to render editable cell
    const renderEditableCell = (
        id: number,
        value: string | number,
        displayValue: string,
        isEditing: boolean,
        setEditing: (val: any) => void,
        onSave: (val: string) => void,
        widthClass: string = "w-20"
    ) => {
        if (isEditing) {
            return (
                <Input
                    autoFocus
                    className={cn("h-8", widthClass)}
                    value={value}
                    onChange={(e) => setEditing({ id, value: e.target.value })}
                    onBlur={() => onSave(value.toString())}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') onSave(value.toString());
                        if (e.key === 'Escape') setEditing(null);
                    }}
                />
            );
        }
        return (
            <div className="cursor-pointer hover:bg-muted/50 px-2 py-1 rounded" onClick={() => setEditing({ id, value: value.toString() })}>
                {displayValue}
            </div>
        );
    };

    return (
        <div className="rounded-md border relative">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-10">
                            {selectionMode === 'collection' && (
                                <input type="checkbox" onChange={toggleAll} checked={isAllSelected} />
                            )}
                        </TableHead>
                        {(selectionMode === 'master' || selectionMode === 'master_add') && <TableHead className="w-10"></TableHead>}
                        <TableHead>Product / Variant</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="w-24">Stock</TableHead>
                        <TableHead className="w-24">Supplier Cost</TableHead>
                        <TableHead className="w-20">Multiplier</TableHead>
                        <TableHead className="w-32">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {/* 1. Master Products */}
                    {Array.from(masterMap.values()).map((mp) => (
                        <Fragment key={`mp-group-${mp.id}`}>
                            <TableRow className={cn("bg-muted/30 font-medium group", selectedItems.has(`master:${mp.id}`) && "bg-blue-50")}>
                                <TableCell>
                                    {selectionMode === 'collection' && (
                                        <input
                                            type="checkbox"
                                            checked={selectedItems.has(`master:${mp.id}`)}
                                            onChange={() => handleToggleItem('master', mp.id)}
                                        />
                                    )}
                                </TableCell>
                                {(selectionMode === 'master' || selectionMode === 'master_add') && <TableCell></TableCell>}
                                <TableCell>
                                    <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => toggleMaster(mp.id)}>
                                        {expandedMasters.has(mp.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                        {mp.image_url ? (
                                            <img src={mp.image_url} alt="" className="h-8 w-8 rounded object-cover" />
                                        ) : (
                                            <Package className="h-4 w-4 text-purple-500" />
                                        )}
                                        <div>
                                            <div>{mp.name}</div>
                                            <Badge variant="secondary" className="text-[10px]">Master Product</Badge>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell><span className="text-muted-foreground text-xs">—</span></TableCell>
                                <TableCell>
                                    {editingStock?.id === mp.id && editingStock.type === 'master' ? (
                                        <Input
                                            autoFocus
                                            className="h-8 w-20"
                                            value={editingStock.value}
                                            onChange={(e) => setEditingStock({ ...editingStock, value: e.target.value })}
                                            onBlur={() => onUpdateStock(mp.id, 'master', editingStock.value).then(() => setEditingStock(null))}
                                            onKeyDown={(e) => e.key === 'Enter' && onUpdateStock(mp.id, 'master', editingStock.value).then(() => setEditingStock(null))}
                                        />
                                    ) : (
                                        <div
                                            className="flex items-center gap-2 cursor-pointer"
                                            onClick={() => setEditingStock({ id: mp.id, type: 'master', value: mp.stock_quantity.toString() })}
                                        >
                                            <span className={cn(mp.stock_quantity === 0 && "text-red-500 font-bold")}>
                                                {mp.stock_quantity}
                                            </span>
                                            {mp.is_manual_stock && (
                                                <Badge variant="outline" className="text-[10px] h-4 px-1">Manual</Badge>
                                            )}
                                        </div>
                                    )}
                                </TableCell>
                                <TableCell colSpan={3} className="text-right">
                                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity pr-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 text-[11px] bg-blue-50/50 hover:bg-blue-100 text-blue-600 border border-blue-200"
                                            onClick={(e) => { e.stopPropagation(); onStartAddingToMaster(mp.id); }}
                                        >
                                            Add Variants
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 text-[11px] text-red-500 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 px-2"
                                            onClick={(e) => { e.stopPropagation(); onDeleteMaster(mp.id); }}
                                            title="Delete Master Product"
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                            {expandedMasters.has(mp.id) && mp.linkedVariants.map((v) => (
                                <TableRow key={v.id} className="bg-muted/10">
                                    <TableCell>
                                        {selectionMode === 'collection' && (
                                            <input
                                                type="checkbox"
                                                checked={selectedItems.has(`variant:${v.id}`)}
                                                onChange={() => handleToggleItem('variant', v.id)}
                                                className="ml-4"
                                            />
                                        )}
                                    </TableCell>
                                    {(selectionMode === 'master' || selectionMode === 'master_add') && <TableCell></TableCell>}
                                    <TableCell className="pl-10">
                                        <div className="flex items-center gap-2">
                                            {v.product_image ? (
                                                <img src={v.product_image} alt="" className="h-8 w-8 rounded object-cover" />
                                            ) : (
                                                <Box className="h-3 w-3 text-muted-foreground" />
                                            )}
                                            <div>
                                                <div className="text-sm">{v.product_title} - {v.title}</div>
                                                {v.product_vendor && <div className="text-xs text-muted-foreground">{v.product_vendor}</div>}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-xs font-mono">{v.sku}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{mp.stock_quantity} (Linked)</TableCell>
                                    <TableCell>
                                        {renderEditableCell(
                                            v.id,
                                            editingCost?.id === v.id ? editingCost.value : v.supplier_cost,
                                            `£${v.supplier_cost.toFixed(2)}`,
                                            editingCost?.id === v.id,
                                            setEditingCost,
                                            (val) => onUpdateCost(v.id, val).then(() => setEditingCost(null))
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {renderEditableCell(
                                            v.id,
                                            editingMultiplier?.id === v.id ? editingMultiplier.value : v.bundle_multiplier,
                                            `${v.bundle_multiplier}x`,
                                            editingMultiplier?.id === v.id,
                                            setEditingMultiplier,
                                            (val) => onUpdateMultiplier(v.id, val).then(() => setEditingMultiplier(null)),
                                            "w-16"
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setShippingModal({ open: true, variantId: v.id, variantTitle: v.title, currentCosts: v.shipping_costs })}
                                            >
                                                Shipping
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                                                onClick={() => onUngroup(v.id, mp.id)}
                                            >
                                                Ungroup
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-yellow-500 hover:bg-yellow-50"
                                                title="Set as Master Image"
                                                onClick={async () => {
                                                    if (!v.product_image) return;
                                                    await fetch(`/api/master-products/${mp.id}`, {
                                                        method: 'PUT',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ image_url: v.product_image })
                                                    });
                                                    toast.success("Master image updated");
                                                    onRefresh();
                                                }}
                                            >
                                                <ImageIcon className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </Fragment>
                    ))}

                    {/* 2. Standalone Variants */}
                    {standaloneVariants.map((v) => (
                        <TableRow key={v.id} className={cn(selectedItems.has(`variant:${v.id}`) && "bg-blue-50")}>
                            <TableCell>
                                {selectionMode === 'collection' && (
                                    <input
                                        type="checkbox"
                                        checked={selectedItems.has(`variant:${v.id}`)}
                                        onChange={() => handleToggleItem('variant', v.id)}
                                    />
                                )}
                            </TableCell>
                            {(selectionMode === 'master' || selectionMode === 'master_add') && (
                                <TableCell>
                                    <input
                                        type="checkbox"
                                        checked={selectedVariants.has(v.id)}
                                        onChange={() => onToggleSelection(v.id)}
                                        className="h-4 w-4 rounded border-gray-300"
                                    />
                                </TableCell>
                            )}
                            <TableCell>
                                <div className="flex items-center gap-3">
                                    {v.product_image && (
                                        <img src={v.product_image} alt="" className="h-8 w-8 rounded object-cover" />
                                    )}
                                    <div className="flex flex-col">
                                        <span className="font-medium text-sm">{v.product_title}</span>
                                        <span className="text-xs text-muted-foreground">{v.title}</span>
                                        {v.product_vendor && <span className="text-[10px] text-muted-foreground">{v.product_vendor}</span>}
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{v.sku || "—"}</TableCell>
                            <TableCell>
                                {/* Stock Edit Logic */}
                                {editingStock?.id === v.id && editingStock.type === 'variant' ? (
                                    <Input
                                        autoFocus
                                        className="h-8 w-20"
                                        value={editingStock.value}
                                        onChange={(e) => setEditingStock({ ...editingStock, value: e.target.value })}
                                        onBlur={() => onUpdateStock(v.id, 'variant', editingStock.value).then(() => setEditingStock(null))}
                                        onKeyDown={(e) => e.key === 'Enter' && onUpdateStock(v.id, 'variant', editingStock.value).then(() => setEditingStock(null))}
                                    />
                                ) : (
                                    <div
                                        className="cursor-pointer hover:underline"
                                        onClick={() => setEditingStock({ id: v.id, type: 'variant', value: v.stock_quantity.toString() })}
                                    >
                                        {v.stock_quantity}
                                    </div>
                                )}
                            </TableCell>
                            <TableCell>
                                {renderEditableCell(
                                    v.id,
                                    editingCost?.id === v.id ? editingCost.value : v.supplier_cost,
                                    `£${v.supplier_cost.toFixed(2)}`,
                                    editingCost?.id === v.id,
                                    setEditingCost,
                                    (val) => onUpdateCost(v.id, val).then(() => setEditingCost(null))
                                )}
                            </TableCell>
                            <TableCell>
                                {renderEditableCell(
                                    v.id,
                                    editingMultiplier?.id === v.id ? editingMultiplier.value : v.bundle_multiplier,
                                    `${v.bundle_multiplier}x`,
                                    editingMultiplier?.id === v.id,
                                    setEditingMultiplier,
                                    (val) => onUpdateMultiplier(v.id, val).then(() => setEditingMultiplier(null)),
                                    "w-16"
                                )}
                            </TableCell>
                            <TableCell>
                                <Button variant="ghost" size="sm" onClick={() => setShippingModal({ open: true, variantId: v.id, variantTitle: v.title, currentCosts: v.shipping_costs })}>
                                    Shipping
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            <ShippingCostModal
                open={shippingModal.open}
                onOpenChange={(o) => setShippingModal({ ...shippingModal, open: o })}
                variantId={shippingModal.variantId}
                variantTitle={shippingModal.variantTitle}
                currentCosts={shippingModal.currentCosts}
                onSave={async (id, costs) => {
                    await fetch(`/api/stock/${id}/shipping`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ costs }),
                    });
                    toast.success("Shipping updated");
                    onRefresh();
                }}
            />
        </div>
    );
}
