<!-- SettingsModal.svelte -->
<script lang="ts">
  import Button from "$lib/components/ui/button/button.svelte";
  import Slider from "$lib/components/ui/slider/slider.svelte";

  // Define the prop types
  interface SettingsModalProps {
    /** Whether the modal is visible */
    showModal: boolean;

    /** Audio-visual offset in seconds */
    audioVisualOffset: number;

    /** Whether to show note labels on piano keys */
    showLabels: boolean;

    /** Callback: invoked when user clicks 'Close' */
    onClose?: () => void;

    /** Callback: invoked when user clicks 'Reset' in Calibration tab */
    onResetOffset?: () => void;

    /** Callback: invoked to toggle note labels on/off */
    setShowLabels?: (val: boolean) => void;

    /** Callback: invoked to change the audio-visual offset value */
    setAudioVisualOffset?: (val: number) => void;
  }

  // Destructure props (Svelte 5)
  const {
    showModal,
    audioVisualOffset,
    showLabels,
    onClose,
    onResetOffset,
    setShowLabels,
    setAudioVisualOffset,
  }: SettingsModalProps = $props();

  // Active tab in the settings modal
  let activeTab = $state<"calibration" | "piano">("calibration");

  function handleClose() {
    onClose?.();
  }

  function handleTabChange(tab: "calibration" | "piano") {
    activeTab = tab;
  }
</script>

<!-- Modal overlay, only visible when showModal is true -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
  style="display: {showModal ? 'flex' : 'none'}"
>
  <!-- Modal content container -->
  <div class="w-96 rounded-lg bg-gray-800 p-6">
    <h2 class="mb-4 text-xl font-semibold text-white">Settings</h2>

    <div class="flex">
      <!-- Left side (tabs) -->
      <div class="mr-4 w-1/3 border-r border-gray-700">
        <div class="flex flex-col">
          <button
            class="px-3 py-2 text-left text-white hover:bg-gray-700"
            class:font-bold={activeTab === "calibration"}
            onclick={() => handleTabChange("calibration")}
          >
            Calibration
          </button>
          <button
            class="px-3 py-2 text-left text-white hover:bg-gray-700"
            class:font-bold={activeTab === "piano"}
            onclick={() => handleTabChange("piano")}
          >
            Piano Config
          </button>
        </div>
      </div>

      <!-- Right side (tab content) -->
      <div class="flex-1 px-4">
        {#if activeTab === "calibration"}
          <!-- Calibration Tab -->
          <p class="mb-4 text-sm text-gray-300">
            Adjust the slider so visuals match the piano sound.
            <strong>
              If the visuals are too fast (you hear the audio first), slide
              right. If they're too slow, slide left.
            </strong>
          </p>

          <div class="mb-2 flex items-center gap-2">
            <span class="text-sm text-white">
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

          <div class="mt-4 flex justify-end gap-2">
            <!-- Reset offset button -->
            <Button size="sm" onclick={() => onResetOffset?.()}>Reset</Button>
          </div>
        {:else if activeTab === "piano"}
          <!-- Piano Config Tab -->
          <p class="mb-4 text-sm text-gray-300">Piano Display Settings</p>

          <label class="flex items-center gap-2 text-white">
            <input
              type="checkbox"
              checked={showLabels}
              oninput={(e: Event) => {
                const checked = (e.target as HTMLInputElement).checked;
                setShowLabels?.(checked);
              }}
            />
            Show Note Labels
          </label>
        {/if}
      </div>
    </div>

    <!-- Bottom row (Close button) -->
    <div class="mt-4 flex justify-end gap-2">
      <Button size="sm" onclick={handleClose}>Close</Button>
    </div>
  </div>
</div>
