"use client";

import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import Underline from "@tiptap/extension-underline";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { EditorImage } from "./EditorImage";
import { ImageUploadPlaceholder } from "./ImageUploadPlaceholder";
import { MdxComponent } from "./MdxComponent";
import { createLowlight } from "lowlight";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import css from "highlight.js/lib/languages/css";

const lowlight = createLowlight();
lowlight.register("javascript", javascript);
lowlight.register("typescript", typescript);
lowlight.register("python", python);
lowlight.register("bash", bash);
lowlight.register("json", json);
lowlight.register("yaml", yaml);
lowlight.register("css", css);

interface EditorProps {
  initialHtml: string;
  onUpdate: (html: string) => void;
  onSelectionChange?: (hasSelection: boolean, from: number, to: number) => void;
  readOnly?: boolean;
}

export function Editor({
  initialHtml,
  onUpdate,
  onSelectionChange,
  readOnly = false,
}: EditorProps) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // Override with CodeBlockLowlight
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "editor-link" },
      }),
      Placeholder.configure({
        placeholder: "Start writing...",
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      CodeBlockLowlight.configure({ lowlight }),
      EditorImage.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: { class: "editor-image" },
      }),
      ImageUploadPlaceholder,
      MdxComponent,
    ],
    content: initialHtml,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      onUpdateRef.current(editor.getHTML());
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      const hasSelection = from !== to;
      onSelectionChangeRef.current?.(hasSelection, from, to);
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-gray dark:prose-invert max-w-none focus:outline-none min-h-full px-16 py-12",
      },
    },
  });

  // Update content if it changes externally (e.g., switching between WYSIWYG and raw)
  const prevHtml = useRef(initialHtml);
  useEffect(() => {
    if (editor && initialHtml !== prevHtml.current) {
      prevHtml.current = initialHtml;
      editor.commands.setContent(initialHtml, { emitUpdate: false });
    }
  }, [editor, initialHtml]);

  return (
    <div className="h-full overflow-y-auto">
      <EditorContent editor={editor} className="h-full" />
    </div>
  );
}

// Export the TipTap Editor type for use in other components
export type { Editor as TipTapEditor };
