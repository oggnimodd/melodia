<script lang="ts">
  import Button from "$lib/components/ui/button/button.svelte";
  import Slider from "$lib/components/ui/slider/slider.svelte";
  import IconPlayerPlay from "@tabler/icons-svelte/icons/player-play-filled";
  import IconPlayerPause from "@tabler/icons-svelte/icons/player-pause-filled";
  import IconPlayerResume from "@tabler/icons-svelte/icons/player-track-next-filled";
  import IconPlayerSkipBack from "@tabler/icons-svelte/icons/player-skip-back-filled";
  import IconPlayerSkipForward from "@tabler/icons-svelte/icons/player-skip-forward-filled";
  import IconMaximize from "@tabler/icons-svelte/icons/maximize";
  import IconSettings from "@tabler/icons-svelte/icons/settings";
  import BpmSettings from "$lib/components/BpmSettings.svelte";
  import { cn } from "$lib/utils";

  // Define the props interface with a new line between each property

  interface PlaybackControlProps {
    /** Reference to the controls container div */
    controlsDiv: HTMLDivElement | null;

    /** Fullscreen object with isActive flag */
    fullscreen: { isActive: boolean };

    /** The currently loaded MIDI file (if any) */
    midiFile: File | null;

    /** Indicates if playback is currently running */
    isPlaying: boolean;

    /** Indicates if playback is currently paused */
    isPaused: boolean;

    /** The current playback time in seconds */
    currentTime: number;

    /** The total duration of the MIDI in seconds */
    totalDuration: number;

    /** Callback to handle play/pause/resume click */
    handlePlayButtonClick: () => void;

    /** Callback to seek backward (e.g., by 5 seconds) */
    seekBackward: () => void;

    /** Callback to seek forward (e.g., by 5 seconds) */
    seekForward: () => void;

    /** The original BPM from the MIDI file or default */
    originalBPM: number;

    /** The current user BPM */
    userBPM: number;

    /** The current speed percentage (e.g., 100 for 100%) */
    speedPercent: number;

    /** Increases playback speed by a given step */
    incrementSpeed: (step?: number) => void;

    /** Decreases playback speed by a given step */
    decrementSpeed: (step?: number) => void;

    /** Resets playback speed to default (100%) */
    resetSpeed: () => void;

    /** Applies a new speed (BPM) value */
    applySpeed: (newSpeed: number) => void;

    /** Callback to toggle fullscreen mode */
    toggleFullscreen: () => void;

    /** Controls the visibility of the settings modal */
    showModal: boolean;

    /** Formatted current time as a string (e.g., "0:00") */
    currentTimeFormatted: string;

    /** Formatted total duration as a string (e.g., "3:45") */
    totalDurationFormatted: string;

    /** Callback for pointer down events on the slider */
    handleSliderPointerDown: (e: PointerEvent) => void;

    /** Callback for input events on the slider */
    handleSliderInput: (e: Event) => void;

    /** Callback for pointer up events on the slider */
    handleSliderPointerUp: () => void;
  }

  // Destructure the props using Svelte 5 $props() convention
  let {
    controlsDiv = $bindable(),
    fullscreen,
    midiFile,
    isPlaying,
    isPaused,
    currentTime,
    totalDuration,
    handlePlayButtonClick,
    seekBackward,
    seekForward,
    originalBPM,
    userBPM,
    speedPercent,
    incrementSpeed,
    decrementSpeed,
    resetSpeed,
    applySpeed,
    toggleFullscreen,
    showModal = $bindable(false),
    currentTimeFormatted,
    totalDurationFormatted,
    handleSliderPointerDown,
    handleSliderInput,
    handleSliderPointerUp,
  }: PlaybackControlProps = $props();
</script>

<!-- Playback controls container -->
<div
  class={cn(
    "flex items-center justify-center gap-4 text-white",
    fullscreen.isActive && "bg-black pb-2"
  )}
  class:mt-4={!fullscreen.isActive}
  bind:this={controlsDiv}
>
  {#if midiFile}
    <!-- Playback buttons and BPM controls -->
    <div class="mt-4 flex items-center gap-x-1.5">
      <Button
        class={cn("", {
          "bg-green-500 hover:bg-green-600":
            !isPlaying || currentTime >= totalDuration,
          "bg-yellow-500 hover:bg-yellow-600": isPlaying && !isPaused,
          "bg-blue-500 hover:bg-blue-600": isPlaying && isPaused,
        })}
        size="icon-sm"
        onclick={handlePlayButtonClick}
      >
        {#if !isPlaying || currentTime >= totalDuration}
          <IconPlayerPlay />
        {:else if isPlaying && !isPaused}
          <IconPlayerPause />
        {:else}
          <IconPlayerResume />
        {/if}
      </Button>
      <Button
        class="bg-purple-500 hover:bg-purple-600"
        size="icon-sm"
        disabled={!midiFile || currentTime <= 0}
        onmouseup={seekBackward}
      >
        <IconPlayerSkipBack />
      </Button>
      <Button
        class="bg-purple-500 hover:bg-purple-600"
        size="icon-sm"
        disabled={!midiFile || currentTime >= totalDuration}
        onmouseup={seekForward}
      >
        <IconPlayerSkipForward />
      </Button>
      <!-- BPM Settings component -->
      <BpmSettings
        originalBpm={originalBPM}
        size="icon-sm"
        {userBPM}
        {speedPercent}
        {incrementSpeed}
        {decrementSpeed}
        {resetSpeed}
        {applySpeed}
      />
      <Button size="icon-sm" disabled={!midiFile} onclick={toggleFullscreen}>
        <IconMaximize />
      </Button>
      <Button
        class="bg-orange-500 hover:bg-orange-600"
        size="icon-sm"
        onclick={() => (showModal = true)}
      >
        <IconSettings />
      </Button>
    </div>
  {/if}
  <!-- Slider for playback progress -->
  <div class="mt-4 flex w-full items-center gap-4 text-white">
    <span>{currentTimeFormatted}</span>
    <Slider
      value={currentTime}
      max={totalDuration}
      onpointerdown={handleSliderPointerDown}
      oninput={handleSliderInput}
      onpointerup={handleSliderPointerUp}
      onchange={handleSliderPointerUp}
    />
    <span>{totalDurationFormatted}</span>
  </div>
</div>
