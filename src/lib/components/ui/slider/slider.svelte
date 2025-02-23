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

  function updateSliderFill(slider: HTMLInputElement) {
    const minVal = slider.min ? parseFloat(slider.min) : 0;
    const maxVal = slider.max ? parseFloat(slider.max) : 100;
    const val = slider.value ? parseFloat(slider.value) : 0;
    const percent = ((val - minVal) * 100) / (maxVal - minVal);
    slider.style.setProperty("--slider-fill", percent + "%");
  }

  function handleInput(e: Event) {
    updateSliderFill(e.target as HTMLInputElement);
    onInput?.(e);
  }
</script>

<input
  type="range"
  {min}
  {max}
  {step}
  {value}
  oninput={handleInput}
  class="custom-slider w-full"
  {...rest}
/>

<style>
  input[type="range"].custom-slider {
    appearance: none;
    width: 100%;
    height: 8px;
    border-radius: 9999px;
    outline: none;
    transition: background 0.2s;
    background: linear-gradient(
      to right,
      #fff 0%,
      #fff var(--slider-fill, 0%),
      #333 var(--slider-fill, 0%),
      #333 100%
    );
  }
  input[type="range"].custom-slider::-webkit-slider-runnable-track {
    height: 8px;
    border-radius: 9999px;
    background: transparent;
  }
  input[type="range"].custom-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    background: #fff;
    border: 2px solid #000;
    border-radius: 9999px;
    margin-top: -6px;
    cursor: pointer;
    transition:
      border-color 0.2s,
      background-color 0.2s;
  }
  input[type="range"].custom-slider::-moz-range-track {
    height: 8px;
    border-radius: 9999px;
    background: #333;
  }
  input[type="range"].custom-slider::-moz-range-progress {
    height: 8px;
    border-radius: 9999px;
    background: #fff;
  }
  input[type="range"].custom-slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    background: #000;
    border: 2px solid #fff;
    border-radius: 9999px;
    cursor: pointer;
  }
  input[type="range"].custom-slider::-ms-track {
    width: 100%;
    height: 8px;
    background: transparent;
    border-color: transparent;
    color: transparent;
  }
  input[type="range"].custom-slider::-ms-fill-lower {
    background: #fff;
    border-radius: 9999px;
  }
  input[type="range"].custom-slider::-ms-fill-upper {
    background: #333;
    border-radius: 9999px;
  }
  input[type="range"].custom-slider::-ms-thumb {
    width: 20px;
    height: 20px;
    background: #fff;
    border: 2px solid #000;
    border-radius: 9999px;
    cursor: pointer;
    margin-top: 0px;
  }
</style>
