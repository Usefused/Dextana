# Dextana design language

Dextana combines locally bundled IBM Plex Sans typography with warm neutral surfaces and restrained forest green actions. All standard surfaces and controls share an 8 px corner radius through `--dx-radius`; the size aliases resolve to that same token. Form surfaces use neutral gray in both themes, with green reserved for actions, selection, and status. Headings and buttons use firm weights; body text remains calm and readable. IBM Plex Sans is bundled with its license in `assets/fonts/ibm-plex-sans`, so the app does not fall back to a rounder system font or request fonts over the network. Cards have flat surfaces without decorative shadows. This is the shared interpretation of the requested Stripe/Claude blend. Developer examples remain in `src/renderer/DesignLanguage.tsx`; the gallery is not part of Settings.

## Shared foundations

`src/renderer/ui/tokens.css` owns semantic colors, type sizes, spacing, corner radii, control height, and motion. Use `--dx-*` tokens instead of adding page-specific colors or dimensions. Color roles adapt through `light-dark()` to the existing System, Light, and Dark appearance settings. Existing specialized chat surfaces still use legacy `--dark-*` tokens while they are migrated.

Use `canvas` for the app background, `surface` for cards and controls, `text` for content, and `muted` for supporting copy. `accent-solid` with `on-accent` identifies primary actions. Status colors always accompany visible text. Use the 4, 8, 12, 16, 24, 32, and 48 px spacing scale. Standard controls are 38 px tall; small actions are 30 px tall.

## Components

Import from `src/renderer/ui`. Native element props, events, and React 19 refs pass through the controls.

| Component                         | Purpose                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `PageHeader`                      | One page title, description, and optional actions                                 |
| `SectionHeader`                   | Section title, supporting copy, and actions                                       |
| `SettingRow`                      | Preference title and description beside a control                                 |
| `Button`                          | Primary, secondary, ghost, plain, and danger actions; small and medium sizes; busy state |
| `Field`                           | Explicit label and associated hint or validation error                            |
| `TextInput`, `TextArea`, `Select` | Native form controls with consistent styling                                      |
| `Switch`                          | Native checkbox keyboard behavior with switch semantics                           |
| `Card`                            | Bordered content surface                                                          |
| `Badge`                           | Compact neutral, success, warning, or danger status                               |
| `Notice`                          | Status feedback; danger messages use an alert role                                |
| `EmptyState`                      | Explanation and optional next action when content is absent                       |

| `Icon`, `IconButton` | Consistent line icons, icon-only actions with required accessible labels |
| `Tagline` | Compact supporting brand copy |
| `Checkbox` | Plain native checkbox |
| `CheckboxField` | Clickable label and supporting text beside a checkbox |
| `CheckboxCard` | Selectable card with a corner checkbox or switch, icon, and separate footer actions |
| `SearchSelect` | Searchable combobox with keyboard navigation and disabled options |
| `DropdownMenu` | Action menu with arrow-key navigation |
| `Popover` | Anchored, dismissible popup in the native top layer |
| `Modal` | Native modal dialog with focus containment, focus return, and busy dismissal protection |
| `BrowserTabs`, `BrowserToolbar` | Browser tab navigation, close actions, address field, and refresh |
| `ReviewCard`, `PermissionCard` | Shared decision surfaces with explicit actions and scope |
| `PlanSteps`, `AgentPlan` | Ordered steps, plan status, permissions, approval actions, and receipt |

```tsx
import { Button, Card, Field, PageHeader, TextInput } from './ui';

<>
  <PageHeader title="Workflows" description="Recurring work, in one place." />
  <Card>
    <form onSubmit={saveWorkflow}>
      <Field label="Name" hint="Choose a recognizable name." error={error}>
        {(props) => <TextInput {...props} value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Button type="submit" variant="primary" busy={saving}>
        {saving ? 'Saving…' : 'Save workflow'}
      </Button>
    </form>
  </Card>
</>;
```

Buttons default to `type="button"`; explicitly set `type="submit"` for form submission. A busy button disables repeated activation; provide meaningful busy text. Give standalone controls an accessible name, and use `Field` for visible labels and connected validation. Switches must have a label or `aria-label`. Use one primary action per group and a danger action for deletion.

Use `<IconButton variant="plain" icon="edit" label="Edit last message" />` for an icon-only action without a background or visible border. The plain variant remains transparent on hover, changes the icon color for feedback, and retains the shared keyboard focus ring and disabled state. Message editing uses this pattern below the bubble, revealed on hover or keyboard focus.

`IconButton` requires a `label`; icons are decorative and never replace the accessible name. `CheckboxField` and `CheckboxCard` use native labels, so both the text and checkbox toggle the selection. Keep links and buttons outside these labels. `CheckboxCard` provides `icon`, `actions`, and `accessory` slots, with `selection="switch"` for enable/disable cards. Its selected state keeps a neutral surface and adds a thin accent outline. Footer actions sit outside the label so Settings never changes selection. Use `Button size="small" icon={<Icon name="gear" />}` for compact icon-and-text actions. Disabled controls retain native behavior.

