"use client";

import { useState, useRef, useEffect } from "react";
import {
  Folder,
  FileText,
  LayoutGrid,
  ChevronRight,
  Plus,
  FilePlus,
  FolderPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type MillerItem =
  | { type: "folder"; path: string; name: string }
  | { type: "collection"; path: string; label: string }
  | { type: "file"; path: string; displayName: string };

interface MillerColumnProps {
  items: MillerItem[];
  selectedItem: string | null;
  onSelect: (path: string, itemType: MillerItem["type"]) => void;
  label: string;
  folderPath?: string;
  onCreatePage?: (folderPath: string) => void;
  onCreateFolder?: (parentPath: string) => void;
}

export function MillerColumn({
  items,
  selectedItem,
  onSelect,
  label,
  folderPath,
  onCreatePage,
  onCreateFolder,
}: MillerColumnProps) {
  const [showChooser, setShowChooser] = useState(false);
  const chooserRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showChooser) return;
    function handleClickOutside(e: MouseEvent) {
      if (chooserRef.current && !chooserRef.current.contains(e.target as Node)) {
        setShowChooser(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setShowChooser(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showChooser]);

  const canCreate = !!folderPath && !!(onCreatePage || onCreateFolder);

  return (
    <div className="w-[220px] flex-shrink-0 border-r border-border-secondary flex flex-col h-full">
      {/* Column header */}
      <div className="relative px-3 py-2 border-b border-border-secondary flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-fg-tertiary uppercase tracking-wider truncate">
          {label}
        </span>
        {canCreate && (
          <div ref={chooserRef} className="relative flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowChooser((v) => !v);
              }}
              className="p-0.5 rounded hover:bg-row-hover text-fg-tertiary hover:text-fg cursor-pointer transition-colors duration-150"
              aria-label={`Add to ${label}`}
              title={`Add to ${label}`}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            {showChooser && (
              <div className="absolute right-0 top-full mt-1 z-20 w-[160px] bg-surface border border-border rounded-md shadow-lg py-1">
                {onCreatePage && (
                  <button
                    onClick={() => {
                      setShowChooser(false);
                      onCreatePage(folderPath!);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-fg-secondary hover:bg-row-hover hover:text-text-primary cursor-pointer transition-colors duration-150 text-left"
                  >
                    <FilePlus className="h-3.5 w-3.5 text-fg-tertiary" />
                    New page
                  </button>
                )}
                {onCreateFolder && (
                  <button
                    onClick={() => {
                      setShowChooser(false);
                      onCreateFolder(folderPath!);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-fg-secondary hover:bg-row-hover hover:text-text-primary cursor-pointer transition-colors duration-150 text-left"
                  >
                    <FolderPlus className="h-3.5 w-3.5 text-fg-tertiary" />
                    New folder
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto py-1">
        {items.map((item) => {
          const path = item.path;
          const isSelected = selectedItem === path;
          const isNavigable = item.type === "folder" || item.type === "collection";

          return (
            <button
              key={path}
              onClick={() => onSelect(path, item.type)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-[7px] text-[13px] cursor-pointer transition-colors duration-150 relative",
                isSelected
                  ? "bg-row-selected text-accent"
                  : "text-fg-secondary hover:bg-row-hover hover:text-text-primary"
              )}
            >
              {isSelected && (
                <div className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full bg-accent" />
              )}
              {item.type === "folder" && (
                <Folder className={cn("h-3.5 w-3.5 flex-shrink-0", isSelected ? "text-accent" : "text-fg-tertiary")} />
              )}
              {item.type === "collection" && (
                <LayoutGrid className={cn("h-3.5 w-3.5 flex-shrink-0", isSelected ? "text-accent" : "text-fg-tertiary")} />
              )}
              {item.type === "file" && (
                <FileText className={cn("h-3.5 w-3.5 flex-shrink-0", isSelected ? "text-accent" : "text-fg-tertiary")} />
              )}

              <span className="truncate flex-1 text-left">
                {item.type === "collection" ? item.label : item.type === "folder" ? item.name : item.displayName}
              </span>

              {isNavigable && (
                <ChevronRight className={cn("h-3 w-3 flex-shrink-0", isSelected ? "text-accent/70" : "text-fg-tertiary/50")} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
