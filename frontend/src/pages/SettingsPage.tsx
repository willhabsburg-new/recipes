import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { del, get, patch, post } from "../api/client";
import { useMe } from "../api/hooks";
import type { User } from "../api/types";
import { Button, Card, cx, ErrorNote, Field, IconButton, Input, PageHeader, Toggle } from "../components/ui";
import { applyTheme, getThemeChoice, type ThemeChoice } from "../lib/theme";

export function SettingsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const [theme, setTheme] = useState<ThemeChoice>(getThemeChoice);
  const logout = useMutation({
    mutationFn: () => post("/auth/logout"),
    onSuccess: () => qc.resetQueries(),
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Settings">
        <Button variant="ghost" icon="logout" onClick={() => logout.mutate()}>Sign out</Button>
      </PageHeader>

      <Card className="p-4">
        <p className="font-semibold">{me.name}</p>
        <p className="text-sm text-muted">{me.email}{me.is_admin && " · admin"}</p>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold">Appearance</h2>
        <div className="inline-flex rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="Theme">
          {(["dark", "light", "system"] as const).map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={theme === t}
              onClick={() => { setTheme(t); applyTheme(t); }}
              className={cx("min-h-10 rounded-lg px-4 text-sm capitalize", theme === t ? "bg-surface text-text shadow" : "text-muted")}
            >
              {t}
            </button>
          ))}
        </div>
      </Card>

      <ChangePassword />
      {me.is_admin && <Family />}
    </div>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [done, setDone] = useState(false);
  const change = useMutation({
    mutationFn: () => post("/auth/password", { current_password: current, new_password: next }),
    onSuccess: () => { setCurrent(""); setNext(""); setDone(true); },
  });

  return (
    <Card className="p-4">
      <h2 className="mb-3 font-semibold">Change password</h2>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); setDone(false); change.mutate(); }}>
        <Field label="Current password">
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </Field>
        <Field label="New password" hint="At least 8 characters.">
          <Input type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
        </Field>
        <div className="sm:col-span-2">
          <ErrorNote error={change.error} />
          {done && <p className="text-sm text-ok">Password changed.</p>}
          <Button type="submit" className="mt-2" disabled={change.isPending}>Change password</Button>
        </div>
      </form>
    </Card>
  );
}

function Family() {
  const me = useMe();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["users"], queryFn: () => get<User[]>("/users") });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const run = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  function add(e: FormEvent) {
    e.preventDefault();
    run.mutate(() =>
      post("/users", { name, email, password, is_admin: isAdmin }).then(() => {
        setName(""); setEmail(""); setPassword(""); setIsAdmin(false);
      }),
    );
  }

  function resetPassword(u: User) {
    const pw = prompt(`New password for ${u.name} (at least 8 characters):`);
    if (pw) run.mutate(() => patch(`/users/${u.id}`, { password: pw }));
  }

  return (
    <Card className="p-4">
      <h2 className="mb-1 font-semibold">Family members</h2>
      <p className="mb-3 text-sm text-muted">Everyone can add and edit recipes. Admins can also manage people and merge ingredients.</p>
      <ErrorNote error={run.error} />
      <ul className="mb-4 divide-y divide-border">
        {users.data?.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{u.name}</span>
              <span className="block text-xs text-muted">{u.email}</span>
            </span>
            <Toggle
              checked={u.is_admin}
              onChange={(v) => u.id !== me.id && run.mutate(() => patch(`/users/${u.id}`, { is_admin: v }))}
              label="Admin"
            />
            <Button variant="ghost" onClick={() => resetPassword(u)}>Reset password</Button>
            {u.id !== me.id && (
              <IconButton icon="trash" label={`Remove ${u.name}`}
                onClick={() => confirm(`Remove ${u.name}? Their recipes stay.`) && run.mutate(() => del(`/users/${u.id}`))} />
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="grid gap-3 rounded-xl bg-surface-2/50 p-3 sm:grid-cols-3">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Email">
          <Input type="text" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password">
          <Input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-3">
          <Toggle checked={isAdmin} onChange={setIsAdmin} label="Admin" />
          <Button type="submit" variant="primary" icon="plus" disabled={run.isPending}>Add member</Button>
        </div>
      </form>
    </Card>
  );
}
