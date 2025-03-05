<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import Button from "$lib/components/ui/button/button.svelte";
  import Slider from "$lib/components/ui/slider/slider.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";

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
  }

  // Destructure props (Svelte 5)
  const {
    showModal,
    audioVisualOffset,
    showLabels,
    visibleSeconds,
    onClose,
    onResetOffset,
    setShowLabels,
    setAudioVisualOffset,
    setVisibleSeconds,
  }: SettingsModalProps = $props();

  const visibleSecondsOptions = [2, 3, 4, 5, 6];
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
            <div class="flex items-center gap-2">
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

            <!-- Visible Seconds -->
            <div class="mt-4">
              <!-- Label for toggle group -->
              <Label>Visible Seconds</Label>

              <ToggleGroup.Root
                type="single"
                class="justify-start"
                value={String(visibleSeconds)}
                onValueChange={(value) => {
                  setVisibleSeconds?.(Number(value));
                }}
              >
                <!-- Loop for toggle group items -->
                {#each visibleSecondsOptions as option}
                  <ToggleGroup.Item value={String(option)}>
                    {option}
                  </ToggleGroup.Item>
                {/each}
              </ToggleGroup.Root>
            </div>
          </Tabs.Content>
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
