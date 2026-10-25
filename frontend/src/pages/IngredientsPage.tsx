import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { del, get, patch, post, qs } from "../api/client";
import { useMe, useUnits } from "../api/hooks";
import type { DuplicatePair, Ingredient, IngredientDetail } from "../api/types";
import { Icon } from "../components/Icon";
import { IngredientInput } from "../components/IngredientInput";
import { Button, Card, cx, Empty, ErrorNote, IconButton, Input, Loading, PageHeader, Select, Toggle } from "../components/ui";
import { useDebounced } from "../lib/useDebounced";

export function IngredientsPage() {
  const me = useMe();
  const [tab, setTab] = useState<"all" | "duplicates">("all");
  const dupes = useQuery({
    queryKey: ["ingredients", "duplicates"],
    queryFn: () => get<DuplicatePair[]>("/ingredients/duplicates"),
    enabled: me.is_admin,
  });

  return (
    <div>
      <PageHeader title="Ingredients" />
      {me.is_admin && (
        <div className="mb-4 inline-flex rounded-xl bg-surface-2 p-1" role="tablist">
          {(["all", "duplicates"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cx("min-h-10 rounded-lg px-4 text-sm", tab === t ? "bg-surface text-text shadow" : "text-muted")}
            >
              {t === "all" ? "All ingredients" : "Possible duplicates"}
              {t === "duplicates" && dupes.data && dupes.data.length > 0 && (
                <span className="ml-2 rounded-full bg-warn px-1.5 text-xs font-semibold text-accent-fg">{dupes.data.length}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {tab === "all" ? <AllIngredients /> : <Duplicates pairs={dupes} />}
    </div>
  );
}

function useInvalidateIngredients() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["ingredients"] });
    qc.invalidateQueries({ queryKey: ["suggest"] });
    qc.invalidateQueries({ queryKey: ["check"] });
    qc.invalidateQueries({ queryKey: ["recipe"] });
    qc.invalidateQueries({ queryKey: ["recipes"] });
    qc.invalidateQueries({ queryKey: ["search"] });
  };
}

function Duplicates({ pairs }: { pairs: ReturnType<typeof useQuery<DuplicatePair[]>> }) {
  const invalidate = useInvalidateIngredients();
  const act = useMutation({
    mutationFn: (a: { kind: "merge"; from: Ingredient; into: Ingredient } | { kind: "dismiss"; a: Ingredient; b: Ingredient }) =>
      a.kind === "merge"
        ? post(`/ingredients/${a.from.id}/merge`, { into_id: a.into.id })
        : post("/ingredients/duplicates/dismiss", { a_id: a.a.id, b_id: a.b.id }),
    onSuccess: invalidate,
  });

  if (pairs.isPending) return <Loading />;
  if (pairs.error) return <ErrorNote error={pairs.error} />;
  if (!pairs.data.length) {
    return (
      <Empty icon="check" title="No likely duplicates">
        Ingredients with suspiciously similar names (like “brocolli” and “broccoli”) show up here so you can merge them.
      </Empty>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Merging moves every recipe to the ingredient you keep. The other name keeps working as an alternative spelling.
      </p>
      <ErrorNote error={act.error} />
      {pairs.data.map(({ a, b, score }) => (
        <Card key={`${a.id}-${b.id}`} className="p-4">
          <div className="flex flex-wrap items-center gap-2 text-lg">
            <strong>{a.name}</strong>
            <span className="text-sm text-muted">and</span>
            <strong>{b.name}</strong>
            <span className="ml-auto text-xs text-muted">{Math.round(score)}% similar</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button icon="merge" disabled={act.isPending} onClick={() => act.mutate({ kind: "merge", from: b, into: a })}>
              Keep “{a.name}”
            </Button>
            <Button icon="merge" disabled={act.isPending} onClick={() => act.mutate({ kind: "merge", from: a, into: b })}>
              Keep “{b.name}”
            </Button>
            <Button variant="ghost" disabled={act.isPending} onClick={() => act.mutate({ kind: "dismiss", a, b })}>
              They're different
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function AllIngredients() {
  const [q, setQ] = useState("");
  const [usedOnly, setUsedOnly] = useState(true);
  const [open, setOpen] = useState<number | null>(null);
  const debounced = useDebounced(q, 200);
  const list = useQuery({
    queryKey: ["ingredients", "list", debounced, usedOnly],
    queryFn: () => get<IngredientDetail[]>(`/ingredients${qs({ q: debounced, used_only: usedOnly })}`),
    placeholderData: (prev) => prev,
  });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="relative min-w-0 flex-1 basis-60">
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-muted" />
          <Input type="search" placeholder="Filter ingredients" value={q} onChange={(e) => setQ(e.target.value)}
            className="pl-10" aria-label="Filter ingredients" />
        </div>
        <Toggle checked={usedOnly} onChange={setUsedOnly} label="Only ones used in recipes" />
      </div>

      <div className="mt-4">
        {list.isPending ? (
          <Loading />
        ) : list.error ? (
          <ErrorNote error={list.error} />
        ) : list.data.length === 0 ? (
          <Empty icon="carrot" title={usedOnly && !q ? "No ingredients in use yet" : "No matches"}>
            {usedOnly && "Turn off “Only ones used in recipes” to browse the full starter list."}
          </Empty>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {list.data.map((ing) => (
              <li key={ing.id}>
                <button
                  type="button"
                  className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left"
                  aria-expanded={open === ing.id}
                  onClick={() => setOpen(open === ing.id ? null : ing.id)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{ing.name}</span>
                    {ing.is_staple && <span className="ml-2 rounded bg-surface-2 px-1.5 text-xs text-muted">staple</span>}
                    {ing.aliases.length > 0 && (
                      <span className="block truncate text-xs text-muted">also: {ing.aliases.map((a) => a.alias).join(", ")}</span>
                    )}
                  </span>
                  <span className="text-xs text-muted">{ing.category}</span>
                  <span className="w-16 text-right text-xs text-muted">
                    {ing.recipe_count} recipe{ing.recipe_count === 1 ? "" : "s"}
                  </span>
                  <Icon name="chevronDown" className={cx("size-4 text-muted transition-transform", open === ing.id && "rotate-180")} />
                </button>
                {open === ing.id && <IngredientEditor ingredient={ing} onGone={() => setOpen(null)} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function IngredientEditor({ ingredient, onGone }: { ingredient: IngredientDetail; onGone: () => void }) {
  const me = useMe();
  const units = useUnits();
  const invalidate = useInvalidateIngredients();
  const [name, setName] = useState(ingredient.name);
  const [alias, setAlias] = useState("");
  const [mergeInto, setMergeInto] = useState<Ingredient | null>(null);

  const run = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: invalidate,
  });
  const base = `/ingredients/${ingredient.id}`;

  return (
    <div className="space-y-4 border-t border-border bg-surface-2/40 px-4 py-4">
      <ErrorNote error={run.error} />

      {me.is_admin && (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" spellCheck />
            <Button disabled={!name.trim() || name === ingredient.name || run.isPending}
              onClick={() => run.mutate(() => patch(base, { name }))}>
              Rename
            </Button>
          </div>
          <Select
            aria-label="Category"
            value={ingredient.category ?? ""}
            onChange={(e) => run.mutate(() => patch(base, { category: e.target.value || null }))}
          >
            <option value="">No category</option>
            {units.data?.categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </div>
      )}

      {me.is_admin && (
        <Toggle
          checked={ingredient.is_staple}
          onChange={(v) => run.mutate(() => patch(base, { is_staple: v }))}
          label="Pantry staple (assumed on hand when searching)"
        />
      )}

      <div>
        <p className="mb-2 text-sm text-muted">Other names and spellings</p>
        <div className="flex flex-wrap gap-2">
          {ingredient.aliases.map((a) => (
            <span key={a.id} className="flex items-center rounded-full bg-surface-2 pl-3 text-sm">
              {a.alias}
              {me.is_admin ? (
                <IconButton icon="x" label={`Remove ${a.alias}`} className="size-8"
                  onClick={() => run.mutate(() => del(`/ingredients/aliases/${a.id}`))} />
              ) : (
                <span className="pr-3" />
              )}
            </span>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (alias.trim()) run.mutate(() => post(`${base}/aliases`, { alias }).then(() => setAlias("")));
            }}
          >
            <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="add a name"
              className="min-h-9 w-36 py-1" aria-label="Add another name" />
          </form>
        </div>
      </div>

      {me.is_admin && (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <IngredientInput
            value={mergeInto}
            onChange={setMergeInto}
            allowCreate={false}
            exclude={[ingredient.id]}
            placeholder="Merge into another ingredient…"
          />
          <Button
            icon="merge"
            disabled={!mergeInto || run.isPending}
            onClick={() =>
              mergeInto &&
              confirm(`Merge “${ingredient.name}” into “${mergeInto.name}”? Recipes will use “${mergeInto.name}”.`) &&
              run.mutate(() => post(`${base}/merge`, { into_id: mergeInto.id }).then(onGone))
            }
          >
            Merge
          </Button>
        </div>
      )}

      {me.is_admin && ingredient.recipe_count === 0 && (
        <Button variant="danger" icon="trash" disabled={run.isPending}
          onClick={() => confirm(`Delete “${ingredient.name}”?`) && run.mutate(() => del(base).then(onGone))}>
          Delete ingredient
        </Button>
      )}
    </div>
  );
}
