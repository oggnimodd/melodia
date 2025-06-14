<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import Button from "$lib/components/ui/button/button.svelte";
  import Slider from "$lib/components/ui/slider/slider.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { getTrackColor } from "$lib/utils/piano";
  import { cn } from "$lib/utils";
  import {
    DEFAULT_SHOW_LABELS,
    DEFAULT_VISIBLE_SECONDS,
    DEFAULT_SHOW_OCTAVE_LINES,
  } from "$lib/features/piano-roll";

  // Define the prop types
  interface SettingsModalProps {
    /** Whether the modal is visible */
    showModal: boolean;

    /** Audio-visual offset in seconds */
    audioVisualOffset: number;

    /** Whether to show note labels on piano keys */
    showLabels: boolean;

    /** How many seconds should be displayed in the piano roll */
    visibleSeconds: number;

    /** Whether to show octave lines on piano keys */
    showOctaveLines: boolean;

    /** Array of track names */
    tracks?: string[];

    /** Set of active track indices */
    activeTrackIndices?: Set<number>;

    /** Callback to toggle track on/off */
    toggleTrack?: (trackIndex: number) => void;

    /** Callback: invoked when user clicks 'Close' or closes the modal */
    onClose?: () => void;

    /** Callback: invoked when user clicks 'Reset' in Calibration tab */
    onResetOffset?: () => void;

    /** Callback: invoked to toggle note labels on/off */
    setShowLabels?: (val: boolean) => void;

    /** Callback: invoked to change the audio-visual offset value */
    setAudioVisualOffset?: (val: number) => void;

    /** Callback: invoked to change the visible seconds value */
    setVisibleSeconds?: (val: number) => void;

    /** Callback: invoked to change the octave line color */
    setShowOctaveLines?: (val: boolean) => void;
  }

  // Destructure props (Svelte 5)
  const {
    showModal,
    audioVisualOffset,
    showLabels,
    visibleSeconds,
    showOctaveLines,
    tracks = [],
    activeTrackIndices = new Set(),
    toggleTrack,
    onClose,
    onResetOffset,
    setShowLabels,
    setAudioVisualOffset,
    setVisibleSeconds,
    setShowOctaveLines,
  }: SettingsModalProps = $props();

  const visibleSecondsOptions = [2, 3, 4, 5, 6];

  function resetPianoConfig() {
    setShowLabels?.(DEFAULT_SHOW_LABELS);
    setVisibleSeconds?.(DEFAULT_VISIBLE_SECONDS);
    setShowOctaveLines?.(DEFAULT_SHOW_OCTAVE_LINES);
  }

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

