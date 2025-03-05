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


## $inspect for Development

- **Rule:** Use `$inspect()` for debugging and logging reactive values during development. It re-runs whenever the inspected value changes. It's a no-op in production.

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

# SUPER SUPER IMPORTANT NOTES

####################################################
- NEVER USE `writable` OR `context` ANYMORE IN SVELTE5, SHARING STATES BETWEEN COMPONENTS IS NOW DONE USING $STATE AND $DERIVED. YOU ARE NOT ALLOWED TO USE `writable` OR `context` IN SVELTE 5.
####################################################


## State Management

- **Guidance:** For simple component-level state, use `$state`. For derived data, use `$derived` or `$derived.by` as appropriate. Use `$effect` sparingly for side effects.
- **Guidance:** For more complex state management scenarios (if needed in larger apps), consider patterns like stores (though runes are designed to cover many state management needs directly in components).

# Universal Reactivity

Svelte 5 introduced a new universal system of reactivity named runes which means that you can use the same reactivity system inside and outside Svelte components as long as the file name includes the `.svelte` extension.

In this post I’m going to go over the different ways you can export and share reactive state in Svelte 5 using functions, classes and property accessors.

## Global State

This is a simple counter example that declares a reactive value `count` using the `$state` rune and increments it using a button:

`+page.svelte`

```svelte
<script lang="ts">
  let count = $state(0)
</script>

<button onclick={() => count++}>
  {count}
</button>
```

Try exporting and importing the `count` value from the component:

`counter.svelte.ts`

```typescript
export let count = $state(0)
```

`+page.svelte`

```svelte
<script lang="ts">
  import { count } from './counter.svelte'
</script>

<button onclick={() => count++}>
  {count}
</button>
```

You might have expected this to work, but instead you get an error that says: “Cannot assign to import.”

This is because Svelte doesn’t change how JavaScript works and imported values can only be modified by the exporter.

In older versions of Svelte you would use a writable store to export the value which works because stores are objects:

`counter.ts`

```typescript
// writable store
import { writable } from 'svelte/store'; // Import writable

export const count = writable(0)
```

In Svelte 5, you can pass an object to `$state` and Svelte is going to use a `Proxy` object to make the properties reactive:

`counter.svelte.ts`

```typescript
// reactive object using a Proxy
export const count = $state({ value: 0 })
```

You can’t reassign imports, but you can update objects so updating `count.value` works:

`+page.svelte`

```svelte
<script lang="ts">
  import { count } from './counter.svelte'
</script>

<button onclick={() => count.value++}>
  {count.value}
</button>
```

This is very useful if you have a config that you want to expose to your entire app:

`config.svelte.ts`

```typescript
export const config = $state({
  theme: 'dark',
  textSize: '16px',
  textLength: '80ch',
  // ...
})
```

## Using Functions To Read And Write To Reactive Values

You can use regular functions to read and write to a reactive value:

`counter.svelte.ts`

```typescript
let count = $state(0)

export function getCount() {
  return count
}

export function setCount(value: number) {
  count = value
}
```

This comes at the cost of developer experience since you have to write more verbose code:

`+page.svelte`

```svelte
<script lang="ts">
  import { getCount, setCount } from './counter.svelte'
</script>

<button onclick={() => setCount(getCount() + 1)}>
  {getCount()}
</button>
```

## Using Property Accessors To Read And Write To Reactive Values

You can define a getter and setter and use property accessors for a nicer developer experience:

`counter.svelte.ts`

```typescript
let count = $state(0)

export const counter = {
  get count() { return count },
  set count(value) { count = value },
  increment() { count++ }
}
```

You can use functions instead of property accessors if you want:

`counter.svelte.ts`

```typescript
let count = $state(0)

export const counter = {
  count() { return count },
  setCount(value) { count = value },
  increment() { count++ }
}
```

Using property accessors you can read and write to `count` using `counter.count` or `increment`:

`+page.svelte`

```svelte
<script lang="ts">
  import { counter } from './counter.svelte'
</script>

<button onclick={() => counter.count++}>
  {counter.count}
</button>
```

Of course, you would not export an object like this directly from the module but from a function instead:

`counter.svelte.ts`

```typescript
export function createCounter() {
  let count = $state(0)
  // you can also derive values
  let double = $derived(count * 2)

  return {
    get count() { return count },
    set count(value) { count = value },
    increment() { count++ }
  }
}
```

