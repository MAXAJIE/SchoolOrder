import { createFileRoute, redirect } from "@tanstack/react-router";

// Ordering moved to /guest. Old links keep working through this redirect.
export const Route = createFileRoute("/place_order")({
  beforeLoad: () => {
    throw redirect({ to: "/guest", search: { code: "" } });
  },
});
