import { Hammer } from "lucide-react";
import { RegionEmpty } from "@/features/shared/region-states";

/** The body of a screen whose task has not landed yet; the shell already gives its title. */
export function NotBuilt({ task }: { readonly task: string }) {
  return (
    <div className="p-4 md:p-6">
      <div className="rounded-lg border bg-surface">
        <RegionEmpty icon={Hammer}>
          This screen is not built yet. It arrives with <span className="font-mono">{task}</span>.
        </RegionEmpty>
      </div>
    </div>
  );
}
