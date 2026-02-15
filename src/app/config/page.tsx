import { redirect } from "next/navigation";

export default function ConfigPage() {
  redirect("/memory?tab=skills");
}
