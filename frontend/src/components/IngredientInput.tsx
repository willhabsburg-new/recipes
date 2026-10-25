import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { ApiError, get, post, qs } from "../api/client";
import type { CheckResult, Ingredient, Suggestion } from "../api/types";
import { useDebounced } from "../lib/useDebounced";
import { Icon } from "./Icon";
import { cx, inputClass, Spinner } from "./ui";

interface Props {
  /** The chosen ingredient, or null while the text doesn't name one yet. */
  value: Ingredient | null;
  onChange: (ingredient: Ingredient | null) => void;
  /** Typed text that isn't resolved to an ingredient yet (e.g. from a pasted line). */
  text?: string;
  onTextChange?: (text: string) => void;
  /** Chip-entry mode: empty the box after each pick instead of showing the pick. */
  clearOnSelect?: boolean;
  /** Offer to add names that aren't in the ingredient list. */
  allowCreate?: boolean;
  /** Ingredient ids to leave out of suggestions (already chosen). */
  exclude?: number[];
  placeholder?: string;
  autoFocus?: boolean;
  "aria-label"?: string;
}

type Option = { type: "suggestion"; suggestion: Suggestion } | { type: "create"; name: string };

export function IngredientInput({
  value,
  onChange,
  text,
  onTextChange,
  clearOnSelect = false,
  allowCreate = true,
  exclude = [],
  placeholder = "Ingredient",
  autoFocus,
  "aria-label": ariaLabel,
}: Props) {
  const qc = useQueryClient();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(value?.name ?? text ?? "");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);

  // follow external changes (row reset, parsed line resolved elsewhere)
  useEffect(() => {
    if (value) setQuery(value.name);
  }, [value]);
  useEffect(() => {
    if (!value && text !== undefined && !focused) setQuery(text);
  }, [text]);

  const trimmed = query.trim();
  const debounced = useDebounced(trimmed, 120);
  const suggest = useQuery({
    queryKey: ["suggest", debounced],
    queryFn: () => get<Suggestion[]>(`/ingredients/suggest${qs({ q: debounced, limit: 8 })}`),
    enabled: open && debounced.length > 0,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const unresolved = !value && trimmed.length > 0 && !focused;
  const check = useQuery({
    queryKey: ["check", trimmed],
    queryFn: () => get<CheckResult>(`/ingredients/check${qs({ name: trimmed })}`),
    enabled: unresolved,
    staleTime: 30_000,
  });

  // typed a known name (or alias) and moved on without picking: just take it
  useEffect(() => {
    if (unresolved && check.data?.exact) choose(check.data.exact);
  }, [unresolved, check.data]);

  const suggestions = (suggest.data ?? []).filter((s) => !exclude.includes(s.ingredient.id));
  const hasExact = suggestions.some((s) => s.kind === "exact");
  const options: Option[] = suggestions.map((s) => ({ type: "suggestion", suggestion: s }));
  if (allowCreate && trimmed && !hasExact && !suggest.isFetching) options.push({ type: "create", name: trimmed });

  function choose(ingredient: Ingredient) {
    onChange(ingredient);
    setError(null);
    setOpen(false);
    if (clearOnSelect) {
      setQuery("");
      onTextChange?.("");
      inputRef.current?.focus();
    } else {
      setQuery(ingredient.name);
      onTextChange?.("");
    }
  }

  async function chooseCorrection(ingredient: Ingredient) {
    const typo = trimmed;
    choose(ingredient);
    if (remember && typo) {
      try {
        await post(`/ingredients/${ingredient.id}/aliases`, { alias: typo });
        qc.invalidateQueries({ queryKey: ["suggest"] });
        qc.invalidateQueries({ queryKey: ["check"] });
      } catch {
        // remembering the spelling is a convenience; the pick itself already worked
      }
    }
  }

  async function create(force: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ ingredient: Ingredient; created: boolean }>("/ingredients", { name: trimmed, force });
      qc.invalidateQueries({ queryKey: ["suggest"] });
      qc.invalidateQueries({ queryKey: ["ingredients"] });
      choose(res.ingredient);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // looks like a misspelling: close the list so the "did you mean" panel shows
        setOpen(false);
        inputRef.current?.blur();
      } else {
        setError(e instanceof Error ? e.message : "Couldn't add that ingredient");
      }
    } finally {
      setBusy(false);
    }
  }

  function pick(option: Option) {
    if (option.type === "suggestion") choose(option.suggestion.ingredient);
    else void create(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const n = options.length;
      if (n) setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : (a - 1 + n) % n));
    } else if (e.key === "Enter") {
      e.preventDefault(); // never submit the surrounding form from here
      if (open && options[active]) pick(options[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && focused && trimmed.length > 0 && (options.length > 0 || !suggest.isFetching);
  const panelSuggestions = check.data && !check.data.exact ? check.data.suggestions : [];

  return (
    <div className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          role="combobox"
          aria-label={ariaLabel ?? placeholder}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={unresolved && !check.data?.exact ? true : undefined}
          aria-activedescendant={showList && options[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={query}
          className={cx(
            inputClass,
            "pr-9",
            unresolved && "underline decoration-danger decoration-wavy decoration-1 underline-offset-4",
            value && !clearOnSelect && "border-ok/40",
          )}
          onChange={(e) => {
            setQuery(e.target.value);
            onTextChange?.(e.target.value);
            setOpen(true);
            setActive(0);
            if (value) onChange(null);
          }}
          onFocus={() => {
            setFocused(true);
            if (trimmed && !value) setOpen(true);
          }}
          onBlur={() => {
            setFocused(false);
            setOpen(false);
          }}
          onKeyDown={onKeyDown}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2">
          {busy || (open && suggest.isFetching) ? (
            <Spinner className="size-4" />
          ) : value && !clearOnSelect ? (
            <Icon name="check" className="size-4 text-ok" />
          ) : null}
        </span>
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border bg-surface py-1 shadow-xl shadow-black/30"
        >
          {options.map((o, i) => (
            <li
              key={o.type === "create" ? "create" : o.suggestion.ingredient.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              aria-label={
                o.type === "suggestion"
                  ? o.suggestion.matched !== o.suggestion.ingredient.canonical_name
                    ? `${o.suggestion.ingredient.name} (${o.suggestion.matched})`
                    : o.suggestion.ingredient.name
                  : `Add “${o.name}” as a new ingredient`
              }
              className={cx(
                "flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm",
                i === active ? "bg-surface-2" : "hover:bg-surface-2",
              )}
              onMouseDown={(e) => e.preventDefault()} // keep focus in the input
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o)}
            >
              {o.type === "suggestion" ? (
                <>
                  <span className="flex-1">
                    {o.suggestion.ingredient.name}
                    {o.suggestion.matched !== o.suggestion.ingredient.canonical_name && (
                      <span className="text-muted"> · {o.suggestion.matched}</span>
                    )}
                  </span>
                  {o.suggestion.kind === "fuzzy" && <span className="text-xs text-warn">similar</span>}
                  {o.suggestion.ingredient.category && (
                    <span className="text-xs text-muted">{o.suggestion.ingredient.category}</span>
                  )}
                </>
              ) : (
                <span className="flex items-center gap-2 text-accent">
                  <Icon name="plus" className="size-4" /> Add “{o.name}” as a new ingredient
                </span>
              )}
            </li>
          ))}
          {options.length === 0 && <li className="px-3 py-3 text-sm text-muted">No matching ingredients</li>}
        </ul>
      )}

      {unresolved && check.data && !check.data.exact && (
        <div className="mt-2 rounded-xl border border-warn/30 bg-warn/5 p-3 text-sm" aria-live="polite">
          <p className="text-muted">
            “<span className="text-text">{trimmed}</span>” isn’t in your ingredient list.
            {panelSuggestions.length > 0 && " Did you mean:"}
          </p>
          {panelSuggestions.length > 0 && (
            <>
              <div className="mt-2 flex flex-wrap gap-2">
                {panelSuggestions.map((s) => (
                  <button
                    key={s.ingredient.id}
                    type="button"
                    className="min-h-9 rounded-lg bg-accent/15 px-3 font-medium text-accent hover:bg-accent/25"
                    onClick={() => void chooseCorrection(s.ingredient)}
                  >
                    {s.ingredient.name}
                  </button>
                ))}
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Remember “{trimmed}” as another spelling
              </label>
            </>
          )}
          {allowCreate && (
            <button
              type="button"
              disabled={busy}
              className="mt-2 text-xs text-muted underline underline-offset-2 hover:text-text"
              onClick={() => void create(true)}
            >
              {panelSuggestions.length ? "No, it's a different ingredient: add it" : `Add “${trimmed}” as a new ingredient`}
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