<Dialog.Root
  open={showModal}
  onOpenChange={(open) => {
    if (!open) onClose?.();
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content
      class="mx-auto my-4 max-h-[80vh] max-w-full overflow-y-auto rounded-xl bg-background p-6 shadow-lg md:max-w-xl"
    >
      <Dialog.Header>
        <Dialog.Title class="text-2xl font-bold text-foreground">
          Settings
        </Dialog.Title>
      </Dialog.Header>
      <div class="flex flex-col">
        <Tabs.Root value="calibration" class="w-full">
          <Tabs.List class="border-b">
            <Tabs.Trigger
              value="calibration"
              class="px-4 py-2 hover:bg-secondary/10"
            >
              Calibration
            </Tabs.Trigger>
            <Tabs.Trigger value="piano" class="px-4 py-2 hover:bg-secondary/10">
              Piano Config
            </Tabs.Trigger>
            {#if tracks.length > 0}
              <Tabs.Trigger
                value="tracks"
                class="px-4 py-2 hover:bg-secondary/10"
              >
                Tracks
              </Tabs.Trigger>
            {/if}
          </Tabs.List>

          <Tabs.Content value="calibration" class="pt-4">
            <p class="mb-4 text-sm text-foreground/80">
              Adjust the slider so visuals match the piano sound.
              <strong>
                If the visuals are too fast (you hear the audio first), slide
                right. If they're too slow, slide left.
              </strong>
            </p>
            <div class="mb-2 flex items-center gap-2 font-semibold">
              <span class="text-sm text-foreground">
                Offset: {audioVisualOffset.toFixed(2)}s
              </span>
            </div>
            <Slider
              value={audioVisualOffset}
              min={-0.5}
              max={0.5}
              step={0.01}
              oninput={(e: Event) => {
                const val = parseFloat((e.target as HTMLInputElement).value);
                setAudioVisualOffset?.(val);
              }}
            />
            <div class="mt-4 flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onclick={() => onResetOffset?.()}
              >
                Reset
              </Button>
            </div>
          </Tabs.Content>

          <Tabs.Content value="piano" class="pt-4">
            <div class="mb-4 flex items-center gap-2">
              <Checkbox
                id="show-label"
                onCheckedChange={(checked) => {
                  setShowLabels?.(checked);
                }}
                checked={showLabels}
                aria-labelledby="show-label"
              />
              <Label for="show-label">Show Note Labels</Label>
            </div>

            <div class="mb-4 flex items-center gap-2">
              <Checkbox
                id="show-octave-lines"
                onCheckedChange={(checked) => {
                  setShowOctaveLines?.(checked);
                }}
                checked={showOctaveLines}
                aria-labelledby="show-octave-lines"
              />
              <Label for="show-octave-lines">Show Octave Lines</Label>
            </div>

            <!-- Visible Seconds -->
            <div class="mt-4">
              <Label>Visible Seconds</Label>
              <ToggleGroup.Root
                type="single"
                class="justify-start"
                value={String(visibleSeconds)}
                onValueChange={(value) => {
                  value &&
                    visibleSecondsOptions.includes(Number(value)) &&
                    setVisibleSeconds?.(Number(value));
                }}
              >
                {#each visibleSecondsOptions as option}
                  <ToggleGroup.Item
                    disabled={Number(option) === visibleSeconds}
                    value={String(option)}
                    class="!text-white !opacity-100"
                  >
                    {option}
                  </ToggleGroup.Item>
                {/each}
              </ToggleGroup.Root>
            </div>

            <!-- Reset Piano Config Button -->
            <div class="mt-4">
              <Button
                variant="destructive"
                size="sm"
                onclick={() => resetPianoConfig()}
              >
                Reset Piano Config
              </Button>
            </div>
          </Tabs.Content>

          {#if tracks.length > 0}
            <Tabs.Content value="tracks" class="pt-4">
              <div class="mb-4">
                <h3 class="mb-3 text-sm font-semibold text-foreground">
                  Track Visibility
                </h3>
                <div class="grid grid-cols-1 gap-y-2">
                  {#each tracks as trackName, i}
                    <div class="flex items-center space-x-3">
                      <Checkbox
                        id={`modal-track-${i}`}
                        aria-label={`Toggle track ${trackName || `Track ${i + 1}`}`}
                        checked={activeTrackIndices.has(i)}
                        onCheckedChange={() => {
                          toggleTrack?.(i);
                        }}
                        class={cn(
                          "h-4 w-4 rounded-sm focus:ring-transparent focus:ring-offset-0 data-[state=checked]:text-white"
                        )}
                        style={getCheckboxStyle(i)}
                      />
                      <Label
                        for={`modal-track-${i}`}
                        class="cursor-pointer text-sm"
                        style={getTrackStyle(i)}
                        title={trackName || `Track ${i + 1}`}
                      >
                        {trackName || `Track ${i + 1}`}
                      </Label>
                    </div>
                  {/each}
                </div>
              </div>
            </Tabs.Content>
          {/if}
        </Tabs.Root>
      </div>
      <Dialog.Footer class="mt-6 flex justify-end">
        <Dialog.Close>
          <Button size="sm">Close</Button>
        </Dialog.Close>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
