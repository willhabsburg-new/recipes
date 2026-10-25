import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";

import { get, qs } from "../api/client";
import { useTags } from "../api/hooks";
import type { RecipeSummary } from "../api/types";
import { Icon } from "../components/Icon";
import { RecipeCard } from "../components/RecipeCard";
import { Button, cx, Empty, ErrorNote, Input, Loading, PageHeader, Select } from "../components/ui";
import { useDebounced } from "../lib/useDebounced";

export function RecipeListPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const tag = params.getAll("tag");
  const sort = params.get("sort") ?? "title";
  const debouncedQ = useDebounced(q, 200);
  const tags = useTags();

  const recipes = useQuery({
    queryKey: ["recipes", debouncedQ, tag, sort],
    queryFn: () => get<RecipeSummary[]>(`/recipes${qs({ q: debouncedQ, tag, sort })}`),
    placeholderData: (prev) => prev,
  });

  function update(next: Record<string, string | string[]>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      p.delete(k);
      (Array.isArray(v) ? v : [v]).filter(Boolean).forEach((x) => p.append(k, x));
    }
    setParams(p, { replace: true });
  }

  const filtering = Boolean(q || tag.length);

  return (
    <div>
      <PageHeader title="Recipes">
        <Link to="/recipes/new" className="hidden md:block">
          <Button variant="primary" icon="plus">New recipe</Button>
        </Link>
      </PageHeader>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-muted" />
          <Input
            type="search"
            placeholder="Search titles, instructions, ingredients…"
            value={q}
            onChange={(e) => update({ q: e.target.value })}
            className="pl-10"
            aria-label="Search recipes"
          />
        </div>
        <Select value={sort} onChange={(e) => update({ sort: e.target.value })} className="max-w-32" aria-label="Sort">
          <option value="title">A–Z</option>
          <option value="recent">Recent</option>
        </Select>
      </div>

      {tags.data && tags.data.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {tags.data.map((t) => {
            const on = tag.includes(t.name);
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => update({ tag: on ? tag.filter((x) => x !== t.name) : [...tag, t.name] })}
                className={cx(
                  "min-h-9 shrink-0 rounded-full border px-3 text-sm",
                  on ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:text-text",
                )}
              >
                {t.name} <span className="opacity-60">{t.count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-5">
        {recipes.isPending ? (
          <Loading />
        ) : recipes.error ? (
          <ErrorNote error={recipes.error} />
        ) : recipes.data.length === 0 ? (
          filtering ? (
            <Empty icon="search" title="Nothing matches">Try a different word or clear the tag filters.</Empty>
          ) : (
            <Empty icon="book" title="No recipes yet">
              <Link to="/recipes/new" className="text-accent underline">Add your first recipe</Link>. Paste in an
              ingredient list and it'll be matched to your ingredients automatically.
            </Empty>
          )
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {recipes.data.map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
