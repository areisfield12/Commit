"use client";

import { useState, useCallback } from "react";
import {
  Settings,
  ChevronRight,
  Info,
} from "lucide-react";
import { FrontmatterEditor } from "./FrontmatterEditor";
import {
  TextInput,
  TextareaInput,
  DateInput,
  TagsInput,
  ToggleInput,
  SelectInput,
  inputClass,
  asString,
  asStringArray,
  asBool,
} from "./FrontmatterFields";
import type { FrontmatterData, SchemaField } from "@/types";

interface FrontmatterPanelProps {
  data: FrontmatterData;
  onChange: (data: FrontmatterData) => void;
  schema: SchemaField[] | null;
  collectionLabel: string | null;
  loading?: boolean;
  picklists?: Record<string, string[]>;
}

export function FrontmatterPanel({
  data,
  onChange,
  schema,
  collectionLabel,
  loading = false,
  picklists = {},
}: FrontmatterPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const handleFieldChange = useCallback(
    (key: string, value: string | number | boolean | string[] | null) => {
      onChange({ ...data, [key]: value });
    },
    [data, onChange]
  );

  // Collapsed strip
  if (collapsed) {
    return (
      <div className="w-10 border-l border-border bg-surface-secondary flex flex-col items-center pt-3 flex-shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1 rounded-sm text-fg-tertiary hover:bg-bg-muted hover:text-text-primary cursor-pointer transition-colors"
          aria-label="Expand document settings"
          title="Document settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="w-[340px] border-l border-border bg-surface-secondary flex flex-col flex-shrink-0">
        <PanelHeader
          label="Document settings"
          onCollapse={() => setCollapsed(true)}
        />
        <div className="px-4 py-3 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <div className="h-3 w-20 bg-bg-muted rounded-sm animate-pulse mb-2" />
              <div className="h-8 bg-bg-muted rounded-sm animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // No schema — fall back to the generic key-value editor
  if (!schema) {
    return (
      <div className="w-[340px] border-l border-border bg-surface-secondary flex flex-col flex-shrink-0">
        <PanelHeader
          label="Document settings"
          onCollapse={() => setCollapsed(true)}
        />
        <div className="flex-1 overflow-y-auto">
          <FrontmatterEditor data={data} onChange={onChange} picklists={picklists} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-[340px] border-l border-border bg-surface-secondary flex flex-col flex-shrink-0">
      <PanelHeader
        label={collectionLabel ?? "Document settings"}
        onCollapse={() => setCollapsed(true)}
      />
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {schema.map((field) => (
          <SchemaFieldInput
            key={field.key}
            field={field}
            value={data[field.key] ?? field.default ?? null}
            onChange={(val) => handleFieldChange(field.key, val)}
            picklistOptions={picklists[field.key]}
          />
        ))}

        {/* Show any extra frontmatter keys not in the schema */}
        <ExtraFields data={data} schema={schema} onChange={onChange} picklists={picklists} />
      </div>
    </div>
  );
}

// ─── Headless content (used by RightPanel) ─────────────────────────────────

interface FrontmatterPanelContentProps {
  data: FrontmatterData;
  onChange: (data: FrontmatterData) => void;
  schema: SchemaField[] | null;
  collectionLabel: string | null;
  loading?: boolean;
  picklists?: Record<string, string[]>;
}

export function FrontmatterPanelContent({
  data,
  onChange,
  schema,
  loading = false,
  picklists = {},
}: FrontmatterPanelContentProps) {
  const handleFieldChange = useCallback(
    (key: string, value: string | number | boolean | string[] | null) => {
      onChange({ ...data, [key]: value });
    },
    [data, onChange]
  );

  if (loading) {
    return (
      <div className="px-4 py-3 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <div className="h-3 w-20 bg-surface-tertiary rounded-sm animate-pulse mb-2" />
            <div className="h-8 bg-surface-tertiary rounded-sm animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (!schema) {
    return (
      <div className="flex-1 overflow-y-auto">
        <FrontmatterEditor data={data} onChange={onChange} picklists={picklists} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
      {schema.map((field) => (
        <SchemaFieldInput
          key={field.key}
          field={field}
          value={data[field.key] ?? field.default ?? null}
          onChange={(val) => handleFieldChange(field.key, val)}
          picklistOptions={picklists[field.key]}
        />
      ))}
      <ExtraFields data={data} schema={schema} onChange={onChange} picklists={picklists} />
    </div>
  );
}

// ─── Panel Header ──────────────────────────────────────────────────────────

function PanelHeader({
  label,
  onCollapse,
}: {
  label: string;
  onCollapse: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-fg-secondary uppercase tracking-wide">
          {label}
        </span>
        <div className="relative group">
          <Info className="h-3 w-3 text-fg-tertiary cursor-default" />
          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-50 pointer-events-none invisible group-hover:visible">
            <div className="bg-surface-overlay text-fg-primary text-xs rounded px-2.5 py-1.5 shadow-md border border-border whitespace-nowrap max-w-[220px] text-center leading-snug">
              These fields are stored as frontmatter at the top of your markdown file.
            </div>
          </div>
        </div>
      </div>
      <button
        onClick={onCollapse}
        className="p-1 rounded-sm text-fg-tertiary hover:bg-bg-muted hover:text-text-primary cursor-pointer transition-colors"
        aria-label="Collapse panel"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Schema Field Router ────────────────────────────────────────────────────

function SchemaFieldInput({
  field,
  value,
  onChange,
  picklistOptions,
}: {
  field: SchemaField;
  value: string | number | boolean | string[] | null;
  onChange: (val: string | number | boolean | string[] | null) => void;
  picklistOptions?: string[];
}) {
  const label = (
    <label className="block text-xs font-medium text-fg-secondary mb-1">
      {field.label}
      {field.required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );

  // Schema's own options take precedence; otherwise fall back to a repo-level picklist
  const schemaHasOptions = (field.options?.length ?? 0) > 0;
  const usePicklist =
    !schemaHasOptions &&
    field.type !== "toggle" &&
    field.type !== "tags" &&
    field.type !== "date" &&
    picklistOptions &&
    picklistOptions.length > 0;

  if (usePicklist) {
    return (
      <div>
        {label}
        <SelectInput
          value={asString(value)}
          options={picklistOptions!}
          onChange={(v) => onChange(v)}
        />
      </div>
    );
  }

  switch (field.type) {
    case "text":
      return (
        <div>
          {label}
          <TextInput value={asString(value)} onChange={(v) => onChange(v)} />
        </div>
      );

    case "textarea":
      return (
        <div>
          {label}
          <TextareaInput
            value={asString(value)}
            onChange={(v) => onChange(v)}
          />
        </div>
      );

    case "date":
      return (
        <div>
          {label}
          <DateInput value={asString(value)} onChange={(v) => onChange(v)} />
        </div>
      );

    case "tags":
      return (
        <div>
          {label}
          <TagsInput
            value={asStringArray(value)}
            onChange={(v) => onChange(v)}
          />
        </div>
      );

    case "toggle":
      return (
        <ToggleInput
          label={field.label}
          value={asBool(value)}
          onChange={(v) => onChange(v)}
        />
      );

    case "select":
      return (
        <div>
          {label}
          <SelectInput
            value={asString(value)}
            options={field.options ?? []}
            onChange={(v) => onChange(v)}
          />
        </div>
      );

    default:
      return (
        <div>
          {label}
          <TextInput value={asString(value)} onChange={(v) => onChange(v)} />
        </div>
      );
  }
}

// ─── Extra Fields ───────────────────────────────────────────────────────────

function ExtraFields({
  data,
  schema,
  onChange,
  picklists = {},
}: {
  data: FrontmatterData;
  schema: SchemaField[];
  onChange: (data: FrontmatterData) => void;
  picklists?: Record<string, string[]>;
}) {
  const schemaKeys = new Set(schema.map((f) => f.key));
  const extraEntries = Object.entries(data).filter(([k]) => !schemaKeys.has(k));

  if (extraEntries.length === 0) return null;

  return (
    <div className="pt-3 border-t border-border space-y-3">
      <span className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-wide">
        Other fields
      </span>
      {extraEntries.map(([key, value]) => {
        const picklistOptions = picklists[key];
        return (
          <div key={key}>
            <label className="block text-xs font-medium text-fg-tertiary mb-1">
              {key}
            </label>
            {picklistOptions && picklistOptions.length > 0 ? (
              <SelectInput
                value={asString(value)}
                options={picklistOptions}
                onChange={(v) => onChange({ ...data, [key]: v })}
              />
            ) : (
              <input
                type="text"
                value={String(value ?? "")}
                onChange={(e) => onChange({ ...data, [key]: e.target.value })}
                className={inputClass}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
