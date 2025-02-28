<script lang="ts">
  import { onMount } from "svelte";
  import * as Tone from "tone";

  let measuredLatency = $state<number | null>(null);
  let isMeasuring = $state(false);
  let canMeasure = $state(false);
  let audioVisualOffset = $state(0);

  // Function to measure output latency
  async function measureOutputLatency() {
    isMeasuring = true;

    return new Promise<number>((resolve) => {
      const osc = new Tone.Oscillator(440).toDestination();
      const analyser = new Tone.Analyser("waveform", 1024);
      osc.connect(analyser);

      const startTime = Tone.getContext().now();
      osc.start(startTime);

      let detectedTime = null;
      const checkForSound = () => {
        const buffer = analyser.getValue();
        // Fix TypeScript error by properly typing the reduce parameters and providing initial value
        const rms = Math.sqrt(
          // @ts-ignore
          buffer.reduce((sum: number, val: number) => sum + val * val, 0) /
            buffer.length
        );

        if (rms > 0.01) {
          detectedTime = Tone.getContext().now();
          osc.stop();
          osc.dispose();
          analyser.dispose();
          isMeasuring = false;
          resolve(detectedTime - startTime);
        } else if (Tone.getContext().now() - startTime > 1) {
          // Timeout after 1 second
          osc.stop();
          osc.dispose();
          analyser.dispose();
          isMeasuring = false;
          resolve(0.1); // Default value
        } else {
          requestAnimationFrame(checkForSound);
        }
      };

      requestAnimationFrame(checkForSound);
    });
  }

  async function handleMeasure() {
    try {
      await Tone.start();
      measuredLatency = await measureOutputLatency();
      console.log("Measured output latency:", measuredLatency);

      // Update audio-visual offset to compensate for latency
      audioVisualOffset = -measuredLatency;
    } catch (error) {
      console.error("Error measuring latency:", error);
      isMeasuring = false;
    }
  }

  onMount(() => {
    if (typeof window !== "undefined") {
      canMeasure = true;
    }
  });

  let formattedLatency = $derived(
    measuredLatency !== null
      ? `${(measuredLatency * 1000).toFixed(1)}ms`
      : "---"
  );
</script>

<div class="min-h-screen bg-background py-12">
  <div class="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
    <div class="space-y-8">
      <div class="text-center">
        <h1
          class="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-4xl font-extrabold tracking-tight text-foreground text-transparent sm:text-5xl"
        >
          Audio Latency Measurement
        </h1>
        <p class="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Precision measurement tool for audio-visual synchronization
        </p>
      </div>

      <div class="space-y-6">
        <div class="rounded-2xl bg-card p-8 shadow-lg ring-1 ring-border/10">
          <div class="space-y-4">
            <div class="space-y-2">
              <h2 class="text-xl font-semibold text-foreground">
                Understanding Audio Latency
              </h2>
              <p class="leading-relaxed text-muted-foreground">
                Audio latency represents the delay between digital signal
                generation and physical sound output. Precise measurement is
                crucial for applications requiring real-time audio-visual
                synchronization.
              </p>
            </div>

            <div class="relative rounded-xl bg-muted/20 p-6 shadow-inner">
              <div class="flex items-center justify-between">
                <div class="space-y-2 text-center">
                  <div class="text-sm font-medium text-primary">
                    Code Execution
                  </div>
                  <div class="font-mono text-xs text-muted-foreground">
                    t = 0ms
                  </div>
                </div>

                <div class="absolute inset-0 flex items-center justify-center">
                  <div class="h-px w-3/4 bg-border/30" />
                  <div class="absolute right-0 -translate-x-4">
                    <svg
                      class="h-8 w-8 text-primary"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M13 5l7 7-7 7M5 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </div>

                <div class="space-y-2 text-center">
                  <div class="text-sm font-medium text-purple-600">
                    Sound Output
                  </div>
                  <div class="font-mono text-xs text-muted-foreground">
                    t + Δ
                  </div>
                </div>
              </div>
              <div
                class="mt-4 text-center text-xs font-medium text-muted-foreground"
              >
                Signal Propagation Timeline
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-2xl bg-card p-8 shadow-lg ring-1 ring-border/10">
          <div class="flex flex-col items-center justify-center space-y-6">
            {#if measuredLatency !== null}
              <div class="space-y-2 text-center">
                <div
                  class="text-sm font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Measured Latency
                </div>
                <div class="text-5xl font-bold text-foreground">
                  {formattedLatency}
                </div>
                <div class="font-mono text-sm text-muted-foreground">
                  Compensation: {(audioVisualOffset * 1000).toFixed(1)}ms
                </div>
              </div>
            {:else}
              <div class="space-y-2 text-center">
                <div class="text-lg font-medium text-muted-foreground">
                  Ready for Measurement
                </div>
                <p class="max-w-md text-sm text-muted-foreground">
                  Initiate system diagnostics to determine your audio processing
                  latency characteristics.
                </p>
              </div>
            {/if}

            <button
              class="relative inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-primary to-purple-600 px-8 py-4 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:shadow-lg hover:brightness-110 disabled:pointer-events-none disabled:opacity-60"
              disabled={!canMeasure || isMeasuring}
              onclick={handleMeasure}
            >
              {#if isMeasuring}
                <svg
                  class="-ml-1 mr-3 h-5 w-5 animate-spin text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Measuring...
              {:else if measuredLatency !== null}
                <svg
                  class="mr-2 h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Recalibrate
              {:else}
                <svg
                  class="mr-2 h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Begin Analysis
              {/if}
            </button>
          </div>
        </div>

        <div class="rounded-xl border p-4 shadow-sm">
          <div class="flex items-start space-x-3">
            <svg
              class="mt-0.5 h-5 w-5 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div class="text-sm leading-relaxed text-blue-800/90">
              <strong>Measurement Protocol:</strong> This diagnostic emits a 440Hz
              tone for latency calculation. Ensure audio output is enabled and ambient
              noise minimized for optimal results.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
