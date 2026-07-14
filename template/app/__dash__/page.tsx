import type { Metadata } from "next";
import __DASH_COMPONENT__ from "@/components/dashboards/__DASH_COMPONENT__";

export const metadata: Metadata = { title: "__DASH_TITLE__" };

export default function Page() {
  return <__DASH_COMPONENT__ />;
}
