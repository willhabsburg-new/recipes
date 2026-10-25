import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api, del, get, post, put } from "../api/client";
import { useUnits } from "../api/hooks";
import type { Ingredient, ParsedLine, Recipe, RecipeInput } from "../api/types";
import { Icon } from "../components/Icon";
import { IngredientInput } from "../components/IngredientInput";
import { Button, Card, cx, ErrorNote, Field, IconButton, Input, Loading, PageHeader, Select, Textarea } from "../components/ui";
import { formatQuantity, parseQuantity } from "../lib/quantity";

interface Row {
  key: string;
  ingredient: Ingredient | null;
  text: string;
  quantity: string;
  unit: string;
  note: string;
  optional: boolean;
}

let rowSeq = 0;
const newRow = (init: Partial<Row> = {}): Row => ({
  key: `row-${++rowSeq}`,
  ingredient: null,
  text: "",
  quantity: "",
  unit: "",
  note: "",
  optional: false,
  ...init,
});

const isBlank = (r: Row) => !r.ingredient && !r.text.trim() && !r.quantity.trim() && !r.note.trim();

/** Phone photos are huge; shrink to something sensible before upload. */
async function shrinkImage(file: File, maxSide = 1600): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function RecipeEditPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const units = useUnits();
  const existing = useQuery({
    queryKey: ["recipe", id],
    queryFn: () => get<Recipe>(`/recipes/${id}`),
    enabled: editing,
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [servings, setServings] = useState("");
  const [prep, setPrep] = useState("");
  const [cook, setCook] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [tags, setTags] = useState("");
  const [rows, setRows] = useState<Row[]>(() => [newRow(), newRow(), newRow()]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const loaded = useRef(false);
  const photoPreview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  useEffect(() => {
    const r = existing.data;
    if (!r || loaded.current) return;
    loaded.current = true;
    setTitle(r.title);
    setDescription(r.description);
    setInstructions(r.instructions);
    setServings(r.servings ? String(r.servings) : "");
    setPrep(r.prep_minutes ? String(r.prep_minutes) : "");
    setCook(r.cook_minutes ? String(r.cook_minutes) : "");
    setSourceUrl(r.source_url ?? "");
    setTags(r.tags.join(", "));
    setRows([
      ...r.lines.map((ln) =>
        newRow({
          ingredient: ln.ingredient,
          quantity: formatQuantity(ln.quantity),
          unit: ln.unit ?? "",
          note: ln.note,
          optional: ln.optional,
        }),
      ),
      newRow(),
    ]);
  }, [existing.data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((rs) => {
      const next = rs.map((r) => (r.key === key ? { ...r, ...patch } : r));
      // always keep one empty row at the end to type into
      return isBlank(next[next.length - 1]) ? next : [...next, newRow()];
    });
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    setRows((rs) => {
      const from = rs.findIndex((r) => r.key === e.active.id);
      const to = rs.findIndex((r) => r.key === e.over!.id);
      return arrayMove(rs, from, to);
    });
  }

  async function parsePaste() {
    setParsing(true);
    setError(null);
    try {
      const parsed = await post<ParsedLine[]>("/ingredients/parse", { text: pasteText });
      const added = parsed.map((p) =>
        newRow({
          ingredient: p.ingredient,
          text: p.ingredient ? "" : p.name,
          quantity: formatQuantity(p.quantity),
          unit: p.unit ?? "",
          note: p.note,
          optional: p.optional,
        }),
      );
      setRows((rs) => [...rs.filter((r) => !isBlank(r)), ...added, newRow()]);
      setPasteText("");
      setPasteOpen(false);
    } catch (e) {
      setError(e);
    } finally {
      setParsing(false);
    }
  }

  function buildInput(): RecipeInput {
    if (!title.trim()) throw new Error("Give the recipe a title.");
    const used = rows.filter((r) => !isBlank(r));
    const unresolved = used.filter((r) => !r.ingredient);
    if (unresolved.length) {
      throw new Error(
        `Choose or add ${unresolved.length === 1 ? "the highlighted ingredient" : `the ${unresolved.length} highlighted ingredients`} before saving.`,
      );
    }
    const toInt = (s: string, label: string) => {
      if (!s.trim()) return null;
      const n = Number(s);
      if (!Number.isInteger(n) || n < 0) throw new Error(`${label} should be a whole number.`);
      return n;
    };
    return {
      title: title.trim(),
      description: description.trim(),
      instructions,
      servings: toInt(servings, "Servings") || null,
      prep_minutes: toInt(prep, "Prep time"),
      cook_minutes: toInt(cook, "Cook time"),
      source_url: sourceUrl.trim() || null,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      lines: used.map((r) => {
        const quantity = parseQuantity(r.quantity);
        if (quantity !== null && Number.isNaN(quantity)) {
          throw new Error(`“${r.quantity}” isn't a quantity (for ${r.ingredient!.name}). Try 2, 1.5 or 1 1/2.`);
        }
        return {
          ingredient_id: r.ingredient!.id,
          quantity,
          unit: r.unit || null,
          note: r.note.trim(),
          optional: r.optional,
        };
      }),
    };
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    let body: RecipeInput;
    try {
      body = buildInput();
    } catch (err) {
      setError(err);
      return;
    }
    setSaving(true);
    try {
      const saved = editing ? await put<Recipe>(`/recipes/${id}`, body) : await post<Recipe>("/recipes", body);
      if (removePhoto && !photo && saved.photo_url) await del(`/recipes/${saved.id}/photo`);
      if (photo) {
        const form = new FormData();
        const blob = await shrinkImage(photo);
        form.append("file", blob, blob === photo ? photo.name : "photo.jpg");
        await api(`/recipes/${saved.id}/photo`, { method: "POST", body: form });
      }
      await qc.invalidateQueries({ queryKey: ["recipes"] });
      await qc.invalidateQueries({ queryKey: ["recipe", String(saved.id)] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["search"] });
      navigate(`/recipes/${saved.id}`, { replace: true });
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete “${title}”? This can't be undone.`)) return;
    try {
      await del(`/recipes/${id}`);
      qc.invalidateQueries({ queryKey: ["recipes"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["search"] });
      navigate("/recipes", { replace: true });
    } catch (err) {
      setError(err);
    }
  }

  if (editing && existing.isPending) return <Loading />;
  if (editing && existing.error) return <ErrorNote error={existing.error} />;

  const currentPhoto = !removePhoto && existing.data?.photo_url;
  const previewUrl = photoPreview ?? (currentPhoto || null);

  return (
    <form onSubmit={save} noValidate>
      <PageHeader title={editing ? "Edit recipe" : "New recipe"}>
        <Link to={editing ? `/recipes/${id}` : "/recipes"}>
          <Button variant="ghost">Cancel</Button>
        </Link>
      </PageHeader>

      <div className="space-y-5">
        <Card className="space-y-4 p-4">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} spellCheck required
              placeholder="Grandma's roasted broccoli" autoFocus={!editing} />
          </Field>
          <Field label="Short description">
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} spellCheck />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Servings">
              <Input inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value)} />
            </Field>
            <Field label="Prep (min)">
              <Input inputMode="numeric" value={prep} onChange={(e) => setPrep(e.target.value)} />
            </Field>
            <Field label="Cook (min)">
              <Input inputMode="numeric" value={cook} onChange={(e) => setCook(e.target.value)} />
            </Field>
          </div>
          <Field label="Tags" hint="Comma separated, e.g. dinner, vegetarian, quick">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} autoCapitalize="none" />
          </Field>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold">Ingredients</h2>
            <Button variant="ghost" icon="clipboard" onClick={() => setPasteOpen(!pasteOpen)}>
              Paste a list
            </Button>
          </div>

          {pasteOpen && (
            <div className="mb-4 rounded-xl bg-surface-2 p-3">
              <Textarea
                rows={6}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"2 cups chopped broccoli\n3 cloves garlic, minced\n1 tbsp soy sauce"}
                className="bg-surface"
                aria-label="Ingredient list to paste"
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setPasteOpen(false)}>Cancel</Button>
                <Button variant="primary" disabled={!pasteText.trim() || parsing} onClick={parsePaste}>
                  {parsing ? "Reading…" : "Add these"}
                </Button>
              </div>
            </div>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-3">
                {rows.map((row, i) => (
                  <IngredientRow
                    key={row.key}
                    row={row}
                    units={units.data?.units ?? []}
                    last={i === rows.length - 1}
                    onChange={(patch) => updateRow(row.key, patch)}
                    onRemove={() => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== row.key) : [newRow()]))}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </Card>

        <Card className="p-4">
          <Field label="Instructions" hint="Markdown works: number steps with 1. 2. 3., use **bold** for emphasis.">
            <Textarea rows={10} value={instructions} onChange={(e) => setInstructions(e.target.value)} spellCheck
              placeholder={"1. Heat the oven to 425°F.\n2. Toss the broccoli with oil and salt.\n3. Roast 20 minutes."} />
          </Field>
        </Card>

        <Card className="space-y-4 p-4">
          <Field label="Photo">
            <div className="flex items-center gap-3">
              {previewUrl ? (
                <img src={previewUrl} alt="" className="size-20 rounded-xl object-cover" />
              ) : (
                <div className="flex size-20 items-center justify-center rounded-xl bg-surface-2 text-muted">
                  <Icon name="camera" className="size-7" />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-surface-2 px-4 text-sm hover:bg-border">
                  {previewUrl ? "Change photo" : "Add photo"}
                  <input type="file" accept="image/*" className="sr-only"
                    onChange={(e) => { setPhoto(e.target.files?.[0] ?? null); setRemovePhoto(false); }} />
                </label>
                {previewUrl && (
                  <Button variant="ghost" onClick={() => { setPhoto(null); setRemovePhoto(true); }}>Remove</Button>
                )}
              </div>
            </div>
          </Field>
          <Field label="Source link">
            <Input type="url" inputMode="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://…" autoCapitalize="none" />
          </Field>
        </Card>

        <ErrorNote error={error} />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={saving} className="flex-1 sm:flex-none sm:px-8">
            {saving ? "Saving…" : "Save recipe"}
          </Button>
          {editing && (
            <Button variant="danger" icon="trash" onClick={remove} className="sm:ml-auto">
              Delete
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

function IngredientRow({
  row,
  units,
  last,
  onChange,
  onRemove,
}: {
  row: Row;
  units: string[];
  last: boolean;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: row.key,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx(
        "rounded-xl border border-border bg-surface p-2 md:border-0 md:p-0",
        isDragging && "relative z-10 opacity-80 shadow-xl",
      )}
    >
      <div className="flex items-start gap-1 md:gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className={cx("flex size-11 shrink-0 touch-none cursor-grab items-center justify-center text-muted", last && "invisible")}
        >
          <Icon name="grip" className="size-4" />
        </button>
        <div className="grid min-w-0 flex-1 grid-cols-[4.5rem_minmax(0,1fr)] gap-2 md:grid-cols-[4.5rem_6.5rem_minmax(0,2fr)_minmax(0,1.3fr)_auto]">
          <Input
            aria-label="Quantity"
            placeholder="Qty"
            inputMode="decimal"
            value={row.quantity}
            onChange={(e) => onChange({ quantity: e.target.value })}
            className="order-2 md:order-none"
          />
          <Select aria-label="Unit" value={row.unit} onChange={(e) => onChange({ unit: e.target.value })}
            className="order-3 md:order-none">
            <option value="">unit</option>
            {units.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </Select>
          <div className="order-1 col-span-2 md:order-none md:col-span-1">
            <IngredientInput
              value={row.ingredient}
              text={row.text}
              onChange={(ingredient) => onChange({ ingredient })}
              onTextChange={(text) => onChange({ text })}
              placeholder={last ? "Add an ingredient…" : "Ingredient"}
            />
          </div>
          <Input
            aria-label="Note"
            placeholder="note: chopped…"
            value={row.note}
            onChange={(e) => onChange({ note: e.target.value })}
            className="order-4 col-span-2 md:order-none md:col-span-1"
          />
          <label className="order-5 col-span-2 flex min-h-11 items-center gap-2 px-1 text-sm text-muted md:order-none md:col-span-1">
            <input type="checkbox" checked={row.optional} onChange={(e) => onChange({ optional: e.target.checked })} />
            optional
          </label>
        </div>
        <IconButton icon="x" label="Remove ingredient" onClick={onRemove} className={cx(last && "invisible")} />
      </div>
    </li>
  );
}
