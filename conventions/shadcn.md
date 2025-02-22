To add a Svelte Shadcn component using the CLI, you'll primarily use the `shadcn-svelte` CLI. Here's a step-by-step guide:

**Prerequisites:**

- **Node.js and npm (or pnpm, or yarn):** Make sure you have Node.js and a package manager installed. In our case WE ARE USING BUN
- **A SvelteKit project:** You should already have a SvelteKit project set up. If not, create one using:

  ```bash
  npm create svelte@latest my-shadcn-app
  cd my-shadcn-app
  npm install
  ```

**Steps:**

1.  **Initialize `shadcn-svelte`:**

    - If you haven't already, initialize `shadcn-svelte` in your project:

      ```bash
      npx shadcn-svelte@latest init
      ```

    - This command will guide you through the setup process, asking questions about your project's styling and configuration. It will also install the necessary dependencies.
    - Follow the command line prompts. You will be asked about:
      - Which style would you like to use? (e.g., `default`, `new-york`)
      - Which color would you like to use as base color?
      - Where is your global CSS file?
      - Would you like to use CSS variables for colors?
      - Where is your `tsconfig.json` file?
      - Configure component.json to use an absolute import path?

2.  **Add a component:**

    - Once initialized, you can add components using the `add` command. For example, to add a button component:

      ```bash
      npx shadcn-svelte@latest add button
      ```

    - To add multiple components at once:

      ```bash
      npx shadcn-svelte@latest add button card dialog
      ```

    - The CLI will automatically install the component's dependencies and add the component files to your project.

3.  **Use the component:**

    - Import the component into your Svelte files and use it as needed. For example, if you added a `Button` component, you might use it like this:

      ```svelte
      <script>
        import { Button } from "$lib/components/ui/button";
      </script>

      <Button>Click me</Button>
      ```

**Explanation:**

- `shadcn-svelte` is designed to be a copy-and-paste component library. When you add a component, it copies the component's source code directly into your project. This gives you full control over the component's styling and behavior.
- The CLI handles the installation of dependencies and the configuration of your project, making it easy to get started.
- The components are located by default in `$lib/components/ui/`.

**Important Notes:**

- Refer to the official `shadcn-svelte` documentation for the most up-to-date information and a complete list of available components.
- Make sure your global css file, and tsconfig.json file locations are correct when running the init command.
- `shadcn-svelte` is designed for use with Tailwind CSS. Ensure that Tailwind CSS is properly configured in your project.
- When you add a component, it might add tailwind classes to your tailwind config file. So, make sure to restart your dev server if you do not see the changes.

By following these steps, you can easily add and use `shadcn-svelte` components in your SvelteKit project.

These are all the components that we can add to our project:

accordion

alert

alert dialog

aspect ratio

avatar

badge

breadcrumb

button

calendar

card

carousel

checkbox

collapsible

combobox

command

context menu

data table

date picker

dialog

drawer

dropdown menu

form

hover card

input

label

menubar

pagination

popover

progress

radio group

range calendar

resizable

scroll area

select

separator

sheet

skeleton

slider

sonner

switch

table

tabs

textarea

toggle

toggle group

tooltip
