import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Ingredient } from "../api/types";
import { IngredientInput } from "../components/IngredientInput";

const broccoli: Ingredient = { id: 1, name: "broccoli", canonical_name: "broccoli", category: "produce", is_staple: false };
const broccolini: Ingredient = { id: 2, name: "broccolini", canonical_name: "broccolini", category: "produce", is_staple: false };
const tomato: Ingredient = { id: 3, name: "tomato", canonical_name: "tomato", category: "produce", is_staple: false };

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

/** A tiny fake of the ingredient endpoints. */
function fakeApi(url: string, init?: RequestInit) {
  const u = new URL(url, "http://test");
  const q = (u.searchParams.get("q") ?? u.searchParams.get("name") ?? "").toLowerCase();
  if (u.pathname === "/api/ingredients/suggest") {
    if (q.startsWith("broc")) {
      return json([
        { ingredient: broccoli, matched: "broccoli", kind: q === "broccoli" ? "exact" : "fuzzy", score: 93 },
        { ingredient: broccolini, matched: "broccolini", kind: "fuzzy", score: 82 },
      ]);
    }
    if (q.startsWith("tom")) return json([{ ingredient: tomato, matched: "tomato", kind: q.startsWith("tomato") ? "exact" : "prefix", score: 1000 }]);
    return json([]);
  }
  if (u.pathname === "/api/ingredients/check") {
    if (q === "tomatoes") return json({ normalized: "tomato", exact: tomato, suggestions: [] });
    return json({
      normalized: q,
      exact: null,
      suggestions: q.startsWith("broc") ? [{ ingredient: broccoli, matched: "broccoli", kind: "fuzzy", score: 87.5 }] : [],
    });
  }
  if (u.pathname === "/api/ingredients" && init?.method === "POST") {
    const body = JSON.parse(String(init.body));
    if (!body.force && body.name.startsWith("broc")) return json([{ ingredient: broccoli }], 409);
    return json({ ingredient: { id: 99, name: body.name, canonical_name: body.name, category: null, is_staple: false }, created: true }, 201);
  }
  if (u.pathname.endsWith("/aliases")) return json({}, 201);
  return json({ detail: "not found" }, 404);
}

function Harness({ onPick }: { onPick: (i: Ingredient | null) => void }) {
  const [value, setValue] = useState<Ingredient | null>(null);
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <IngredientInput value={value} onChange={(i) => { setValue(i); onPick(i); }} />
      <button type="button">elsewhere</button>
    </QueryClientProvider>
  );
}

describe("IngredientInput", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn((url: string, init?: RequestInit) => fakeApi(url, init));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("suggests the right spelling while typing a misspelling", async () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    await userEvent.type(screen.getByRole("combobox"), "brocolli");
    const option = await screen.findByRole("option", { name: "broccoli" });
    await userEvent.click(option);
    expect(onPick).toHaveBeenLastCalledWith(broccoli);
    expect(screen.getByRole("combobox")).toHaveValue("broccoli");
  });

  it("selects with the keyboard", async () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    await userEvent.type(screen.getByRole("combobox"), "tom");
    await screen.findByRole("option", { name: "tomato" });
    await userEvent.keyboard("{Enter}");
    expect(onPick).toHaveBeenLastCalledWith(tomato);
  });

  it("asks 'did you mean' when leaving a misspelling unresolved, and can remember the spelling", async () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    await userEvent.type(screen.getByRole("combobox"), "brocolli");
    await userEvent.click(screen.getByRole("button", { name: "elsewhere" }));

    expect(await screen.findByText(/isn’t in your ingredient list/)).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-invalid", "true");
    await userEvent.click(screen.getByRole("button", { name: "broccoli" }));

    expect(onPick).toHaveBeenLastCalledWith(broccoli);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/ingredients/1/aliases", expect.objectContaining({ method: "POST" })),
    );
  });

  it("resolves a known plural on blur without asking", async () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    await userEvent.type(screen.getByRole("combobox"), "tomatoes");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "elsewhere" }));
    await waitFor(() => expect(onPick).toHaveBeenLastCalledWith(tomato));
  });

  it("creates a genuinely new ingredient after confirmation", async () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    await userEvent.type(screen.getByRole("combobox"), "brocolli");
    await userEvent.click(screen.getByRole("button", { name: "elsewhere" }));
    await userEvent.click(await screen.findByRole("button", { name: /different ingredient/ }));
    await waitFor(() => expect(onPick).toHaveBeenLastCalledWith(expect.objectContaining({ id: 99, name: "brocolli" })));
  });
});
