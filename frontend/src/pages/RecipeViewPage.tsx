import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Link, useParams } from "react-router-dom";

import { get } from "../api/client";
import type { Recipe } from "../api/types";
import { Icon } from "../components/Icon";
import { Button, cx, ErrorNote, IconButton, Loading } from "../components/ui";
import { formatMinutes, formatQuantity, formatUnit } from "../lib/quantity";

/** Keeps the screen on while cooking, where supported (re-acquired when the tab comes back). */
function useWakeLock(enabled: boolean) {
  const lock = useRef<WakeLockSentinel | null>(null);
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let cancelled = false;
    const acquire = async () => {
      try {
        const l = await navigator.wakeLock.request("screen");
        if (cancelled) l.release();
        else lock.current = l;
      } catch {
        // denied (e.g. low battery); cooking mode still works, the screen may just dim
      }
    };
    const onVisible = () => document.visibilityState === "visible" && acquire();
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock.current?.release();
      lock.current = null;
    };
  }, [enabled]);
}

export function RecipeViewPage() {
  const { id } = useParams();
  const recipe = useQuery({ queryKey: ["recipe", id], queryFn: () => get<Recipe>(`/recipes/${id}`) });
  const [servings, setServings] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [cooking, setCooking] = useState(false);
  useWakeLock(cooking);

  useEffect(() => {
    if (recipe.data) setServings(recipe.data.servings);
  }, [recipe.data]);

  if (recipe.isPending) return <Loading />;
  if (recipe.error) return <ErrorNote error={recipe.error} />;
  const r = recipe.data;
  const factor = r.servings && servings ? servings / r.servings : 1;

  function toggle(lineId: number) {
    const next = new Set(checked);
    if (next.has(lineId)) next.delete(lineId);
    else next.add(lineId);
    setChecked(next);
  }

  return (
    <article className={cx(cooking && "text-lg")}>
      <div className="mb-4 flex items-center justify-between">
        <Link to="/recipes" className="-ml-2 flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm text-muted hover:text-text">
          <Icon name="back" className="size-4" /> Recipes
        </Link>
        <div className="flex gap-2">
          <Button variant={cooking ? "primary" : "secondary"} icon="flame" onClick={() => setCooking(!cooking)}
            aria-pressed={cooking}>
            {cooking ? "Cooking" : "Cook mode"}
          </Button>
          <Link to={`/recipes/${r.id}/edit`}>
            <Button icon="pencil">Edit</Button>
          </Link>
        </div>
      </div>

      {r.photo_url && (
        <img src={r.photo_url} alt="" className="mb-5 aspect-[16/9] w-full rounded-2xl object-cover" />
      )}

      <h1 className="text-3xl font-bold tracking-tight">{r.title}</h1>
      {r.description && <p className="mt-2 text-muted">{r.description}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
        {r.prep_minutes ? <span>Prep {formatMinutes(r.prep_minutes)}</span> : null}
        {r.cook_minutes ? <span>Cook {formatMinutes(r.cook_minutes)}</span> : null}
        {r.total_minutes ? (
          <span className="flex items-center gap-1 text-text">
            <Icon name="clock" className="size-4" /> {formatMinutes(r.total_minutes)}
          </span>
        ) : null}
        {r.tags.map((t) => (
          <Link key={t} to={`/recipes?tag=${encodeURIComponent(t)}`} className="rounded-md bg-surface-2 px-2 py-0.5 hover:text-text">
            {t}
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Ingredients</h2>
            {r.servings && servings && (
              <div className="flex items-center rounded-xl bg-surface-2 text-sm">
                <IconButton icon="minus" label="Fewer servings" disabled={servings <= 1}
                  onClick={() => setServings(Math.max(1, servings - 1))} />
                <span className="min-w-20 text-center">
                  {servings} serving{servings === 1 ? "" : "s"}
                </span>
                <IconButton icon="plus" label="More servings" onClick={() => setServings(servings + 1)} />
              </div>
            )}
          </div>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {r.lines.map((ln) => {
              const qty = ln.quantity !== null ? ln.quantity * factor : null;
              const done = checked.has(ln.id);
              return (
                <li key={ln.id}>
                  <button
                    type="button"
                    onClick={() => toggle(ln.id)}
                    aria-pressed={done}
                    className="flex min-h-12 w-full items-start gap-3 px-4 py-3 text-left"
                  >
                    <span
                      className={cx(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border",
                        done ? "border-ok bg-ok text-bg" : "border-border",
                      )}
                    >
                      {done && <Icon name="check" className="size-3.5" />}
                    </span>
                    <span className={cx(done && "text-muted line-through")}>
                      {qty !== null && <strong className="font-semibold">{formatQuantity(qty)} </strong>}
                      {ln.unit && <span>{formatUnit(ln.unit, qty)} </span>}
                      {ln.ingredient.name}
                      {ln.note && <span className="text-muted">, {ln.note}</span>}
                      {ln.optional && <span className="text-muted"> (optional)</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Instructions</h2>
          {r.instructions ? (
            <div className="prose-recipe leading-relaxed">
              <Markdown>{r.instructions}</Markdown>
            </div>
          ) : (
            <p className="text-muted">No instructions yet.</p>
          )}
          {r.source_url && (
            <a href={r.source_url} target="_blank" rel="noreferrer"
              className="mt-6 inline-flex items-center gap-1.5 text-sm text-accent underline">
              Original recipe <Icon name="external" className="size-3.5" />
            </a>
          )}
          {r.created_by && <p className="mt-4 text-xs text-muted">Added by {r.created_by}</p>}
        </section>
      </div>
    </article>
  );
}
