# General Svelte 5 Conventions and Best Practices

## Reactivity Syntax

- **Rule:** Use `$state()` to declare reactive variables instead of `let` at the top level. We dont need to import runes from svelte, it is available by default.
  - **Example (Correct):**
    ```svelte
    <script>
      let count = $state(0);
    </script>
    ```
  - **Example (Incorrect - Svelte 4 Style):**
    ```svelte
    <script>
      let count = 0; // Not reactive in Svelte 5 runes mode
    </script>
    ```
- **Rule:** Use `$derived()` to declare simple derived state from an expression.
  - **Example (Correct - Simple Derivation):**
    ```svelte
    <script>
      let count = $state(0);
      let doubled = $derived(count * 2);
    </script>
    ```
  - **Example (Incorrect - Svelte 4 Style for derivation):**
    ```svelte
    <script>
      let count = 0;
      $: const double = count * 2; // Use $derived in Svelte 5
    </script>
    ```
- **Rule:** Use `$derived.by()` to declare complex derived state using a function body for more elaborate calculations. This is useful when the derivation logic is not a simple expression or requires multiple steps.
  - **Example (Correct - Complex Derivation with `$derived.by()`):**
    ```svelte
    <script>
      let numbers = $state([1, 2, 3]);
      let total = $derived.by(() => {
        let sum = 0;
        for (const n of numbers) {
          sum += n;
        }
        return sum;
      });
    </script>
    ```
  - **Example (When to use `$derived.by()`):** Use `$derived.by()` when your derived state logic involves loops, conditional statements, multiple intermediate variables, or function calls, making a simple `$derived(expression)` less readable or feasible.
  - **Example (Less ideal - Complex logic in simple `$derived` - Avoid this for readability):**
    ```svelte
    <script>
      let numbers = $state([1, 2, 3]);
      // While technically possible, this is less readable for complex logic
      let total = $derived(numbers.reduce((sum, n) => sum + n, 0));
    </script>
    ```
- **Rule:** Use `$effect()` for side effects instead of `$:`.
  - **Example (Correct):**
    ```svelte
    <script>
      let count = $state(0);
      $effect(() => {
        console.log("Count updated:", count);
      });
    </script>
    ```
  - **Example (Incorrect - Svelte 4 Style):**
    ```svelte
    <script>
      let count = 0;
      $: {
        // Use $effect in Svelte 5
        console.log("Count updated:", count);
      }
    </script>
    ```
- **Rule:** Understand the dependency tracking of `$derived`, `$derived.by`, and `$effect`. Only values read _synchronously_ inside these runes are tracked.

## Component Props

- **Rule:** Use `$props()` to declare component properties instead of `export let`. Destructure props within `$props()`.
  - **Example (Correct):**
    ```svelte
    <script>
      let { name, age = 18 } = $props();
    </script>
    ```
  - **Example (Incorrect - Svelte 4 Style):**
    ```svelte
    <script>
      export let name;
      export let age = 18; // Use $props in Svelte 5
    </script>
    ```
- **Rule:** For optional props, provide default values during destructuring within `$props()`.
  - **Example:** `let { optionalProp = 'default value' } = $props();`
- **Rule:** Use renaming in `$props()` destructuring for reserved keywords or better naming.
  - **Example:** `let { class: className } = $props();`
- **Rule:** Use rest props `...rest` in `$props()` to capture and forward all other props.
  - **Example:** `let { a, b, ...rest } = $props();`
- **Rule:** Avoid mutating props directly unless they are explicitly bindable using `$bindable`. Mutating regular props might lead to unexpected behavior and warnings.

## Event Handling

- **Rule:** Use event attributes directly (e.g., `onclick`, `onmouseover`) instead of `on:event` directives. SO DONT EVER USE `on:event` DIRECTIVES. PLEASE USE `onevent` DIRECTIVES.
  - **Example (Correct):**
    ```svelte
    <button onclick={() => console.log("Clicked!")}>Click me</button>
    ```
  - **Example (Incorrect - Svelte 4 Style):**
    ```svelte
    <button on:click={() => console.log("Clicked!")}>Click me</button> // Use onclick
    in Svelte 5
    ```
