import { DesignSystem } from "@/components/design-system";

// Read the saved app theme at request time, just like the settings pages.
export const dynamic = "force-dynamic";

export default function DesignSystemPage() {
  return <DesignSystem />;
}
