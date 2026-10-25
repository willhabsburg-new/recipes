import { lazy, Suspense } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "./api/hooks";
import { Icon, type IconName } from "./components/Icon";
import { cx, ErrorNote, Loading } from "./components/ui";
import { IngredientsPage } from "./pages/IngredientsPage";
import { LoginPage, SetupPage } from "./pages/LoginPage";
import { RecipeListPage } from "./pages/RecipeListPage";
import { SearchPage } from "./pages/SearchPage";
import { SettingsPage } from "./pages/SettingsPage";

// the heavier pages (drag-and-drop editor, markdown renderer) load on demand
const RecipeEditPage = lazy(() => import("./pages/RecipeEditPage").then((m) => ({ default: m.RecipeEditPage })));
const RecipeViewPage = lazy(() => import("./pages/RecipeViewPage").then((m) => ({ default: m.RecipeViewPage })));

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: "/", label: "Cook", icon: "search", end: true },
  { to: "/recipes", label: "Recipes", icon: "book" },
  { to: "/recipes/new", label: "Add", icon: "plus" },
  { to: "/ingredients", label: "Ingredients", icon: "carrot" },
  { to: "/settings", label: "Settings", icon: "sliders" },
];

export default function App() {
  const auth = useAuth();

  if (auth.isPending) return <Loading />;
  if (auth.error) {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorNote error={auth.error} />
      </div>
    );
  }
  if (auth.data.needs_setup) return <SetupPage />;
  if (!auth.data.user) return <LoginPage />;

  return (
    <div className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-20 hidden border-b border-border bg-bg/90 backdrop-blur md:block">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-6 px-6">
          <span className="flex items-center gap-2 font-bold">
            <img src="/favicon-48.png" alt="" className="size-7 rounded-lg" />
            Will's Recipes
          </span>
          <nav className="flex gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end ?? n.to === "/recipes"}
                className={({ isActive }) =>
                  cx(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-sm",
                    isActive ? "bg-surface-2 text-accent" : "text-muted hover:text-text",
                  )
                }
              >
                <Icon name={n.icon} className="size-4" />
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-8 md:px-6 md:pt-8">
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<SearchPage />} />
            <Route path="/recipes" element={<RecipeListPage />} />
            <Route path="/recipes/new" element={<RecipeEditPage />} />
            <Route path="/recipes/:id" element={<RecipeViewPage />} />
            <Route path="/recipes/:id/edit" element={<RecipeEditPage />} />
            <Route path="/ingredients" element={<IngredientsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end ?? n.to === "/recipes"}
              className={({ isActive }) =>
                cx(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px]",
                  isActive ? "text-accent" : "text-muted",
                )
              }
            >
              {n.to === "/recipes/new" ? (
                <span className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-fg">
                  <Icon name="plus" />
                </span>
              ) : (
                <>
                  <Icon name={n.icon} className="size-6" />
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