- **Rule:** For component events, use callback props instead of `createEventDispatcher`.

  - **Example (Parent Component passing callback):**

    ```svelte
    <script>
      import ChildComponent from "./ChildComponent.svelte";
      function handleIncrement() {
        console.log("Incremented from Child");
      }
    </script>

    <ChildComponent onincrement={handleIncrement} />
    ```

  - **Example (Child Component using callback prop):**

    ```svelte
    <script>
      let { onincrement } = $props();
    </script>

    <button onclick={() => onincrement()}>Increment</button>
    ```

- **Rule:** Handle event modifiers (like `once`, `preventDefault`) programmatically within the event handler function. For capture, passive, and nonpassive, use event name modifiers (e.g., `onclickcapture`).

## Snippets (Replacing Slots)

- **Rule:** Use snippets (`{#snippet ...}{/snippet}`) and `{@render children()}` instead of `<slot>`.

  - **Rule:** Use the `children` prop and `{@render children?.()}` to render default content passed to a component.

    - **Example (Child Component):**

      ```svelte
      <script>
        let { children } = $props();
      </script>

      <div>
        {@render children?.()}
      </div>
      ```

    - **Example (Parent Component passing children):**

      ```svelte
      <script>
        import ChildComponent from "./ChildComponent.svelte";
      </script>

      <ChildComponent>
        <p>This is default content passed as children.</p>
      </ChildComponent>
      ```

  - **Rule:** Use named props and `{@render propName()}` for multiple content placeholders instead of named slots.

    - **Example (Child Component):**

      ```svelte
      <script>
        let { header, content, footer } = $props();
      </script>

      <header>{@render header?.()}</header>
      <main>{@render content?.()}</main>
      <footer>{@render footer?.()}</footer>
      ```

    - **Example (Parent Component passing named snippets):**

      ```svelte
      <script>
        import ChildComponent from "./ChildComponent.svelte";
      </script>

      <ChildComponent>
        {#snippet header()}
          <h1>Header Content</h1>
        {/snippet}
        {#snippet content()}
          <p>Main Content</p>
        {/snippet}
        {#snippet footer()}
          <p>Footer Content</p>
        {/snippet}
      </ChildComponent>
      ```

  - **Rule:** To pass data from child to parent through snippets (like slot props in Svelte 4), use snippet parameters.

    - **Example (Child Component):**

      ```svelte
      <script>
        let { items, itemSnippet, emptySnippet } = $props();
      </script>

      {#if items.length}
        <ul>
          {#each items as entry}
            <li>{@render itemSnippet(entry)}</li>
          {/each}
        </ul>
      {:else}
        {@render emptySnippet?.()}
      {/if}
      ```

    - **Example (Parent Component using snippet parameter):**

      ```svelte
      <script>
        import ListComponent from "./ListComponent.svelte";
      </script>

      <ListComponent items={["one", "two", "three"]}>
        {#snippet itemSnippet(text)}
          <span>Item: {text}</span>
        {/snippet}
        {#snippet emptySnippet()}
          <span>No items yet</span>
        {/snippet}
      </ListComponent>
      ```

## Component Instantiation and Lifecycle

- **Rule:** Components are functions in Svelte 5, not classes. Use `mount` and `hydrate` from `svelte` for programmatic instantiation instead of `new Component()`.
  - **Example (Correct):**
    ```javascript
    import { mount } from "svelte";
    import App from "./App.svelte";
    const app = mount(App, { target: document.getElementById("app") });
    ```
  - **Example (Incorrect - Svelte 4 Style):**
    ```javascript
    import App from "./App.svelte";
    const app = new App({ target: document.getElementById("app") }); // Use mount in Svelte 5
    ```
- **Rule:** Use `unmount` to destroy components instead of `$destroy()`.
  - **Example (Correct):** `unmount(app);`
  - **Example (Incorrect - Svelte 4 Style):** `app.$destroy();` // Use unmount in Svelte 5

## Bindings

