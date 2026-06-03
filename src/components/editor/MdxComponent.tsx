"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from "@tiptap/react";
import { useRef, useState } from "react";
import { Boxes } from "lucide-react";
import { encodeMdxRawSource, decodeMdxRawSource } from "@/lib/markdown";
import { MdxComponentPopover } from "./MdxComponentPopover";

const SUMMARY_PROP_CANDIDATES = ["title", "label", "name", "heading", "href"];

function deriveTagName(rawSource: string): string {
  const match = rawSource.match(/^\s*<\s*([A-Z][A-Za-z0-9_]*)/);
  return match?.[1] ?? "";
}

function deriveSummary(rawSource: string): string {
  for (const key of SUMMARY_PROP_CANDIDATES) {
    const m = rawSource.match(new RegExp(`\\b${key}\\s*=\\s*"([^"]*)"`));
    if (m && m[1].trim()) return m[1];
  }
  return "";
}

function MdxComponentView({
  node,
  updateAttributes,
  deleteNode,
  editor,
}: NodeViewProps) {
  const [open, setOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const chipRef = useRef<HTMLDivElement>(null);

  const tagName = (node.attrs.tagName as string) || "Component";
  const rawSource = (node.attrs.rawSource as string) || "";
  const summary = (node.attrs.summary as string) || "";

  const handleClick = () => {
    if (!editor.isEditable) return;
    const rect = chipRef.current?.getBoundingClientRect();
    if (rect) {
      setPopoverPos({ top: rect.bottom + 8, left: rect.left });
    }
    setOpen(true);
  };

  const handleSave = (newSource: string) => {
    updateAttributes({
      rawSource: newSource,
      tagName: deriveTagName(newSource) || tagName,
      summary: deriveSummary(newSource),
    });
    setOpen(false);
  };

  return (
    <NodeViewWrapper as="div" className="my-3" data-mdx-component-wrapper="">
      <div
        ref={chipRef}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        className="group not-prose flex items-stretch gap-3 rounded-md border border-border bg-surface-tertiary hover:border-accent-border hover:bg-accent-subtle transition-colors cursor-pointer overflow-hidden select-none"
      >
        <div className="w-1 bg-accent-border group-hover:bg-accent transition-colors" />
        <div className="flex items-center gap-3 py-2.5 pr-3 min-w-0 flex-1">
          <Boxes className="h-4 w-4 text-fg-tertiary shrink-0" />
          <span className="text-sm font-mono text-fg-secondary shrink-0">
            {tagName}
          </span>
          {summary ? (
            <>
              <span className="text-fg-tertiary shrink-0">—</span>
              <span className="text-sm text-fg truncate">{summary}</span>
            </>
          ) : (
            <span className="text-sm text-fg-tertiary truncate">
              {rawSource.includes("\n")
                ? `${rawSource.split("\n").length} lines`
                : "Click to edit"}
            </span>
          )}
        </div>
      </div>

      {open && (
        <MdxComponentPopover
          initialSource={rawSource}
          position={popoverPos}
          onSave={handleSave}
          onRemove={() => {
            deleteNode();
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </NodeViewWrapper>
  );
}

export const MdxComponent = Node.create({
  name: "mdxComponent",

  group: "block",

  atom: true,

  selectable: true,

  draggable: false,

  addAttributes() {
    return {
      tagName: { default: "" },
      rawSource: { default: "" },
      summary: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-mdx-component]",
        getAttrs: (el) => {
          const node = el as HTMLElement;
          const encoded = node.textContent ?? "";
          const rawSource = decodeMdxRawSource(encoded);
          const tagName =
            node.getAttribute("data-tag-name") || deriveTagName(rawSource);
          return {
            tagName,
            rawSource,
            summary: deriveSummary(rawSource),
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const rawSource = (node.attrs.rawSource as string) ?? "";
    const tagName = (node.attrs.tagName as string) ?? "";
    const encoded = encodeMdxRawSource(rawSource);
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-mdx-component": "",
        "data-tag-name": tagName,
      }),
      encoded,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MdxComponentView);
  },
});