Then you would initialize the counter inside the component:

`+page.svelte`

```svelte
<script lang="ts">
  import { createCounter } from './counter.svelte'

  const counter = createCounter()
</script>

<button onclick={counter.increment}>
  {counter.count}
</button>
```

## Destructuring Reactive Values

You might want to destructure `count` and `increment` from `counter` but as you’re going to see it won’t work as expected when using property accessors:

`+page.svelte`
```svelte
<script lang="ts">
  import { createCounter } from './counter.svelte'; // Import createCounter

  const { count, increment } = createCounter(); // Call createCounter
</script>

<button onclick={() => count++}>  
  {count}
</button>
```

This is because when you destructure `count` you’re going to get the value at the time it was created instead of the reactive value.

You can get around this by using proxied state to “wrap” the value or by returning a function:

`counter.svelte.ts`

```typescript
export function createCounterProxy() {
  let count = $state({ value: 0 })
  return { count }
}

export function createCounterFunction() {
  let count = $state(0)

  return {
    count() { return count },
    setCount(value) { count = value },
    increment() {count++} // added increment to createCounterFunction
  }
}
```

Which method you prefer is up to you:

`+page.svelte`

```svelte
<script lang="ts">
  import { createCounterProxy, createCounterFunction } from './counter.svelte'

  const { count: countProxy } = createCounterProxy()  //Renamed for clarity
  const { count: countFunction, setCount, increment } = createCounterFunction()
</script>

<button onclick={() => countProxy.value++}>
  {countProxy.value}
</button>

<button onclick={() => setCount(countFunction() + 1)}>
  {countFunction()}
</button>
```

## Using Classes For Reactive State

Creating a piece of reactive state inside a class works the same:

`counter.svelte.ts`

```typescript
export class Counter {
  count = $state(0)
  // you can also derive values
  double = $derived(this.count * 2)

  increment = () => this.count++
}
```

You can tuck the class inside a function if you want to hide the `new` keyword, but I’m just going to instantiate the class directly:

`+page.svelte`

```svelte
<script lang="ts">
  import { Counter } from './counter.svelte'

  const counter = new Counter()
</script>

<button onclick={counter.increment}>
  {counter.count}
</button>
```

Notice how you don’t have to specify a getter and setter for `count` since Svelte does that for you unless you want to:

`counter.svelte.ts`

```typescript
export class Counter {
  // make count private
  #count = $state(0)

  // create property accessors
  get count() {return this.#count }
  set count(value) { this.#count = value }
}
```

If you’re using TypeScript you can use type assertion to type a reactive value inside a class:
`example.svelte.ts`

```typescript
export class Example {
  example = $state() as Type // Replace Type with your actual type
}
```

## Doing Side Effects

If you need to do a side effect like writing to local storage or updating the DOM you can use `$effect` to track when a value updates:
`example.svelte.ts`

```typescript
export function createCounter() {
  let count = $state({ value: 0 }) // added let

  $effect(() => {
    console.log(count.value)
  })

  return { count }
}

export class Counter {
  count = $state({ value: 0 })

  constructor() {
    $effect(() => {
      console.log(this.count.value) //access with this.count
    })
  }
}
```

You should be careful when using functions and classes with effects inside a module outside a Svelte component because effects must have a parent effect for cleanup:

`example.svelte.ts`

```typescript
function createCounter() {
  let count = $state({ value: 0 }) //added let

  $effect(() => {
    console.log(count.value)
  })

  return { count }
}

// ⛔️ `$effect` can only be used inside an effect
// (e.g. during component initialisation)
const counter = createCounter()
```
If you run into that problem you have to wrap the effect with a root effect:

`example.svelte.ts`

```typescript
function createCounter() {
  let count = $state({ value: 0 }) //added let

  $effect.root(() => {
    $effect(() => {
      console.log(count.value)
    })
  })

  return { count }
}

// 👍️ no problem
const counter = createCounter()
```

You can avoid this problem and do side effects when you read and write to the reactive value:

`example.svelte.ts`

```typescript
export class Counter {
  #count = $state(0)

  get count() {
    console.log(this.#count)
    return this.#count
  }

  set count(value) {
    console.log(value)
    this.#count = value
  }
}
```
