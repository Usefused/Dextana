import { useState } from 'react';
import { Button, Field, Icon, TextArea } from './ui';
import type { Message } from '../shared/types';

export function EditMessage({
  activityId,
  message,
  available,
  cancel,
  saved,
}: {
  activityId: string;
  message: Message;
  available: boolean;
  cancel: () => void;
  saved: () => void;
}) {
  return (
    <MessageEditor
      initialText={message.content}
      label="Edit your last message"
      hint="This replaces the latest response. Completed actions aren’t undone."
      saveLabel="Save and resend"
      available={available}
      cancel={cancel}
      saved={saved}
      unavailable="Stop the current run and finish queued messages before editing the latest message."
      save={(prompt) => window.dextana.editMessage({ activityId, messageId: message.id, prompt })}
    />
  );
}

export function MessageEditor({
  initialText,
  label,
  hint,
  saveLabel,
  available,
  unavailable,
  cancel,
  saved,
  save,
}: {
  initialText: string;
  label: string;
  hint: string;
  saveLabel: string;
  available: boolean;
  unavailable?: string;
  cancel: () => void;
  saved: () => void;
  save: (prompt: string) => Promise<unknown>;
}) {
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changed = text.trim() !== initialText;
  async function submit() {
    if (busy || !available || !text.trim() || !changed) return;
    setBusy(true);
    setError('');
    try {
      await save(text);
      saved();
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  }
  return (
    <form
      className="message-edit-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          void submit();
        }
      }}
    >
      <Field label={label} hint={hint} error={error}>
        {(props) => (
          <TextArea
            {...props}
            autoFocus
            value={text}
            disabled={busy}
            maxLength={32000}
            required
            rows={4}
            onChange={(event) => setText(event.target.value)}
          />
        )}
      </Field>
      {!available && unavailable && <p role="status">{unavailable}</p>}
      <div className="dx-actions message-edit-actions">
        <Button variant="secondary" size="small" disabled={busy} onClick={cancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="small"
          icon={<Icon name="check" />}
          disabled={busy || !available || !text.trim() || !changed}
        >
          {busy ? 'Saving…' : saveLabel}
        </Button>
      </div>
    </form>
  );
}
