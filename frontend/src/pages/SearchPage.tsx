import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { post } from "../api/client";
import { useTags } from "../api/hooks";
import type { Ingredient, SearchResult } from "../api/types";
import { Icon } from "../components/Icon";
import { IngredientInput } from "../components/IngredientInput";
import { RecipeCard } from "../components/RecipeCard";
import { Button, Card, cx, Empty, ErrorNote, Loading, PageHeader, Select, Toggle } from "../components/ui";

interface PantryItem {
  ingredient: Ingredient;
  mustUse: boolean;
}

const STORAGE_KEY = "pantry";

function loadPantry(): PantryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PantryItem[]) : [];
  } catch {
    return [];
  }
}

const GROUPS = [
  { title: "Ready to cook", test: (n: number) => n === 0 },
  { title: "Missing 1 ingredient", test: (n: number) => n === 1 },
  { title: "Missing 2 ingredients", test: (n: number) => n === 2 },
  { title: "Missing 3 or more", test: (n: number) => n >= 3 },
];

export function SearchPage() {
  const [pantry, setPantry] = useState<PantryItem[]>(loadPantry);
  const [ignoreStaples, setIgnoreStaples] = useState(true);
  const [maxMissing, setMaxMissing] = useState(2);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const tags = useTags();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pantry));
    } catch {
      // the list just won't survive a reload
    }
  }, [pantry]);

  const have = pantry.map((p) => p.ingredient.id);
  const mustUse = pantry.filter((p) => p.mustUse).map((p) => p.ingredient.id);
  const search = useQuery({
    queryKey: ["search", have, mustUse, ignoreStaples, maxMissing, tagIds],
    queryFn: () =>
      post<SearchResult[]>("/search", {
        have,
        must_use: mustUse,
        ignore_staples: ignoreStaples,
        max_missing: maxMissing,
        tag_ids: tagIds,
      }),
    enabled: have.length > 0,
    placeholderData: (prev) => prev,
  });

  function add(ingredient: Ingredient | null) {
    if (ingredient && !pantry.some((p) => p.ingredient.id === ingredient.id)) {
      setPantry([...pantry, { ingredient, mustUse: false }]);
    }
  }

  const results = have.length ? search.data ?? [] : [];

  return (
    <div>
      <PageHeader title="What can I cook?" />

      <Card className="p-4">
        <p className="mb-2 text-sm font-medium text-muted">Ingredients you have or want to use</p>
        <IngredientInput
          value={null}
          onChange={add}
          clearOnSelect
          allowCreate={false}
          exclude={have}
          placeholder="Type an ingredient, e.g. broccoli"
          aria-label="Add an ingredient you have"
        />

        {pantry.length > 0 && (
          <>
            <ul className="mt-3 flex flex-wrap gap-2">
              {pantry.map((p) => (
                <li
                  key={p.ingredient.id}
                  className={cx(
                    "flex items-center rounded-full border pl-3 text-sm",
                    p.mustUse ? "border-accent bg-accent/15 text-accent" : "border-border bg-surface-2",
                  )}
                >
                  {p.ingredient.name}
                  <button
                    type="button"
                    className="flex size-9 items-center justify-center"
                    aria-label={p.mustUse ? `Don't require ${p.ingredient.name}` : `Must use ${p.ingredient.name}`}
                    title="Must use"
                    aria-pressed={p.mustUse}
                    onClick={() =>
                      setPantry(pantry.map((q) => (q === p ? { ...q, mustUse: !q.mustUse } : q)))
                    }
                  >
                    <Icon name="star" filled={p.mustUse} className={cx("size-4", !p.mustUse && "text-muted")} />
                  </button>
                  <button
                    type="button"
                    className="-ml-1 flex size-9 items-center justify-center text-muted hover:text-text"
                    aria-label={`Remove ${p.ingredient.name}`}
                    onClick={() => setPantry(pantry.filter((q) => q !== p))}
                  >
                    <Icon name="x" className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">
              Tap <Icon name="star" className="inline size-3" /> on an ingredient to only show recipes that use it.
            </p>
          </>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border pt-3">
          <Toggle checked={ignoreStaples} onChange={setIgnoreStaples} label="Assume I have staples (salt, oil…)" />
          <label className="flex items-center gap-2 text-sm">
            Show recipes missing up to
            <Select value={maxMissing} onChange={(e) => setMaxMissing(Number(e.target.value))} className="max-w-20">
              {[0, 1, 2, 3, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
          </label>
          {pantry.length > 0 && (
            <Button variant="ghost" className="ml-auto" onClick={() => setPantry([])}>
              Clear all
            </Button>
          )}
        </div>

        {tags.data && tags.data.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {tags.data.map((t) => {
              const on = tagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTagIds(on ? tagIds.filter((x) => x !== t.id) : [...tagIds, t.id])}
                  className={cx(
                    "min-h-9 rounded-full border px-3 text-sm",
                    on ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:text-text",
                  )}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <div className="mt-6">
        {have.length === 0 ? (
          <Empty icon="carrot" title="Start with what's in the kitchen">
            Add a few ingredients and you'll see recipes you can make now, and ones that are only an
            ingredient or two away.
          </Empty>
        ) : search.isPending ? (
          <Loading />
        ) : search.error ? (
          <ErrorNote error={search.error} />
        ) : results.length === 0 ? (
          <Empty icon="search" title="No matching recipes">
            Try adding more ingredients, allowing more missing ones, or{" "}
            <Link to="/recipes/new" className="text-accent underline">add a recipe</Link>.
          </Empty>
        ) : (
          GROUPS.map((g) => {
            const items = results.filter((r) => g.test(r.missing.length));
            if (!items.length) return null;
            return (
              <section key={g.title} className="mb-6">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-muted uppercase">
                  {g.title}
                  <span className="rounded-full bg-surface-2 px-2 text-xs">{items.length}</span>
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {items.map((r) => (
                    <RecipeCard key={r.recipe.id} recipe={r.recipe}>
                      <div className="mt-2.5">
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className={cx("h-full rounded-full", r.missing.length ? "bg-warn" : "bg-ok")}
                            style={{ width: `${r.required ? (r.matched / r.required) * 100 : 100}%` }}
                          />
                        </div>
                        <p className="mt-1.5 text-xs text-muted">
                          You have {r.matched} of {r.required}
                          {r.missing.length > 0 && (
                            <>
                              {" · "}need <span className="text-text">{r.missing.map((m) => m.name).join(", ")}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </RecipeCard>
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
