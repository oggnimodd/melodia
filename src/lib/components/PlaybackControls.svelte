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
  import type { MidiData } from "$lib/models/midi";
  import isMobile from "is-mobile";
  import { lockOrientationToLandscape } from "$lib/utils/screen";

  interface PlaybackControlProps {
    /** Reference to the controls container div */
    controlsDiv: HTMLDivElement | null;

    /** Fullscreen object with isActive flag */
    fullscreen: { isActive: boolean };

    /** The currently loaded MIDI file (if any) */
    midiData: MidiData | null;

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
    midiData,
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

  const handleFullscreenClick = () => {
    toggleFullscreen();

    if (isMobile() && !fullscreen.isActive) {
      lockOrientationToLandscape();
    }
  };
</script>

<!-- Playback controls container -->
<div
  class={cn(
    "flex items-center gap-4 text-white",
    fullscreen.isActive && "bg-black px-3 pb-3 pt-3",
    !fullscreen.isActive && "flex-wrap md:flex-nowrap"
  )}
  class:mt-4={!fullscreen.isActive}
  bind:this={controlsDiv}
>
  {#if midiData}
    <!-- Playback buttons and BPM controls -->
    <div class="flex items-center gap-x-1.5">
      <Button size="icon-sm" onclick={handlePlayButtonClick}>
        {#if !isPlaying || currentTime >= totalDuration}
          <IconPlayerPlay />
        {:else if isPlaying && !isPaused}
          <IconPlayerPause />
        {:else}
          <IconPlayerResume />
        {/if}
      </Button>
      <Button
        size="icon-sm"
        disabled={currentTime <= 0}
        onmouseup={seekBackward}
      >
        <IconPlayerSkipBack />
      </Button>
      <Button
        size="icon-sm"
        disabled={currentTime >= totalDuration}
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
      <Button size="icon-sm" onclick={handleFullscreenClick}>
        <IconMaximize />
      </Button>
      <Button size="icon-sm" onclick={() => (showModal = true)}>
        <IconSettings />
      </Button>
    </div>
  {/if}
  <!-- Slider for playback progress -->
  <div class="flex w-full items-center gap-4 text-white">
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
