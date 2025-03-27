# Melodia

Melodia is a web-based MIDI visualizer inspired by Synthesia. Upload your MIDI files and watch the notes fall on a virtual piano keyboard, helping you learn and practice piano pieces visually.

<video src="screenshots/demo.mp4" width="100%" controls></video>

## Features

-   **MIDI Visualization:** Upload `.midi` or `.mid` files and visualize them with falling notes on a piano roll.
-   **Synchronized Audio:** Listen to the MIDI file played back with sampled piano sounds (Salamander Grand Piano via Tone.js) synchronized with the visuals.
-   **Playback Controls:**
    -   Play, Pause, and Resume playback.
    -   Seek forward/backward through the track.
    -   Adjust playback speed (BPM percentage).
    -   Progress slider for quick navigation.
    -   Swipe vertically on the visualizer to scrub through time (touch-friendly).
-   **Customization:**
    -   Toggle note labels on the piano keys.
    -   Toggle octave separator lines on the piano roll.
    -   Adjust the visible duration (zoom level) of the piano roll.
    -   Calibrate audio-visual offset for perfect synchronization.
-   **MIDI Library:**
    -   Save uploaded MIDI files locally in your browser using IndexedDB.
    -   Browse, search, and delete saved MIDI files.
    -   View storage usage for the local library.
-   **Responsive Design:** Works on various screen sizes.
-   **Fullscreen Mode:** Immerse yourself in the visualizer.

## Tech Stack

-   [SvelteKit](https://kit.svelte.dev/) with [Svelte 5](https://svelte.dev/)
-   [TypeScript](https://www.typescriptlang.org/)
-   [Tailwind CSS](https://tailwindcss.com/)
-   [Tone.js](https://tonejs.github.io/) for Web Audio management and MIDI playback.
-   [Shadcn-Svelte](https://shadcn-svelte.com/) for UI components (using [Bits UI](https://bits-ui.com/)).
-   [Lucide Svelte](https://lucide.dev/guide/packages/lucide-svelte) for icons.
-   [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) for client-side MIDI file storage.
-   [Bun](https://bun.sh/) as the package manager and runtime.
-   [Vite](https://vitejs.dev/) for development and bundling.

## Getting Started

### Prerequisites

-   [Bun](https://bun.sh/)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/oggnimodd/melodia.git
    cd melodia
    ```

2.  **Install dependencies:**
    ```bash
    bun install
    ```

### Development

Start the development server. This will typically run on `http://localhost:5173`.

```bash
bun run dev
```

### Build

Create a production-ready build of the application.

```bash
bun run build
```

### Preview

Preview the production build locally.

```bash
bun run preview
```

## Configuration

-   Visual settings (note labels, octave lines, visible seconds) and audio-visual offset are stored in your browser's **Local Storage**.
-   These settings can be adjusted via the **Settings modal**, accessible through the gear icon (⚙️) in the playback controls.
-   Uploaded MIDI files can be optionally saved to your browser's **IndexedDB** via the MIDI Library feature. Manage these files by navigating to the `/midi-library` page.

## License

This project is licensed under the [MIT License](LICENSE).

## Credits

-   This project is heavily inspired by [Synthesia](https://synthesiagame.com/).
-   Built with the powerful [Tone.js](https://tonejs.github.io/) library for Web Audio.
-   Uses the free [Salamander Grand Piano](https://sfzinstruments.github.io/pianos/salamander/) soundfont samples (via Tone.js examples).
