<script lang="ts">
  import { onMount } from "svelte";
  import {
    getAllMidis,
    deleteMidi,
    clearAllMidis,
  } from "$lib/features/midi/storage";
  import type { MidiData } from "$lib/models/midi";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    Search,
    Trash2,
    HardDrive,
    ChevronDown,
    ChevronUp,
    ChevronLeft,
  } from "lucide-svelte";
  import { Input } from "$lib/components/ui/input/index.js";
  import { toast } from "svelte-sonner";
  import { selectedMidi } from "$lib/features/midi";
  import { goto } from "$app/navigation";
  import isMobile from "is-mobile";

  interface StoredMidi {
    hash: string;
    fileName: string;
    data: MidiData;
    createdAt: number;
  }

  let midis = $state([] as StoredMidi[]);
  let searchTerm = $state("");
  let errorMessage = $state("");
  let isLoading = $state(true);
  let deleteDialogOpen = $state(false);
  let clearAllDialogOpen = $state(false);
  let midiToDelete = $state<string | null>(null);
  let storageUsage = $state(0);
  let storageQuota = $state(0);
  let showStorageInfo = $state(false);

  async function loadMidis() {
    try {
      isLoading = true;
      midis = await getAllMidis();
    } catch (e) {
      console.error(e);
      errorMessage = "Error loading MIDI library.";
    } finally {
      isLoading = false;
    }
  }

  function openDeleteDialog(hash: string, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    midiToDelete = hash;
    deleteDialogOpen = true;
  }

  async function confirmDelete() {
    if (!midiToDelete) return;
    try {
      await deleteMidi(midiToDelete);
      midis = midis.filter((m: StoredMidi) => m.hash !== midiToDelete);
      toast.success("MIDI file deleted.");
      updateStorageInfo();
    } catch (e) {
      console.error(e);
      errorMessage = "Error deleting MIDI file.";
    } finally {
      deleteDialogOpen = false;
      midiToDelete = null;
    }
  }

  function updateStorageInfo() {
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(({ usage, quota }) => {
        storageUsage = usage || 0;
        storageQuota = quota || 0;
      });
    }
  }

  function openClearAllDialog(event: Event) {
    event.stopPropagation();
    event.preventDefault();
    clearAllDialogOpen = true;
  }

  async function confirmClearAll() {
    try {
      await clearAllMidis();
      midis = [];
      toast.success("All MIDI files deleted.");
      updateStorageInfo();
    } catch (e) {
      console.error(e);
      errorMessage = "Error clearing MIDI library.";
    } finally {
      clearAllDialogOpen = false;
    }
  }

  const filteredMidis = $derived.by((): StoredMidi[] => {
    if (!searchTerm) return midis;
    return midis.filter((m: StoredMidi) =>
      m.fileName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  function formatDate(timestamp: number): string {
    const d = new Date(timestamp);
    return d.toLocaleString();
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    else return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function getStoragePercentage(): number {
    return storageQuota
      ? Math.min(100, Math.round((storageUsage / storageQuota) * 100))
      : 0;
  }

  function toggleStorageInfo() {
    showStorageInfo = !showStorageInfo;
  }

  function chooseMidi(midi: StoredMidi) {
    selectedMidi.data = midi.data;
    selectedMidi.file = null;
    goto("/");
  }

  onMount(() => {
    loadMidis();
    updateStorageInfo();
  });
</script>

<div
  class="container mx-auto max-w-4xl px-2 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8"
>
  <Card.Root class="border-border/40 shadow-md">
    <Card.Header class="pb-2 sm:pb-4">
      <div
        class="flex flex-col-reverse gap-y-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <Card.Title class="text-xl font-bold sm:text-2xl"
            >MIDI Library</Card.Title
          >
          <Card.Description class="text-xs sm:text-sm">
            Browse and manage your saved MIDI files
          </Card.Description>
        </div>

        <Button
          size="sm"
          href="/"
          class="flex-0 ml-auto h-8 w-auto self-start  justify-self-start px-3"
        >
          <ChevronLeft size={16} class="mr-1" />
          Back
        </Button>
      </div>
    </Card.Header>
    <Card.Content class="space-y-3 sm:space-y-4">
      {#if errorMessage}
        <div
          class="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive sm:text-sm"
        >
          {errorMessage}
        </div>
      {/if}

      <div class="relative">
        <Search
          class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          size={16}
        />
        <Input
          autofocus={!isMobile()}
          type="text"
          placeholder="Search by file name..."
          bind:value={searchTerm}
          class="h-9 w-full pl-9 text-sm"
        />
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span
            class="whitespace-nowrap text-xs text-muted-foreground sm:text-sm"
          >
            {filteredMidis.length}
            {filteredMidis.length === 1 ? "file" : "files"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onclick={toggleStorageInfo}
            class="flex h-7 items-center gap-1 px-2 text-xs text-muted-foreground"
          >
            <HardDrive size={14} />
            <span class="xs:inline hidden">Storage info</span>
            {#if showStorageInfo}
              <ChevronUp size={14} />
            {:else}
              <ChevronDown size={14} />
            {/if}
          </Button>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onclick={openClearAllDialog}
          class="h-8 text-xs sm:text-sm"
        >
          <Trash2 size={16} class="mr-1 sm:mr-2" />
          Clear Library
        </Button>
      </div>

      {#if showStorageInfo}
        <div
          class="rounded-md border bg-card/50 p-2 duration-300 animate-in fade-in slide-in-from-top-2 sm:p-3"
        >
          <div class="mt-1">
            <div
              class="h-1.5 w-full overflow-hidden rounded-full bg-muted sm:h-2"
            >
              <div
                class="h-full bg-primary"
                style="width: {getStoragePercentage()}%"
              ></div>
            </div>
            <div class="mt-1 flex justify-between text-xs">
              <span>{formatBytes(storageUsage)} used</span>
              <span>{formatBytes(storageQuota - storageUsage)} free</span>
            </div>
          </div>
        </div>
      {/if}

      {#if isLoading}
        <div class="py-6 text-center sm:py-8">
          <div
            class="border-3 inline-block h-6 w-6 animate-spin rounded-full border-solid border-primary border-r-transparent sm:h-8 sm:w-8 sm:border-4"
          ></div>
          <p class="mt-2 text-xs text-muted-foreground sm:text-sm">
            Loading your MIDI files...
          </p>
        </div>
      {:else if filteredMidis.length === 0}
        <div class="rounded-lg border border-dashed py-8 text-center sm:py-12">
          <p class="text-xs text-muted-foreground sm:text-sm">
            {searchTerm
              ? "No matching MIDI files found."
              : "Your MIDI library is empty."}
          </p>
        </div>
      {:else}
        <div class="space-y-2 sm:space-y-3">
          {#each filteredMidis as midi (midi.hash)}
            <Card.Root
              onclick={() => chooseMidi(midi)}
              class="cursor-pointer overflow-hidden transition-all hover:bg-accent/10"
            >
              <div class="flex items-center justify-between p-3 sm:p-4">
                <div class="min-w-0 flex-1">
                  <h3 class="truncate text-sm font-medium sm:text-base">
                    {midi.fileName}
                  </h3>
                  <p
                    class="mt-0.5 text-[10px] text-muted-foreground sm:text-xs"
                  >
                    Saved on: {formatDate(midi.createdAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onclick={(e) => openDeleteDialog(midi.hash, e)}
                  class="ml-2 h-7 w-7 flex-shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive sm:ml-4"
                >
                  <Trash2 size={16} />
                  <span class="sr-only">Delete</span>
                </Button>
              </div>
            </Card.Root>
          {/each}
        </div>
      {/if}
    </Card.Content>
  </Card.Root>
</div>

<Dialog.Root bind:open={deleteDialogOpen}>
  <Dialog.Content class="p-4 sm:max-w-[425px] sm:p-6">
    <Dialog.Header class="space-y-1 sm:space-y-2">
      <Dialog.Title class="text-base sm:text-lg">Delete MIDI file</Dialog.Title>
      <Dialog.Description class="text-xs sm:text-sm">
        This action cannot be undone. This will permanently delete the MIDI file
        from your library.
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer class="mt-4 flex-col-reverse gap-2 sm:flex-row">
      <Button
        variant="outline"
        class="text-xs sm:text-sm"
        onclick={() => (deleteDialogOpen = false)}
      >
        Cancel
      </Button>
      <Button
        variant="destructive"
        class="text-xs sm:text-sm"
        onclick={confirmDelete}>Delete</Button
      >
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={clearAllDialogOpen}>
  <Dialog.Content class="p-4 sm:max-w-[425px] sm:p-6">
    <Dialog.Header class="space-y-1 sm:space-y-2">
      <Dialog.Title class="text-base sm:text-lg"
        >Clear All MIDI Files</Dialog.Title
      >
      <Dialog.Description class="text-xs sm:text-sm">
        This action cannot be undone. This will permanently delete ALL MIDI
        files from your library.
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer class="mt-4 flex-col-reverse gap-2 sm:flex-row">
      <Button
        variant="outline"
        class="text-xs sm:text-sm"
        onclick={() => (clearAllDialogOpen = false)}
      >
        Cancel
      </Button>
      <Button
        variant="destructive"
        class="text-xs sm:text-sm"
        onclick={confirmClearAll}>Clear All</Button
      >
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
