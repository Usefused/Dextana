import { useState } from 'react';
import {
  AgentPlan,
  BrowserTabs,
  BrowserToolbar,
  Button,
  Card,
  Checkbox,
  CheckboxCard,
  CheckboxField,
  DropdownMenu,
  Field,
  Icon,
  IconButton,
  Modal,
  Notice,
  PermissionCard,
  Popover,
  SearchSelect,
  SectionHeader,
  Select,
  Switch,
  Tagline,
  TextInput,
} from './ui';

const modelOptions = [
  {
    value: 'everyday',
    label: 'Everyday assistant',
    description: 'Quick answers and routine tasks',
  },
  {
    value: 'research',
    label: 'Research assistant',
    description: 'Careful reading and deeper analysis',
  },
  { value: 'writing', label: 'Writing assistant', description: 'Drafting, editing, and tone' },
  { value: 'offline', label: 'Local assistant', description: 'Not connected', disabled: true },
];

export function InteractionExamples() {
  const [model, setModel] = useState('everyday');
  const [checked, setChecked] = useState(false);
  const [cards, setCards] = useState(['summary', 'browser']);
  const [modal, setModal] = useState(false);
  const [modalName, setModalName] = useState('Weekly review');
  const [notify, setNotify] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [permission, setPermission] = useState<'pending' | 'allowed' | 'denied'>('pending');
  const [planStatus, setPlanStatus] = useState<'proposed' | 'approved' | 'declined'>('proposed');
  const [tabs, setTabs] = useState([
    { id: 'report', title: 'Weekly report' },
    { id: 'notes', title: 'Research notes' },
  ]);
  const [tabId, setTabId] = useState('report');
  const [refreshes, setRefreshes] = useState(0);
  return (
    <>
      <section id="design-controls" aria-label="Icon and text buttons">
        <SectionHeader
          title="Icons, text & taglines"
          description="A consistent icon size, a visible action label, and concise supporting language."
        />
        <Card className="design-stack">
          <Tagline>Less busywork. More momentum.</Tagline>
          <div className="dx-actions">
            <Button variant="primary" onClick={() => setFeedback('New example started.')}>
              <Icon name="plus" />
              New workflow
            </Button>
            <Button onClick={() => setFeedback('Example details opened.')}>
              <Icon name="file" />
              View details
              <Icon name="arrow" />
            </Button>
            <Button variant="ghost" onClick={() => setFeedback('Text action selected.')}>
              Text button
            </Button>
            <IconButton
              label="Refresh examples"
              icon="refresh"
              onClick={() => setFeedback('Examples refreshed.')}
            />
            <IconButton label="Unavailable example action" icon="plus" disabled />
          </div>
          {feedback && <Notice>{feedback}</Notice>}
        </Card>
      </section>

      <section id="design-selection" aria-label="Checkbox and selector examples">
        <SectionHeader
          title="Checkboxes & selection"
          description="Choose a single option, several items, or an entire card. Labels stay clickable."
        />
        <Card className="design-stack">
          <div className="dx-actions">
            <Checkbox
              aria-label="Standalone example checkbox"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
            />
            <span className="design-caption">
              Plain checkbox · {checked ? 'Checked' : 'Unchecked'}
            </span>
            <Checkbox aria-label="Disabled checked example" checked disabled />
            <Checkbox aria-label="Disabled unchecked example" checked={false} disabled />
          </div>
          <CheckboxField
            label="Include a short summary"
            description="Start the report with the key points and next steps."
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
          />
          <div className="design-grid design-choice-grid">
            {[
              {
                id: 'summary',
                icon: 'plan' as const,
                selection: 'checkbox' as const,
                label: 'Weekly summary',
                description: 'A concise overview of completed work.',
              },
              {
                id: 'research',
                icon: 'file' as const,
                selection: 'checkbox' as const,
                label: 'Research notes',
                description: 'Sources, findings, and open questions.',
              },
              {
                id: 'browser',
                icon: 'browser' as const,
                selection: 'switch' as const,
                label: 'Browser tools',
                description: 'Read pages and gather useful sources.',
              },
              {
                id: 'documents',
                icon: 'file' as const,
                selection: 'switch' as const,
                label: 'Document tools',
                description: 'Create reports and organize your files.',
              },
            ].map((item) => (
              <CheckboxCard
                key={item.id}
                label={item.label}
                description={item.description}
                icon={<Icon name={item.icon} />}
                selection={item.selection}
                actions={
                  <Button
                    size="small"
                    icon={<Icon name="gear" />}
                    aria-label={`Settings for ${item.label}`}
                    onClick={() => {
                      setModalName(item.label);
                      setModal(true);
                    }}
                  >
                    Settings
                  </Button>
                }
                accessory={
                  <IconButton
                    label={`View ${item.label} details`}
                    icon="external"
                    onClick={() => {
                      setModalName(item.label);
                      setModal(true);
                    }}
                  />
                }
                checked={cards.includes(item.id)}
                onChange={(event) =>
                  setCards((values) =>
                    event.target.checked
                      ? [...values, item.id]
                      : values.filter((value) => value !== item.id),
                  )
                }
              />
            ))}
          </div>
          <CheckboxCard
            label="Archived template"
            icon={<Icon name="file" />}
            description="This template is no longer available."
            disabled
          />
          <div className="design-grid">
            <div className="design-stack">
              <label className="design-control-label" htmlFor="example-approval-mode">
                Native selector
              </label>
              <Select
                id="example-approval-mode"
                aria-label="Example approval mode"
                defaultValue="ask"
              >
                <option value="ask">Ask for approval</option>
                <option value="allow">Allow for this example</option>
              </Select>
            </div>
            <div className="design-stack">
              <span className="design-control-label">Searchable select</span>
              <SearchSelect
                label="Example assistant"
                value={model}
                options={modelOptions}
                onChange={setModel}
              />
            </div>
          </div>
        </Card>
      </section>

      <section id="design-overlays" aria-label="Popup and modal examples">
        <SectionHeader
          title="Dropdowns, popups & modals"
          description="Small choices stay nearby. Focused edits open in a dialog. Escape returns to your work."
        />
        <Card>
          <div className="dx-actions">
            <DropdownMenu
              label="Example actions"
              icon="more"
              items={[
                { label: 'Rename example', icon: 'file', action: () => setModal(true) },
                {
                  label: 'Duplicate example',
                  icon: 'plus',
                  action: () => setFeedback('Example duplicated.'),
                },
                {
                  label: 'Delete example',
                  icon: 'close',
                  danger: true,
                  action: () => setFeedback('Example deleted.'),
                },
              ]}
            />
            <Popover label="Preview preferences" icon="settings">
              {(close) => (
                <div className="design-stack">
                  <h2>Preview preferences</h2>
                  <CheckboxField
                    label="Notify when ready"
                    checked={notify}
                    onChange={(event) => setNotify(event.target.checked)}
                  />
                  <Button onClick={close}>Done</Button>
                </div>
              )}
            </Popover>
            <Button onClick={() => setModal(true)}>
              <Icon name="file" />
              Open example modal
            </Button>
          </div>
        </Card>
        {modal && (
          <Modal
            title="Edit example workflow"
            description="Changes affect this preview only."
            close={() => setModal(false)}
          >
            <form
              className="design-stack"
              onSubmit={(event) => {
                event.preventDefault();
                setModal(false);
                setFeedback('Workflow updated in preview.');
              }}
            >
              <Field label="Example workflow name">
                {(props) => (
                  <TextInput
                    {...props}
                    autoFocus
                    required
                    value={modalName}
                    onChange={(event) => setModalName(event.target.value)}
                  />
                )}
              </Field>
              <SearchSelect
                label="Modal assistant"
                value={model}
                options={modelOptions}
                onChange={setModel}
              />
              <div className="dx-actions">
                <Button type="submit" variant="primary">
                  Save preview
                </Button>
                <Button onClick={() => setModal(false)}>Cancel</Button>
              </div>
            </form>
          </Modal>
        )}
      </section>

      <section id="design-browser" aria-label="Browser component examples">
        <SectionHeader
          title="Browser components"
          description="Familiar tabs, an address field, and compact controls for browsing alongside your work."
        />
        <Card className="design-browser-preview">
          <div className="design-browser-heading">
            <Tagline>Activity browser</Tagline>
            <IconButton
              label="Add preview tab"
              icon="plus"
              onClick={() => {
                const id = `example-${Date.now()}`;
                setTabs((values) => [...values, { id, title: 'New tab' }]);
                setTabId(id);
              }}
            />
          </div>
          <BrowserTabs
            tabs={tabs}
            selectedId={tabId}
            select={setTabId}
            close={(id) => {
              const remaining = tabs.filter((tab) => tab.id !== id);
              setTabs(remaining);
              if (tabId === id) setTabId(remaining[0]?.id ?? '');
            }}
          />
          <BrowserToolbar
            url={tabs.length ? `https://example.com/${tabId}` : ''}
            disabled={!tabs.length}
            refresh={() => setRefreshes((value) => value + 1)}
          />
          <div className="design-browser-content">
            <Icon name="browser" />
            <h3>{tabs.find((tab) => tab.id === tabId)?.title ?? 'No open tabs'}</h3>
            <p>This is a browser component preview.</p>
            {refreshes > 0 && (
              <span role="status">
                Preview refreshed {refreshes} {refreshes === 1 ? 'time' : 'times'}.
              </span>
            )}
          </div>
        </Card>
      </section>

      <section id="design-permissions" aria-label="Permission component examples">
        <SectionHeader
          title="Permissions"
          description="Show the requested action and its scope before asking for a decision."
        />
        {permission === 'pending' ? (
          <PermissionCard
            aria-label="Example permission"
            kind="Browser"
            title="Allow Dextana to read this page?"
            description="Review the address before continuing."
            actions={
              <>
                <Button variant="primary" onClick={() => setPermission('allowed')}>
                  Allow example
                  <Icon name="arrow" />
                </Button>
                <Button onClick={() => setPermission('denied')}>Deny example</Button>
              </>
            }
          >
            <div className="permission-target">
              <Icon name="browser" />
              <span>https://example.com/weekly-report</span>
            </div>
          </PermissionCard>
        ) : (
          <div className="design-stack">
            <Notice tone={permission === 'allowed' ? 'success' : 'neutral'}>
              {permission === 'allowed'
                ? 'Permission allowed in this preview.'
                : 'Permission denied in this preview.'}
            </Notice>
            <Button onClick={() => setPermission('pending')}>Reset permission example</Button>
          </div>
        )}
      </section>

      <section id="design-plan" aria-label="Agent plan example">
        <SectionHeader
          title="Agent plan"
          description="A clear sequence of steps, the access it needs, and an explicit starting point."
        />
        <AgentPlan
          title="Prepare the supplier contact"
          status={planStatus}
          statusLabel={
            planStatus === 'proposed'
              ? 'Awaiting approval'
              : planStatus === 'approved'
                ? 'In progress'
                : 'Declined'
          }
          steps={[
            {
              title: 'Read the supplier’s details',
              description: 'In-app browser · Contact page',
              icon: 'file',
            },
            {
              title: 'Prepare the contact',
              description: 'CRM integration · Awaiting your review',
              icon: 'target',
            },
          ]}
          permissions={
            <details className="work-plan-scope" open>
              <summary>
                <Icon name="shield" />
                <span>Included permissions</span>
              </summary>
              <div className="work-plan-scope-body">
                <p>Read the supplier contact page and prepare a draft CRM contact.</p>
                <p>Applies to this preview only.</p>
              </div>
            </details>
          }
          actions={
            planStatus === 'proposed' ? (
              <>
                <Button variant="primary" onClick={() => setPlanStatus('approved')}>
                  Approve example plan
                  <Icon name="arrow" />
                </Button>
                <Button onClick={() => setPlanStatus('declined')}>Decline example plan</Button>
              </>
            ) : (
              <Button onClick={() => setPlanStatus('proposed')}>Reset plan example</Button>
            )
          }
        />
      </section>
    </>
  );
}
