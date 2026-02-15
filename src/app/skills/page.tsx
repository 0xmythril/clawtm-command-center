import { redirect } from "next/navigation";

export default function SkillsPage() {
  redirect("/memory?tab=skills");
}
