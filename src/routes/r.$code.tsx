import { createFileRoute } from "@tanstack/react-router";
import { MorphogenApp } from "@/components/instrument/morphogen-app";

export const Route = createFileRoute("/r/$code")({ component: RemotePage });

function RemotePage() {
  return <MorphogenApp />;
}
