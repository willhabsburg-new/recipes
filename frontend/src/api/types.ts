export interface User {
  id: number;
  name: string;
  email: string;
  is_admin: boolean;
}

export interface AuthStatus {
  needs_setup: boolean;
  user: User | null;
}

export interface Ingredient {
  id: number;
  name: string;
  canonical_name: string;
  category: string | null;
  is_staple: boolean;
}

export interface IngredientDetail extends Ingredient {
  aliases: { id: number; alias: string }[];
  recipe_count: number;
}

export interface Suggestion {
  ingredient: Ingredient;
  matched: string;
  kind: "exact" | "prefix" | "fuzzy";
  score: number;
}

export interface CheckResult {
  normalized: string;
  exact: Ingredient | null;
  suggestions: Suggestion[];
}

export interface ParsedLine {
  raw: string;
  quantity: number | null;
  unit: string | null;
  name: string;
  note: string;
  optional: boolean;
  ingredient: Ingredient | null;
  suggestions: Suggestion[];
}

export interface DuplicatePair {
  a: Ingredient;
  b: Ingredient;
  score: number;
}

export interface RecipeLine {
  id: number;
  ingredient: Ingredient;
  quantity: number | null;
  unit: string | null;
  note: string;
  optional: boolean;
}

export interface RecipeSummary {
  id: number;
  title: string;
  description: string;
  servings: number | null;
  total_minutes: number | null;
  photo_url: string | null;
  tags: string[];
  ingredient_count: number;
  updated_at: string;
}

export interface Recipe extends RecipeSummary {
  instructions: string;
  prep_minutes: number | null;
  cook_minutes: number | null;
  source_url: string | null;
  created_by: string | null;
  lines: RecipeLine[];
}

export interface RecipeInput {
  title: string;
  description: string;
  instructions: string;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  source_url: string | null;
  tags: string[];
  lines: {
    ingredient_id: number;
    quantity: number | null;
    unit: string | null;
    note: string;
    optional: boolean;
  }[];
}

export interface Tag {
  id: number;
  name: string;
  count: number;
}

export interface SearchResult {
  recipe: RecipeSummary;
  required: number;
  matched: number;
  missing: Ingredient[];
}

export interface Units {
  units: string[];
  categories: string[];
}