`SearchSelect` accepts unique `{ value, label, description?, disabled? }` options. Typing filters the list, arrow keys move the active option, Enter selects, Escape restores the committed value, and Tab leaves the control. Lists render in the native top layer to avoid clipping; inside a dialog they remain descendants of that dialog. Custom popup containers can use `data-overlay-root` to preserve their outside-click boundary.

`Modal` uses `showModal()` for focus containment and restores the trigger when closed. Its `busy` state blocks close, Escape, and backdrop dismissal. `Popover` uses the native Popover API for Escape and outside-click dismissal. `DropdownMenu` adds arrow, Home, and End navigation. Keep the app's business logic outside these presentation components: displaying a permission or plan never grants access by itself.

`PlanSteps` renders compact rows with an icon tile, step title, muted detail line, and a trailing dot. It accepts plain strings or `PlanStep` objects with `title`, optional `description`, `icon`, and explicit `status`. Unknown step progress is never inferred from the overall plan status: string-only backend plans use numbered supporting text, and their dots are decorative. Rich step statuses have accessible text equivalents. Plan permissions and approval actions remain outside the step list.

## Adoption and verification

All settings pages share `PageHeader`. Models, appearance, skills, usage, connectors, Fused settings, and scheduled jobs use shared controls. The shell uses the shared font and canvas roles. The model picker uses `SearchSelect`. Browser views use the shared tabs, toolbar, and icon buttons. Permission requests and agent plans use `PermissionCard` and `AgentPlan` while retaining their existing approval handlers. Connector dialogs use `Modal`, and tool selection uses `CheckboxCard`. Navigation, the chat composer, and rich content use shared controls and surface tokens with layouts appropriate to their content. The marketing website is a separate application and is not migrated here.

Page CSS should describe layout, not redefine a shared control's colors, padding, or type. Load `ui/tokens.css` before application styles and `ui/components.css` after them. The shared controls currently use scoped specificity to coexist with legacy element selectors; remove those old rules as their last consumers migrate.

Run `npm run build`, then `npx playwright test tests/e2e/design-language.spec.ts --project=desktop` with the normal backend build available. The Electron test checks form validation, keyboard switching, disabled states, identical action colors across pages, both themes, compact layout, labeled and card checkboxes, searchable options, popup dismissal, modal focus containment and return, browser tab navigation, permission decisions, and plan state. Existing plan, browser-refresh, connector, and reasoning tests cover the migrated app flows. Screenshots are written to Playwright's output directory.

Settings forms use `FormSection` and `Field` directly on the page, with labels above controls and a single divider before final actions. Avoid wrapping forms or setup sections in nested cards. Native selects and searchable select inputs are 32 px high; option rows use 4 px vertical padding, with descriptions on a compact second line. Selection cards remain a separate, intentional choice pattern.

For prominent settings such as the model provider and address, use `Field variant="card"`. It places the label and hint beside the control on a wide theme-tinted surface, with text inputs integrated into the card. Selects retain a contrasting surface, a visible border, and an accent arrow so the choice remains obvious. It stacks on smaller windows and retains an explicit keyboard focus outline.


## Application adoption

All renderer buttons, text inputs, selects, checkboxes, switches, sliders, and textareas route through `src/renderer/ui`. Structural buttons such as sidebar rows, browser tabs, and disclosure controls use `Button variant="layout"`, which retains the containing layout while sharing typography, radius, focus, and disabled behavior. Visible form and action buttons use the standard variants and icon slots.

Actual tool permissions use `CheckboxCard` with the policy selector and input details outside its clickable label. Enabling a tool still selects Ask every time; automatic permission requires its explicit policy choice. Fused token preferences, integration enablement, and scheduled-job enablement use `CheckboxField`. Model/reasoning and chat settings use `Popover`; skill editing and login transfer use `Modal`. Scheduled-job results use `Card`, actual approval prompts use `PermissionCard`, and real proposed plans use `AgentPlan`. The same tokens and components are imported by the gallery and the application; the gallery is not a separate style implementation.
Interactive A2UI questions use `QuestionForm` with shared selects, text inputs,
text areas, and `CheckboxCard compact`. Compact checkbox cards keep the label and
selection control on one row, preserving the shared borders, selected state and
8px corners. The form's Send reply button continues the conversation; permission
and plan approval controls remain separate components.

Connection authentication uses `AuthenticationFields` for both Models and MCP setup.
Keep header and body editors in shared gray `Field variant="card"` surfaces, with
labels and hints above full-width modal controls. Use the existing 8px control radius,
theme tokens and icon buttons. Credential values are never prefilled from saved state;
show the shared saved-configuration notice instead.
