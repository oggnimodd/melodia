<!-- BpmSettings.svelte -->
<script lang="ts" module>
  import Button, {
    buttonVariants,
  } from "$lib/components/ui/button/button.svelte";
  import type { WithElementRef } from "bits-ui";
  import type { VariantProps } from "tailwind-variants";
  import type { HTMLBaseAttributes } from "svelte/elements";

  interface BpmSettingsBaseProps {
    originalBpm: number;
    userBPM: number;
    speedPercent: number;
    incrementSpeed: (step: number) => void;
    decrementSpeed: (step: number) => void;
    resetSpeed: () => void;
    applySpeed: (newSpeed: number) => void;
  }

  export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
  export type ButtonSize = VariantProps<typeof buttonVariants>["size"];

  export type ButtonProps = WithElementRef<HTMLBaseAttributes> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  };

  export type BpmSettingsProps = BpmSettingsBaseProps & ButtonProps;
</script>

<script lang="ts">
  import { cn } from "$lib/utils.js";

  let {
    class: className,
    variant = "default",
    size = "default",
    ref = $bindable(null),
    userBPM,
    speedPercent, // parent's speedPercent
    originalBpm,
    incrementSpeed,
    decrementSpeed,
    resetSpeed,
    applySpeed, // function to update BPM on parent
    children,
    ...restProps
  }: BpmSettingsProps = $props();

  let showBpmDropdown = $state(false);

  // Local variable to hold the input value.
  let localSpeedPercent = $state(speedPercent);

  // Clamp the input value immediately as the user types.
  function handleInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const val = parseFloat(input.value);
    if (!isNaN(val)) {
      localSpeedPercent = Math.max(20, Math.min(val, 200));
    }
  }

  // When Apply is clicked, call parent's applySpeed with the clamped value.
  function handleApply() {
    applySpeed(localSpeedPercent);
    showBpmDropdown = false;
  }

  // Close dropdown when clicking outside.
  function clickOutside(node: HTMLElement) {
    const handleClick = (event: MouseEvent) => {
      if (!node.contains(event.target as Node)) {
        showBpmDropdown = false;
        // Reset local value to parent's value.
        localSpeedPercent = speedPercent;
      }
    };
    document.addEventListener("click", handleClick, true);
    return {
      destroy() {
        document.removeEventListener("click", handleClick, true);
      },
    };
  }

  function handleReset() {
    resetSpeed();
    // Also reset the local value to the parent's value.
    localSpeedPercent = speedPercent;
  }

  $effect(() => {
    if (showBpmDropdown) {
      localSpeedPercent = speedPercent;
    }
  });
</script>

<div
  bind:this={ref}
  use:clickOutside
  class={cn(
    buttonVariants({ variant, size }),
    cn(className, "relative flex !w-auto items-center gap-0 px-0")
  )}
>
  <!-- Minus button: updates BPM immediately -->
  <button
    class="h-full rounded-l-md px-1.5 text-xs hover:bg-blue-600 hover:text-white lg:px-2 lg:text-lg"
    onclick={() => decrementSpeed(5)}
  >
    -
  </button>

  <!-- BPM display & dropdown toggle -->
  <button
    onclick={() => (showBpmDropdown = !showBpmDropdown)}
    class="hover:bg-gray/50 h-full px-1 text-[0.6rem] leading-[0.9rem] lg:text-[0.8rem] lg:leading-[1.05rem]"
  >
    <span class="block font-bold">
      {userBPM.toFixed(2)} bpm
    </span>
    <span class="block">
      {speedPercent}%
    </span>
  </button>

  <!-- Plus button: updates BPM immediately -->
  <button
    class="h-full rounded-r-md px-1.5 text-xs hover:bg-blue-600 hover:text-white lg:px-2 lg:text-lg"
    onclick={() => incrementSpeed(5)}
  >
    +
  </button>

  <!-- Dropdown for manual BPM input -->
  {#if showBpmDropdown}
    <div
      class="absolute left-0 top-full z-50 mt-2 flex w-56 flex-col justify-center rounded-md border border-border bg-popover p-4 text-white shadow-md"
    >
      <span class="mb-2 text-center font-semibold">Select BPM</span>

      <div class="mb-3 flex items-center justify-center gap-2">
        <span>Percentage (%):</span>
        <input
          type="number"
          class="w-16 rounded border border-input bg-transparent p-2 text-center text-sm text-white placeholder:text-muted-foreground"
          min="20"
          max="200"
          bind:value={localSpeedPercent}
          oninput={handleInput}
        />
      </div>

      <!-- Show local BPM so user doesn't get confused -->
      <div class="mb-3 text-center">
        <span>
          BPM: {((originalBpm * localSpeedPercent) / 100).toFixed(2)}
        </span>
      </div>

      <div class="mx-auto mt-1 flex gap-x-3">
        <Button disabled={userBPM === originalBpm} onclick={handleReset}>
          Reset
        </Button>
        <Button
          disabled={localSpeedPercent === speedPercent}
          onclick={handleApply}
        >
          Apply
        </Button>
      </div>
    </div>
  {/if}
</div>