- **Rule:** In runes mode, properties are not bindable by default. Use `$bindable()` to explicitly declare bindable props.

  - **Example (Child Component with bindable prop):**

    ```svelte
    <script>
      let { value = $bindable() } = $props();
    </script>

    <input bind:value />
    ```

  - **Example (Parent Component binding to prop):**

    ```svelte
    <script>
      import InputComponent from "./InputComponent.svelte";
      let message = $state("Hello");
    </script>

    <InputComponent bind:value={message} /><p>{message}</p>
    ```

## Whitespace Handling

- **Rule:** Be aware of the simplified whitespace handling in Svelte 5. Whitespace between nodes is collapsed, and whitespace at the start/end of tags is removed. Use `<svelte:options preserveWhitespace>` if needed, or understand the default behavior.

## Modern Browser Requirement

- **Rule:** Svelte 5 requires a modern browser. Ensure your target audience uses modern browsers and inform the AI to not generate code with IE compatibility in mind unless explicitly specified.

## Component Names and Dot Notation

- **Rule:** Capitalize component names to distinguish them from HTML elements (e.g., `<MyComponent />`).
- **Rule:** Understand that dot notation in tags (e.g., `<foo.bar>`) is treated as a component, not a custom element tag. This is useful for dynamic component rendering, especially within `{#each}` blocks.

## Stricter Syntax

- **Rule:** Attribute/prop syntax is stricter. Quote complex attribute values: `<Component prop="this{is}valid" />`.
- **Rule:** HTML structure is stricter. Write valid HTML and avoid relying on browser auto-correction (e.g., ensure `<tbody>` in `<table>` if needed).

## $inspect for Development

- **Rule:** Use `$inspect()` for debugging and logging reactive values during development. It re-runs whenever the inspected value changes. It's a no-op in production.

## $host for Custom Elements

- **Rule:** When building custom elements, use `$host()` to access the host element for dispatching custom events.

---

# TypeScript in Svelte 5

## Script Tag and Preprocessing

- **Rule:** Enable TypeScript in Svelte components by adding `lang="ts"` to the `<script>` tag: `<script lang="ts">`.
- **Rule:** Configure `vitePreprocess` in `svelte.config.js` to enable full TypeScript support (for features beyond type-only).

  - **Example (`svelte.config.js` for SvelteKit/Vite):**

    ```javascript
    import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

    const config = {
      preprocess: vitePreprocess(),
    };

    export default config;
    ```

## tsconfig.json Configuration

- **Rule:** Ensure your `tsconfig.json` includes the following settings for Svelte 5 compatibility:
  - `"target": "ES2022"` or `"target": "ES2015"` with `"useDefineForClassFields": true`.
  - `"verbatimModuleSyntax": true`.
  - `"isolatedModules": true`.

## Typing `$props`

- **Rule:** Define prop types using interfaces or type literals when destructuring `$props()`.
  - **Example (Interface):**
    ```svelte
    <script lang="ts">
      interface Props {
        name: string;
        age?: number;
      }
      let { name, age }: Props = $props();
    </script>
    ```
  - **Example (Type Literal):**
    ```svelte
    <script lang="ts">
      let { name, age }: { name: string; age?: number } = $props();
    </script>
    ```
- **Rule:** Type complex props like snippets and event handlers within the `$props` type definition.
  - **Example (Snippet and EventHandler Props):**
    ```svelte
    <script lang="ts">
      import type { Snippet } from "svelte";
      interface Props {
        messageSnippet: Snippet<[string]>;
        onAction: (value: number) => void;
      }
      let { messageSnippet, onAction }: Props = $props();
    </script>
    ```
- **Rule:** Use index signatures `[key: string]: unknown` in prop interfaces to allow for rest props and unknown attributes.

## Generic Components and `$props`

- **Rule:** Declare generic components using the `generics` attribute in `<script lang="ts" generics="...">`.
  - **Example (Generic List Component):**
    ```svelte
    <script lang="ts" generics="Item extends { id: string }">
      interface Props {
        items: Item[];
        onSelect: (item: Item) => void;
      }
      let { items, onSelect }: Props = $props();
    </script>
    ```

## Typing Wrapper Components

