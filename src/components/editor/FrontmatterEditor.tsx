"use client";

import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { FrontmatterData } from "@/types";
import { cn } from "@/lib/utils";
import {
  TextInput,
  AutoResizeTextInput,
  TextareaInput,
  DateInput,
  TagsInput,
  ToggleInput,
  SelectInput,
  asString,
  asStringArray,
  asBool,
  detectFieldType,
} from "./FrontmatterFields";

// ─── Helpers ────────────────────────────────────────────────────────────────

function humanizeKey(key: string): string {
  return (
    key
      .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase → camel Case
      .replace(/[_-]/g, " ") // snake_case/kebab-case → spaces
      .replace(/\b\w/g, (c) => c.toUpperCase()) || key // capitalize words
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

interface FrontmatterEditorProps {
  data: FrontmatterData;
  onChange: (data: FrontmatterData) => void;
  picklists?: Record<string, string[]>;
}

export function FrontmatterEditor({ data, onChange, picklists = {} }: FrontmatterEditorProps) {
  const [newFieldKeys, setNewFieldKeys] = useState<Set<string>>(new Set());

  const handleValueChange = (
    key: string,
    value: string | boolean | string[]
  ) => {
    onChange({ ...data, [key]: value });
  };

  const handleKeyRename = (oldKey: string, newKey: string) => {
    // Always finalize (remove from newFieldKeys)
    setNewFieldKeys((prev) => {
      const next = new Set(prev);
      next.delete(oldKey);
      return next;
    });

    if (!newKey || newKey === oldKey) return;

    const entries = Object.entries(data);
    const idx = entries.findIndex(([k]) => k === oldKey);
    if (idx >= 0) {
      entries[idx] = [newKey, entries[idx][1]];
      onChange(Object.fromEntries(entries));
    }
  };

  const handleAddField = () => {
    const key = `field${Object.keys(data).length + 1}`;
    setNewFieldKeys((prev) => new Set(prev).add(key));
    onChange({ ...data, [key]: "" });
  };

  const handleRemoveField = (key: string) => {
    setNewFieldKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    const { [key]: _, ...rest } = data;
    onChange(rest);
  };

  const entries = Object.entries(data);

  return (
    <div className="px-4 py-3 space-y-4">
      {entries.map(([key, value]) => {
        const fieldType = detectFieldType(key, value);
        const isNew = newFieldKeys.has(key);
        const picklistOptions = picklists[key];

        if (isNew) {
          return (
            <NewFieldRow
              key={key}
              fieldKey={key}
              fieldType={fieldType}
              value={value}
              picklistOptions={picklistOptions}
              onRename={(newKey) => handleKeyRename(key, newKey)}
              onRemove={() => handleRemoveField(key)}
              onChange={(v) => handleValueChange(key, v)}
            />
          );
        }

        return (
          <EstablishedFieldRow
            key={key}
            fieldKey={key}
            fieldType={fieldType}
            value={value}
            picklistOptions={picklistOptions}
            onRemove={() => handleRemoveField(key)}
            onChange={(v) => handleValueChange(key, v)}
          />
        );
      })}

      <button
        onClick={handleAddField}
        className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover hover:underline cursor-pointer transition-colors mt-1"
      >
        <Plus className="h-3.5 w-3.5" />
        Add field
      </button>
    </div>
  );
}

// ─── Established Field (label + value + hover delete) ───────────────────────

function EstablishedFieldRow({
  fieldKey,
  fieldType,
  value,
  picklistOptions,
  onRemove,
  onChange,
}: {
  fieldKey: string;
  fieldType: ReturnType<typeof detectFieldType>;
  value: string | number | boolean | string[] | null;
  picklistOptions?: string[];
  onRemove: () => void;
  onChange: (v: string | boolean | string[]) => void;
}) {
  return (
    <div className="group relative">
      {fieldType !== "toggle" && (
        <label className="block text-xs font-medium text-fg-secondary mb-1">
          {humanizeKey(fieldKey)}
        </label>
      )}
      <FieldRenderer
        fieldKey={fieldKey}
        fieldType={fieldType}
        value={value}
        picklistOptions={picklistOptions}
        onChange={onChange}
      />
      <button
        onClick={onRemove}
        className="absolute top-0 right-0 p-1 rounded-sm text-fg-tertiary hover:text-red-500 cursor-pointer transition-colors opacity-0 group-hover:opacity-100"
        aria-label={`Remove ${humanizeKey(fieldKey)} field`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── New Field (editable key name + value + visible delete) ─────────────────

function NewFieldRow({
  fieldKey,
  fieldType,
  value,
  picklistOptions,
  onRename,
  onRemove,
  onChange,
}: {
  fieldKey: string;
  fieldType: ReturnType<typeof detectFieldType>;
  value: string | number | boolean | string[] | null;
  picklistOptions?: string[];
  onRename: (newKey: string) => void;
  onRemove: () => void;
  onChange: (v: string | boolean | string[]) => void;
}) {
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          type="text"
          defaultValue={fieldKey}
          autoFocus
          onBlur={(e) => onRename(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Field name"
          className={cn(
            "flex-1 text-xs font-medium px-2.5 py-1.5 border border-accent/40 rounded bg-surface",
            "focus:outline-none focus:ring-1 focus:ring-accent/40 text-fg-secondary"
          )}
        />
        <button
          onClick={onRemove}
          className="p-1 rounded-sm text-fg-tertiary hover:text-red-500 cursor-pointer transition-colors"
          aria-label="Remove field"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <FieldRenderer
        fieldKey={fieldKey}
        fieldType={fieldType}
        value={value}
        picklistOptions={picklistOptions}
        onChange={onChange}
      />
    </div>
  );
}

// ─── Field Renderer ─────────────────────────────────────────────────────────

function FieldRenderer({
  fieldKey,
  fieldType,
  value,
  picklistOptions,
  onChange,
}: {
  fieldKey: string;
  fieldType: ReturnType<typeof detectFieldType>;
  value: string | number | boolean | string[] | null;
  picklistOptions?: string[];
  onChange: (v: string | boolean | string[]) => void;
}) {
  // Picklist overrides text-y field types only — preserve toggle/date/tags semantics
  if (
    picklistOptions &&
    picklistOptions.length > 0 &&
    fieldType !== "toggle" &&
    fieldType !== "date" &&
    fieldType !== "tags"
  ) {
    return (
      <SelectInput
        value={asString(value)}
        options={picklistOptions}
        onChange={(v) => onChange(v)}
      />
    );
  }

  switch (fieldType) {
    case "toggle":
      return (
        <ToggleInput
          label={humanizeKey(fieldKey)}
          value={asBool(value)}
          onChange={(v) => onChange(v)}
        />
      );

    case "date":
      return (
        <DateInput value={asString(value)} onChange={(v) => onChange(v)} />
      );

    case "tags":
      return (
        <TagsInput
          value={asStringArray(value)}
          onChange={(v) => onChange(v)}
        />
      );

    case "textarea":
      return (
        <TextareaInput
          value={asString(value)}
          onChange={(v) => onChange(v)}
        />
      );

    case "text":
    default:
      if (fieldKey === "title") {
        return (
          <AutoResizeTextInput
            value={asString(value)}
            onChange={(v) => onChange(v)}
          />
        );
      }
      return (
        <TextInput value={asString(value)} onChange={(v) => onChange(v)} />
      );
  }
}
