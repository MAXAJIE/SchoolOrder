import { createFileRoute, redirect } from "@tanstack/react-router";

// The console moved to /owner. Old links keep working through this redirect.
export const Route = createFileRoute("/console")({
  beforeLoad: () => {
    throw redirect({ to: "/owner" });
  },
});
