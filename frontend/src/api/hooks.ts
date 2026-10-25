import { useQuery } from "@tanstack/react-query";

import { get } from "./client";
import type { AuthStatus, Tag, Units, User } from "./types";

export function useAuth() {
  return useQuery({ queryKey: ["auth"], queryFn: () => get<AuthStatus>("/auth/status"), staleTime: Infinity });
}

/** The signed-in user. Only use below the auth gate in App, where it is guaranteed. */
export function useMe(): User {
  const { data } = useAuth();
  return data!.user!;
}

export function useUnits() {
  return useQuery({ queryKey: ["units"], queryFn: () => get<Units>("/units"), staleTime: Infinity });
}

export function useTags() {
  return useQuery({ queryKey: ["tags"], queryFn: () => get<Tag[]>("/tags") });
}