- **Rule:** Use or extend interfaces from `svelte/elements` (e.g., `HTMLButtonAttributes`, `HTMLDivAttributes`, `SvelteHTMLElements`) to type wrapper components that pass through HTML attributes.

  - **Example (Button Wrapper Component):**

    ```svelte
    <script lang="ts">
      import type { HTMLButtonAttributes } from "svelte/elements";
      let { children, ...rest }: HTMLButtonAttributes = $props();
    </script>

    <button {...rest}>{@render children?.()}</button>
    ```

## Typing `$state`

- **Rule:** Explicitly type `$state` variables like any other TypeScript variable.
  - **Example:** `let count: number = $state(0);`
- **Rule:** If `$state` is initialized without a value, its type may include `undefined`. Use `as` casting if you are sure it will be initialized before use, especially in classes.
  - **Example (Class property with `$state`):**
    ```typescript
    class MyClass {
      value = $state() as string; // Assumes initialization in constructor
      constructor(initialValue: string) {
        this.value = initialValue;
      }
    }
    ```

## `Component` Type and `ComponentProps`

- **Rule:** Use the `Component` type from `svelte` to represent Svelte component constructors in type definitions.
- **Rule:** Use `ComponentProps<TComponent>` to extract the prop types of a component `TComponent`.

## Enhancing Built-in DOM Types

- **Rule:** Create a `.d.ts` file (e.g., `additional-svelte-typings.d.ts`) to enhance Svelte's built-in DOM types for custom elements, experimental attributes, or custom events.
- **Rule:** Declare modules `svelteHTML` or augment `svelte/elements` in your `.d.ts` file to extend types.
  - **Example (`additional-svelte-typings.d.ts` for custom element):**
    ```typescript
    declare namespace svelteHTML {
      interface IntrinsicElements {
        "my-custom-element": {
          customAttribute: string;
          "on:custom-event": (e: CustomEvent<any>) => void;
        };
      }
    }
    ```
  - **Example (`additional-svelte-typings.d.ts` augmenting `svelte/elements`):**
    ```typescript
    import { HTMLButtonAttributes } from "svelte/elements";
    declare module "svelte/elements" {
      export interface HTMLButtonAttributes {
        experimentalAttribute?: string;
      }
    }
    export {}; // Ensure not an ambient module
    ```
- **Rule:** Ensure your `.d.ts` file is included in your `tsconfig.json` configuration (e.g., within the `"include"` array).

---

# Code Generation Preferences (Optional - Adjust as needed)

## Style

- **Preference:** Favor concise and explicit rune syntax.
- **Preference:** Encourage the use of TypeScript for type safety in Svelte components.
- **Preference:** Generate components that are functional and leverage runes for reactivity, avoiding class-based components unless for specific state management patterns (like state machines, as in your example).

## Component Structure

- **Structure:** Organize component logic in the `<script>` tag, template in the HTML, and styles in `<style>` tags.
- **Structure:** For complex components, consider breaking them down into smaller, reusable components.

## State Management

- **Guidance:** For simple component-level state, use `$state`. For derived data, use `$derived` or `$derived.by` as appropriate. Use `$effect` sparingly for side effects.
- **Guidance:** For more complex state management scenarios (if needed in larger apps), consider patterns like stores (though runes are designed to cover many state management needs directly in components).

---

# Notes for Cursor AI

- **Context Awareness:** When suggesting code or refactoring, prioritize Svelte 5 runes syntax and TypeScript best practices over legacy Svelte 4 syntax and JavaScript-only approaches. Specifically guide towards using `$derived.by` when complex derivation logic is detected.
- **TypeScript Emphasis:** When generating Svelte components, default to using `<script lang="ts">` and encourage type annotations for props, state, and derived values.
- **Migration Assistance:** Be helpful in suggesting migration steps from Svelte 4 to Svelte 5 syntax, and also in adding TypeScript to existing Svelte projects, referencing the migration guide and TypeScript documentation when appropriate.
- **Best Practices:** Encourage best practices like avoiding prop mutation, using `$derived` and `$derived.by` appropriately for computations, using `$effect` judiciously, and leveraging TypeScript for robust and maintainable Svelte 5 code.
- **Documentation Reference:** When explaining code or suggesting solutions, refer to the official Svelte 5 documentation for runes, new syntax, and TypeScript integration, particularly highlighting the use cases for both `$derived` and `$derived.by`.
