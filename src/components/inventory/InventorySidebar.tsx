"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Folder, LayoutGrid, Plus, MoreVertical, Pencil, Trash2 } from "lucide-react";

export interface Collection {
    id: number;
    name: string;
    itemCount: number;
}

interface InventorySidebarProps {
    currentView: "all" | number;
    onViewChange: (view: "all" | number) => void;
    collections: Collection[];
    onCreateCollection: (name: string) => Promise<void>;
    onRenameCollection: (id: number, name: string) => Promise<void>;
    onDeleteCollection: (id: number) => Promise<void>;
}

export function InventorySidebar({
    currentView,
    onViewChange,
    collections,
    onCreateCollection,
    onRenameCollection,
    onDeleteCollection,
}: InventorySidebarProps) {
    const [createModal, setCreateModal] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState("");
    const [renameModal, setRenameModal] = useState<{ open: boolean; id: number; name: string }>({ open: false, id: 0, name: "" });
    const [deleteModal, setDeleteModal] = useState<{ open: boolean; id: number; name: string }>({ open: false, id: 0, name: "" });
    const [loading, setLoading] = useState(false);

    const getCollectionColor = (name: string) => {
        const colors: Record<string, string> = {
            "Tap Filters": "text-sky-500",
            "Cartridges": "text-purple-500",
            "Adaptors": "text-orange-500",
            "Bathroom": "text-emerald-500",
            "Other": "text-slate-500",
            "No Count": "text-rose-400"
        };
        return colors[name] || "text-sky-500";
    };

    const renderCollectionItem = (col: Collection) => (
        <div key={col.id} className="group relative flex items-center">
            <Button
                variant={currentView === col.id ? "secondary" : "ghost"}
                className="w-full justify-start gap-2 pr-8"
                onClick={() => onViewChange(col.id)}
            >
                <Folder className={`h-4 w-4 ${getCollectionColor(col.name)}`} />
                <span className="truncate flex-1 text-left">{col.name}</span>
                <span className="text-xs text-muted-foreground mr-6">
                    {col.itemCount}
                </span>
            </Button>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 absolute right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <MoreVertical className="h-3 w-3" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setRenameModal({ open: true, id: col.id, name: col.name })}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDeleteModal({ open: true, id: col.id, name: col.name })} className="text-red-500">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );

    const mainCollections = collections.filter(c => c.name !== "No Count");
    const noCountCollection = collections.find(c => c.name === "No Count");

    return (
        <div className="w-64 border-r bg-muted/10 p-4 flex flex-col gap-4 h-[calc(100vh-4rem)] sticky top-16">
            <div className="font-semibold px-2">Library</div>
            <div className="space-y-1">
                <Button
                    variant={currentView === "all" ? "secondary" : "ghost"}
                    className="w-full justify-start gap-2"
                    onClick={() => onViewChange("all")}
                >
                    <LayoutGrid className="h-4 w-4" />
                    All Products
                </Button>
            </div>

            <div className="flex items-center justify-between px-2 mt-4">
                <div className="font-semibold">Collections</div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setCreateModal(true)}
                >
                    <Plus className="h-4 w-4" />
                </Button>
            </div>

            <div className="flex flex-col flex-1 overflow-y-auto">
                <div className="space-y-1">
                    {mainCollections.map(renderCollectionItem)}
                </div>

                {noCountCollection && (
                    <div className="mt-auto pt-4 pb-12 space-y-1">
                        <div className="px-2 mb-2">
                            <div className="border-t w-full" />
                        </div>
                        {renderCollectionItem(noCountCollection)}
                    </div>
                )}
            </div>

            {/* Create Modal */}
            <Dialog open={createModal} onOpenChange={setCreateModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New Collection</DialogTitle>
                        <DialogDescription>Create a collection to organize your products.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            placeholder="Collection Name"
                            value={newCollectionName}
                            onChange={(e) => setNewCollectionName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && !loading && onCreateCollection(newCollectionName).then(() => { setCreateModal(false); setNewCollectionName(""); })}
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateModal(false)}>Cancel</Button>
                        <Button disabled={loading} onClick={() => {
                            setLoading(true);
                            onCreateCollection(newCollectionName).finally(() => {
                                setLoading(false);
                                setCreateModal(false);
                                setNewCollectionName("");
                            });
                        }}>Create</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Rename Modal */}
            <Dialog open={renameModal.open} onOpenChange={(open) => setRenameModal((prev) => ({ ...prev, open }))}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Rename Collection</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            value={renameModal.name}
                            onChange={(e) => setRenameModal((prev) => ({ ...prev, name: e.target.value }))}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !loading) {
                                    setLoading(true);
                                    onRenameCollection(renameModal.id, renameModal.name).finally(() => {
                                        setLoading(false);
                                        setRenameModal({ open: false, id: 0, name: "" });
                                    });
                                }
                            }}
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRenameModal({ open: false, id: 0, name: "" })}>Cancel</Button>
                        <Button disabled={loading} onClick={() => {
                            setLoading(true);
                            onRenameCollection(renameModal.id, renameModal.name).finally(() => {
                                setLoading(false);
                                setRenameModal({ open: false, id: 0, name: "" });
                            });
                        }}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Modal */}
            <Dialog open={deleteModal.open} onOpenChange={(open) => setDeleteModal((prev) => ({ ...prev, open }))}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Collection</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete "{deleteModal.name}"? This will not delete the products inside.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteModal({ open: false, id: 0, name: "" })}>Cancel</Button>
                        <Button variant="destructive" disabled={loading} onClick={() => {
                            setLoading(true);
                            onDeleteCollection(deleteModal.id).finally(() => {
                                setLoading(false);
                                setDeleteModal({ open: false, id: 0, name: "" });
                            });
                        }}>Delete</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
