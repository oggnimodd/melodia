<script lang="ts">
  import { onMount } from "svelte";
  import { getAllMidis, deleteMidi } from "$lib/features/midi/storage";
  import type { MidiData } from "$lib/models/midi";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Search, Trash2 } from "lucide-svelte";
  import { Input } from "$lib/components/ui/input/index.js";
  import { toast } from "svelte-sonner";

  // Define a type alias for your stored MIDI files.
  interface StoredMidi {
    hash: string;
    fileName: string;
    data: MidiData;
    createdAt: number;
  }

  // Reactive state for MIDI list, search term, and error message.
  let midis = $state([] as StoredMidi[]);
  let searchTerm = $state("");
  let errorMessage = $state("");
  let isLoading = $state(true);
  let deleteDialogOpen = $state(false);
  let midiToDelete = $state<string | null>(null);

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
    } catch (e) {
      console.error(e);
      errorMessage = "Error deleting MIDI file.";
    } finally {
      deleteDialogOpen = false;
      midiToDelete = null;
    }
  }

  // Derived state for filtering based on the search input.
  const filteredMidis = $derived.by((): StoredMidi[] => {
    if (!searchTerm) return midis;
    return midis.filter((m: StoredMidi) =>
      m.fileName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  onMount(() => {
    loadMidis();
  });

  // Helper to format a timestamp into a readable date.
  function formatDate(timestamp: number): string {
    const d = new Date(timestamp);
    return d.toLocaleString();
  }
</script>

<div class="container mx-auto max-w-4xl px-4 py-8 md:px-0">
  <Card.Root class="border-border/40 shadow-md">
    <Card.Header class="pb-4">
      <Card.Title class="text-2xl font-bold">Your MIDI Library</Card.Title>
      <Card.Description>
        Browse and manage your saved MIDI files
      </Card.Description>
    </Card.Header>

    <Card.Content class="space-y-6">
      {#if errorMessage}
        <div
          class="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {errorMessage}
        </div>
      {/if}

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

      <p class="flex justify-between text-sm text-muted-foreground">
        {filteredMidis.length}
        {filteredMidis.length === 1 ? "file" : "files"} in library
      </p>

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
        <div class="rounded-lg border border-dashed py-8 text-center">
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
                  variant="destructive"
                  size="icon-sm"
                  onclick={(e) => openDeleteDialog(midi.hash, e)}
                  class="ml-4 flex-shrink-0"
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
