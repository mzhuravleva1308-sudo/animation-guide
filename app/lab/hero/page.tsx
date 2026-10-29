import type { Metadata } from "next";
import LabHeroPrototype from "@/components/lab/LabHeroPrototype";

export const metadata: Metadata = {
  title: "Lab — Hero prototype | Resonale",
  robots: { index: false, follow: false },
};

export default function LabHeroPage() {
  return <LabHeroPrototype />;
}
