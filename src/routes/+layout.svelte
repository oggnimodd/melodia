<script lang="ts">
  import "../app.css";
  import { ModeWatcher } from "mode-watcher";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import Sampler from "$lib/components/Sampler.svelte";

  let { children } = $props();
</script>

<Sampler />
<ModeWatcher />
<Toaster />
{@render children()}
