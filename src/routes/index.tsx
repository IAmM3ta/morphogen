import { createFileRoute } from "@tanstack/react-router";
import { MorphogenApp } from "@/components/instrument/morphogen-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <MorphogenApp />;
}
