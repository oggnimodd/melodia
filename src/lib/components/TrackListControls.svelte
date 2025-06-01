<script lang="ts">
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { Label } from "$lib/components/ui/label";
  import { getTrackColor } from "$lib/utils/piano";
  import { cn } from "$lib/utils";

  type Props = {
    tracks: string[];
    activeTrackIndices: Set<number>;
    toggleTrack: (trackIndex: number) => void;
    fullscreen: boolean;
  };
  let { tracks, activeTrackIndices, toggleTrack, fullscreen }: Props = $props();

  function getTrackStyle(trackIndex: number) {
    const color = getTrackColor(trackIndex, true, false);
    return `color: ${color};`;
  }

  function getCheckboxStyle(trackIndex: number) {
    if (activeTrackIndices.has(trackIndex)) {
      const color = getTrackColor(trackIndex, true, false);
      return `background-color: ${color} !important; border-color: ${color} !important;`;
    }
    return "border-color: #6b7280;";
  }
</script>

{#if tracks.length > 0}
  <div class={cn("mt-1 text-white", fullscreen ? "px-2 pb-1 pt-0" : "p-1")}>
    <h3
      class="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400"
    >
      Tracks
    </h3>
    <div class="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3 md:grid-cols-4">
      {#each tracks as trackName, i}
        <div class="flex items-center space-x-2">
          <Checkbox
            id={`track-${i}-${fullscreen ? "fs" : "win"}`}
            aria-label={`Toggle track ${trackName || `Track ${i + 1}`}`}
            checked={activeTrackIndices.has(i)}
            onCheckedChange={() => {
              toggleTrack(i);
            }}
            class={cn(
              "h-4 w-4 rounded-sm focus:ring-transparent focus:ring-offset-0 data-[state=checked]:text-white"
            )}
            style={getCheckboxStyle(i)}
          />
          <Label
            for={`track-${i}-${fullscreen ? "fs" : "win"}`}
            class="cursor-pointer truncate text-sm"
            style={getTrackStyle(i)}
            title={trackName || `Track ${i + 1}`}
          >
            {trackName || `Track ${i + 1}`}
          </Label>
        </div>
      {/each}
    </div>
  </div>
{/if}
