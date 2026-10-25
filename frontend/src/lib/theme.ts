export type ThemeChoice = "dark" | "light" | "system";

export function getThemeChoice(): ThemeChoice {
  try {
    const t = localStorage.getItem("theme");
    if (t === "light" || t === "system") return t;
  } catch {
    // storage unavailable (private mode); fall through to the default
  }
  return "dark";
}

export function applyTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem("theme", choice);
  } catch {
    // not persisted, but still applied for this visit
  }
  const resolved =
    choice === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : choice;
  document.documentElement.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "light" ? "#f6f5f2" : "#16181d");
}
