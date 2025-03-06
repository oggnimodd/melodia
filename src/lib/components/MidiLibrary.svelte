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
  } from "lucide-svelte";
  import { Input } from "$lib/components/ui/input/index.js";
  import { toast } from "svelte-sonner";

  // Define a type alias for your stored MIDI files.
  interface StoredMidi {
    hash: string;
    fileName: string;
    data: MidiData;
    createdAt: number;
  }

  // Reactive state
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

  // Function to update storage usage info using navigator.storage.estimate()
  function updateStorageInfo() {
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(({ usage, quota }) => {
        storageUsage = usage || 0;
        storageQuota = quota || 0;
      });
    }
  }

  // Open confirmation dialog to clear all MIDI files
  function openClearAllDialog(event: Event) {
    event.stopPropagation();
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

  // Derived state for filtering based on the search input.
  const filteredMidis = $derived.by((): StoredMidi[] => {
    if (!searchTerm) return midis;
    return midis.filter((m: StoredMidi) =>
      m.fileName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // Helper to format a timestamp into a readable date.
  function formatDate(timestamp: number): string {
    const d = new Date(timestamp);
    return d.toLocaleString();
  }

  // Helper to format bytes to a readable string.
  function formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    else return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  // Calculate storage usage percentage
  function getStoragePercentage(): number {
    return storageQuota
      ? Math.min(100, Math.round((storageUsage / storageQuota) * 100))
      : 0;
  }

  function toggleStorageInfo() {
    showStorageInfo = !showStorageInfo;
  }

  onMount(() => {
    loadMidis();
    updateStorageInfo();
  });
</script>

<div class="container mx-auto max-w-4xl px-4 py-8 md:px-0">
  <Card.Root class="border-border/40 shadow-md">
    <!-- Header with title -->
    <Card.Header class="pb-4">
      <div class="flex items-center justify-between">
        <div>
          <Card.Title class="text-2xl font-bold">MIDI Library</Card.Title>
          <Card.Description>
            Browse and manage your saved MIDI files
          </Card.Description>
        </div>
      </div>
    </Card.Header>
    <Card.Content class="space-y-6">
      {#if errorMessage}
        <div
          class="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {errorMessage}
        </div>
      {/if}

      <!-- Search bar, clearly separated from other controls -->
      <div class="relative">
        <Search
          class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          size={18}
        />
        <Input
          type="text"
          placeholder="Search by file name..."
          bind:value={searchTerm}
          class="w-full pl-10"
        />
      </div>

      <!-- File count and action buttons -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-sm text-muted-foreground">
            {filteredMidis.length}
            {filteredMidis.length === 1 ? "file" : "files"} in library
          </span>
          <Button
            variant="ghost"
            size="sm"
            onclick={toggleStorageInfo}
            class="flex items-center gap-1 text-xs text-muted-foreground"
          >
            <HardDrive size={14} />
            Storage info
            {#if showStorageInfo}
              <ChevronUp size={14} />
            {:else}
              <ChevronDown size={14} />
            {/if}
          </Button>
        </div>
        <Button variant="destructive" size="sm" onclick={openClearAllDialog}>
          <Trash2 size={16} class="mr-2" />
          Clear Library
        </Button>
      </div>

      <!-- Collapsible Storage Info Card -->
      {#if showStorageInfo}
        <div
          class="rounded-md border bg-card/50 p-3 duration-300 animate-in fade-in slide-in-from-top-2"
        >
          <div class="mt-2">
            <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
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

      <!-- Content -->
      {#if isLoading}
        <div class="py-8 text-center">
          <div
            class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"
          ></div>
          <p class="mt-2 text-sm text-muted-foreground">
            Loading your MIDI files...
          </p>
        </div>
      {:else if filteredMidis.length === 0}
        <div class="rounded-lg border border-dashed py-12 text-center">
          <p class="text-muted-foreground">
            {searchTerm
              ? "No matching MIDI files found."
              : "Your MIDI library is empty."}
          </p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each filteredMidis as midi (midi.hash)}
            <Card.Root
              class="cursor-pointer overflow-hidden transition-all hover:bg-accent/10"
            >
              <div class="flex items-center justify-between p-4">
                <div class="min-w-0 flex-1">
                  <h3 class="truncate font-medium">{midi.fileName}</h3>
                  <p class="mt-1 text-xs text-muted-foreground">
                    Saved on: {formatDate(midi.createdAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onclick={(e) => openDeleteDialog(midi.hash, e)}
                  class="ml-4 flex-shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
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

<!-- Delete MIDI file confirmation dialog -->
<Dialog.Root bind:open={deleteDialogOpen}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Delete MIDI file</Dialog.Title>
      <Dialog.Description>
        This action cannot be undone. This will permanently delete the MIDI file
        from your library.
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (deleteDialogOpen = false)}>
        Cancel
      </Button>
      <Button variant="destructive" onclick={confirmDelete}>Delete</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Clear all MIDI files confirmation dialog -->
<Dialog.Root bind:open={clearAllDialogOpen}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Clear All MIDI Files</Dialog.Title>
      <Dialog.Description>
        This action cannot be undone. This will permanently delete ALL MIDI
        files from your library.
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (clearAllDialogOpen = false)}>
        Cancel
      </Button>
      <Button variant="destructive" onclick={confirmClearAll}>Clear All</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
