import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";

import { post } from "../api/client";
import { Button, ErrorNote, Field, Input } from "../components/ui";

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <img src="/pwa-192.png" alt="" className="mx-auto mb-5 size-16 rounded-2xl" />
        <h1 className="text-center text-2xl font-bold">{title}</h1>
        <p className="mt-1 mb-6 text-center text-sm text-muted">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

export function LoginPage() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: () => post("/auth/login", { email, password }),
    onSuccess: () => qc.resetQueries(),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    login.mutate();
  }

  return (
    <AuthShell title="Will's Recipes" subtitle="Sign in to your family's recipes">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <Input type="text" inputMode="email" autoComplete="username" autoCapitalize="none" required
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <Input type="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorNote error={login.error} />
        <Button type="submit" variant="primary" className="w-full" disabled={login.isPending}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}

export function SetupPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const setup = useMutation({
    mutationFn: () => post("/auth/setup", { name, email, password }),
    onSuccess: () => qc.resetQueries(),
  });

  return (
    <AuthShell title="Welcome to Will's Recipes" subtitle="Create the first account. You can add family members afterwards.">
      <form onSubmit={(e) => { e.preventDefault(); setup.mutate(); }} className="space-y-4">
        <Field label="Your name">
          <Input required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" hint="Used to sign in. Doesn't need to be a real address, e.g. will@home.">
          <Input type="text" inputMode="email" autoComplete="username" autoCapitalize="none" required
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <Input type="password" autoComplete="new-password" minLength={8} required
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorNote error={setup.error} />
        <Button type="submit" variant="primary" className="w-full" disabled={setup.isPending}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
