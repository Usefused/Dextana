import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FormSection,
  Notice,
  SectionHeader,
  Select,
  SettingRow,
  Switch,
  TextArea,
  TextInput,
} from './ui';
import './design-language.css';
import { InteractionExamples } from './InteractionExamples';

const colors = [
  ['Canvas', 'canvas', 'The space around your work'],
  ['Surface', 'surface', 'Cards and editable controls'],
  ['Accent', 'accent-solid', 'The next meaningful action'],
  ['Text', 'text', 'Headings and body copy'],
  ['Muted', 'muted', 'Supporting information'],
  ['Border', 'border', 'Quiet structure and separation'],
] as const;

export function DesignLanguage() {
  const [enabled, setEnabled] = useState(true);
  const [name, setName] = useState('Weekly review');
  const [cadence, setCadence] = useState('weekly');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [example, setExample] = useState(false);
  const error = attempted && !name.trim() ? 'Give this workflow a name.' : undefined;
  return (
    <div className="design-language">
      <nav className="design-index" aria-label="Component categories">
        {[
          ['Foundations', 'design-foundations'],
          ['Inputs', 'design-inputs'],
          ['Icon & text buttons', 'design-controls'],
          ['Checkboxes & selectors', 'design-selection'],
          ['Popups & modals', 'design-overlays'],
          ['Browser', 'design-browser'],
          ['Permissions', 'design-permissions'],
          ['Agent plan', 'design-plan'],
        ].map(([label, id]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>
      <Card className="design-intro">
        <Badge tone="success">Dextana foundations</Badge>
        <h2>Calm space. Clear purpose.</h2>
        <p>
          Warm surfaces, forest green accents, and room to think. Every page shares the same
          building blocks, with clear actions and familiar feedback.
        </p>
        <div className="design-principles">
          <span>
            <strong>Quiet by default</strong>Let the work take focus.
          </span>
          <span>
            <strong>Clear at a glance</strong>Make the next step obvious.
          </span>
          <span>
            <strong>Consistent in every theme</strong>Keep meaning across light and dark.
          </span>
        </div>
      </Card>

      <section id="design-foundations" aria-label="Color palette">
        <SectionHeader
          title="Color"
          description="A small palette with a purpose for every shade. Follows your appearance setting."
        />
        <div className="design-swatches">
          {colors.map(([label, token, description]) => (
            <div className="design-swatch" key={token}>
              <div className="design-swatch-color" style={{ background: `var(--dx-${token})` }} />
              <strong>{label}</strong>
              <span>{description}</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Typography and spacing">
        <SectionHeader
          title="Rhythm & hierarchy"
          description="One type family, a compact reading scale, and spacing in multiples of four."
        />
        <div className="design-grid">
          <Card>
            <div className="design-type-title">Make room for good work.</div>
            <div className="design-type-section">A clear section heading</div>
            <p className="design-type-body">
              Body text stays direct and comfortable to read. Supporting copy helps you decide what
              to do next.
            </p>
            <span className="design-caption">Caption · Details that support the work</span>
          </Card>
          <Card className="design-spacing">
            {[4, 8, 12, 16, 24, 32, 48].map((space) => (
              <div key={space}>
                <span>{space}</span>
                <i style={{ width: space }} />
                <span>
                  {space === 4
                    ? 'Fine detail'
                    : space === 16
                      ? 'Related elements'
                      : space === 32
                        ? 'Sections'
                        : ''}
                </span>
              </div>
            ))}
          </Card>
        </div>
      </section>

      <section aria-label="Button examples">
        <SectionHeader
          title="Actions"
          description="One primary action per group. Secondary and quiet actions support it."
        />
        <Card className="design-stack">
          <div className="dx-actions">
            <Button
              variant="primary"
              onClick={() => {
                setExample(true);
                setSaved(false);
              }}
            >
              Create example
            </Button>
            <Button
              onClick={() => {
                setExample(false);
                setSaved(false);
              }}
            >
              Reset example
            </Button>
            <Button
              variant="ghost"
              onClick={() => document.getElementById('design-workflow')?.focus()}
            >
              Edit details
            </Button>
            <Button variant="danger" disabled={!example} onClick={() => setExample(false)}>
              Remove example
            </Button>
          </div>
          <div className="dx-actions">
            <Button size="small" disabled>
              Unavailable
            </Button>
            <Button size="small" busy>
              Saving…
            </Button>
            <span className="design-caption">Disabled and busy actions explain their state.</span>
          </div>
          {example && (
            <Notice tone="success">
              Example created. You can remove it or edit the details below.
            </Notice>
          )}
        </Card>
      </section>

      <section id="design-inputs" aria-label="Form examples">
        <SectionHeader
          title="Inputs & preferences"
          description="Visible labels, helpful hints, and feedback beside the control."
        />
        <FormSection>
          <form
            className="design-stack"
            onSubmit={(event) => {
              event.preventDefault();
              setAttempted(true);
              setSaved(!!name.trim());
            }}
          >
            <div className="design-grid">
              <Field
                label="Workflow name"
                id="design-workflow"
                hint="Choose a short, recognizable name."
                error={error}
              >
                {(props) => (
                  <TextInput
                    {...props}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setSaved(false);
                    }}
                  />
                )}
              </Field>
              <Field label="Frequency" hint="Choose how often this example repeats.">
                {(props) => (
                  <Select
                    {...props}
                    value={cadence}
                    onChange={(event) => {
                      setCadence(event.target.value);
                      setSaved(false);
                    }}
                  >
                    <option value="daily">Every day</option>
                    <option value="weekly">Every week</option>
                    <option value="monthly">Every month</option>
                  </Select>
                )}
              </Field>
            </div>
            <Field label="Instructions" hint="Optional details for your example workflow.">
              {(props) => (
                <TextArea
                  {...props}
                  value={notes}
                  onChange={(event) => {
                    setNotes(event.target.value);
                    setSaved(false);
                  }}
                  placeholder="Start with what went well this week…"
                  rows={3}
                />
              )}
            </Field>
            <SettingRow
              title="Keep me informed"
              description="Show a notification when work is ready."
            >
              <Switch
                aria-label="Keep me informed"
                checked={enabled}
                onChange={(event) => {
                  setEnabled(event.target.checked);
                  setSaved(false);
                }}
              />
            </SettingRow>
            <div className="dx-actions">
              <Button type="submit" variant="primary">
                Save example
              </Button>
              <span className="design-caption">Examples stay on this page.</span>
            </div>
            {saved && <Notice tone="success">Example saved for this preview.</Notice>}
          </form>
        </FormSection>
      </section>

      <section aria-label="Status examples">
        <SectionHeader
          title="Status & feedback"
          description="Use words as well as color to communicate what happened."
        />
        <Card className="design-stack">
          <div className="dx-actions">
            <Badge>Draft</Badge>
            <Badge tone="success">Complete</Badge>
            <Badge tone="warning">Needs approval</Badge>
            <Badge tone="danger">Failed</Badge>
          </div>
          <Notice>Changes are stored on this device.</Notice>
          <Notice tone="warning">Review the details before continuing.</Notice>
          <Notice tone="danger">The connection failed. Check the address and try again.</Notice>
        </Card>
      </section>

      <section aria-label="Empty state example">
        <SectionHeader
          title="Room to begin"
          description="Explain what belongs here and give people a useful next step."
        />
        <EmptyState
          title="Your next workflow starts here"
          description="Create an example to explore the shared components in action."
          action={
            <Button
              onClick={() => {
                setExample(true);
                document.getElementById('design-workflow')?.focus();
              }}
            >
              Create a workflow
            </Button>
          }
        />
      </section>
      <InteractionExamples />
    </div>
  );
}
