import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import type { RecipeSummary } from "../api/types";
import { formatMinutes } from "../lib/quantity";
import { Icon } from "./Icon";

export function RecipeCard({ recipe, children }: { recipe: RecipeSummary; children?: ReactNode }) {
  return (
    <Link
      to={`/recipes/${recipe.id}`}
      className="group flex overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent"
    >
      <div className="relative w-24 shrink-0 bg-surface-2 sm:w-32">
        {recipe.photo_url ? (
          <img src={recipe.photo_url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted/40">
            <Icon name="book" className="size-8" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 p-3.5">
        <h3 className="truncate font-semibold group-hover:text-accent">{recipe.title}</h3>
        {recipe.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{recipe.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {recipe.total_minutes ? (
            <span className="flex items-center gap-1">
              <Icon name="clock" className="size-3.5" />
              {formatMinutes(recipe.total_minutes)}
            </span>
          ) : null}
          <span>{recipe.ingredient_count} ingredients</span>
          {recipe.tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded-md bg-surface-2 px-1.5 py-0.5">
              {t}
            </span>
          ))}
        </div>
        {children}
      </div>
    </Link>
  );
}
