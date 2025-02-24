<script lang="ts">
  interface SliderProps {
    value: number;
    max: number;
    min?: number;
    step?: number;
    onInput?: (e: Event) => void;
  }

  let {
    value,
    max,
    min = 0,
    step = 1,
    onInput,
    ...rest
  }: SliderProps = $props();

  let sliderElement: HTMLInputElement;

  function updateSliderFill(slider: HTMLInputElement) {
    const minVal = slider.min ? parseFloat(slider.min) : 0;
    const maxVal = slider.max ? parseFloat(slider.max) : 100;
    const val = slider.value ? parseFloat(slider.value) : 0;
    const percent = ((val - minVal) * 100) / (maxVal - minVal);
    slider.style.setProperty("--slider-fill", `${percent}%`);
  }

  function handleInput(e: Event) {
    updateSliderFill(e.target as HTMLInputElement);
    onInput?.(e);
  }

  $effect(() => {
    if (sliderElement && value) {
      updateSliderFill(sliderElement);
    }
  });
</script>

<div class="slider-container">
  <input
    bind:this={sliderElement}
    type="range"
    {min}
    {max}
    {step}
    {value}
    oninput={handleInput}
    class="range-slider"
    {...rest}
  />
</div>

<style>
  .slider-container {
    @apply relative flex h-5 w-full items-center;
  }

  .range-slider {
    @apply relative h-2 w-full appearance-none bg-transparent outline-none;
  }

  /* Track styles */
  .range-slider::-webkit-slider-runnable-track {
    @apply h-2 w-full rounded-full;
    background: linear-gradient(
      to right,
      hsl(0, 0%, 100%) 0%,
      hsl(0, 0%, 100%) var(--slider-fill, 0%),
      hsl(0, 0%, 20%) var(--slider-fill, 0%),
      hsl(0, 0%, 20%) 100%
    );
  }

  .range-slider::-moz-range-track {
    @apply h-2 w-full rounded-full;
    background: hsl(0, 0%, 20%);
  }

  .range-slider::-moz-range-progress {
    @apply h-2 rounded-full;
    background: hsl(0, 0%, 100%);
  }

  /* Thumb styles */
  .range-slider::-webkit-slider-thumb {
    @apply relative z-10 -mt-1.5 h-5 w-5 cursor-pointer appearance-none rounded-full;
    background: hsl(0, 0%, 0%);
    border: 2px solid hsl(0, 0%, 100%);
  }

  .range-slider::-moz-range-thumb {
    @apply relative z-10 h-5 w-5 cursor-pointer rounded-full;
    background: hsl(0, 0%, 0%);
    border: 2px solid hsl(0, 0%, 100%);
  }

  /* Focus styles */
  .range-slider:focus {
    @apply outline-none;
  }

  .range-slider:focus::-webkit-slider-thumb {
    box-shadow: 0 0 0 2px hsl(0, 0%, 10%);
  }

  .range-slider:focus::-moz-range-thumb {
    box-shadow: 0 0 0 2px hsl(0, 0%, 10%);
  }

  /* Hover styles */
  .range-slider:hover::-webkit-slider-thumb {
    background: hsl(0, 0%, 10%);
  }

  .range-slider:hover::-moz-range-thumb {
    background: hsl(0, 0%, 10%);
  }

  /* Active styles */
  .range-slider:active::-webkit-slider-thumb {
    background: hsl(0, 0%, 0%);
  }

  .range-slider:active::-moz-range-thumb {
    background: hsl(0, 0%, 0%);
  }
</style>
