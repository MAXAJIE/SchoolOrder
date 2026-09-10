import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy address. Sellers now sign in / sign up at /signup. */
export const Route = createFileRoute("/auth/")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/signup", search: search as { timeout?: "1" } });
  },
});
