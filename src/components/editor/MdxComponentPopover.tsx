"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Check, Trash2, Code2 } from "lucide-react";

interface MdxComponentPopoverProps {
  initialSource: string;
  position: { top: number; left: number };
  onSave: (rawSource: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function MdxComponentPopover({
  initialSource,
  position,
  onSave,
  onRemove,
  onClose,
}: MdxComponentPopoverProps) {
  const [source, setSource] = useState(initialSource);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => textareaRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [onClose]);

  useEffect(() => {
    const handleScroll = (e: Event) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener("scroll", handleScroll, true);
    return () => document.removeEventListener("scroll", handleScroll, true);
  }, [onClose]);

  const handleSave = useCallback(() => {
    const trimmed = source.trim();
    if (!trimmed) {
      onRemove();
      return;
    }
    onSave(trimmed);
  }, [source, onSave, onRemove]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [handleSave, onClose]
  );

  return (
    <div
      ref={popoverRef}
      className="fixed z-50"
      style={{ top: position.top, left: position.left }}
    >
      <div className="absolute -top-1 left-4 w-2 h-2 bg-surface border-l border-t border-border rotate-45" />

      <div className="w-96 bg-surface border border-border rounded-md shadow-md p-1.5 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 px-1 pt-0.5">
          <Code2 className="h-3.5 w-3.5 text-fg-tertiary shrink-0" />
          <span className="text-xs text-fg-tertiary">Edit component source</span>
        </div>

        <textarea
          ref={textareaRef}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={6}
          spellCheck={false}
          className="w-full px-2 py-1.5 text-sm font-mono bg-bg-muted border border-border-secondary rounded-sm text-fg placeholder:text-fg-quaternary focus:outline-none focus:border-border-strong resize-none"
        />

        <div className="flex items-center justify-between gap-1.5">
          <button
            onClick={onRemove}
            title="Remove component"
            className="h-7 w-7 flex items-center justify-center rounded-sm text-fg-tertiary cursor-pointer shrink-0 hover:bg-bg-muted hover:text-error transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-fg-tertiary">⌘↵ to save</span>
            <button
              onClick={handleSave}
              disabled={!source.trim()}
              title="Save"
              className="h-7 px-3 flex items-center justify-center gap-1 rounded-sm bg-accent text-white text-xs cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-default hover:bg-accent/90 transition-colors"
            >
              <Check className="h-3 w-3" />
              <span>Save</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
