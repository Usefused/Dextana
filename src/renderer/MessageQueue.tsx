import { useState } from 'react';
import type { QueuedMessage } from '../shared/types';
import { Button, IconButton } from './ui';
import { MessageEditor } from './EditMessage';

export function MessageQueue({
  activityId,
  items,
  running,
  disabled,
  steer,
  failed,
}: {
  activityId: string;
  items: QueuedMessage[];
  running: boolean;
  disabled: boolean;
  steer: (id: string) => void;
  failed: (message: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="message-queue" role="region" aria-label="Queued messages">
      <div className="queue-label">
        {running ? 'Queued' : 'Queue paused'} · {items.length}
      </div>
      {items.map((item, index) => (
        <QueueItem
          key={item.id}
          activityId={activityId}
          item={item}
          number={index + 1}
          disabled={disabled}
          steer={steer}
          failed={failed}
        />
      ))}
    </div>
  );
}

function QueueItem({
  activityId,
  item,
  number,
  disabled,
  steer,
  failed,
}: {
  activityId: string;
  item: QueuedMessage;
  number: number;
  disabled: boolean;
  steer: (id: string) => void;
  failed: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  async function remove() {
    if (disabled || deleting) return;
    setDeleting(true);
    try {
      await window.dextana.updateQueuedMessage({
        activityId,
        messageId: item.id,
        action: 'delete',
      });
    } catch (error) {
      failed((error as Error).message);
      setDeleting(false);
    }
  }
  return (
    <div className="queued-message">
      <span>{number}.</span>
      <div className="queued-message-body">
        {editing ? (
          <MessageEditor
            initialText={item.prompt}
            label="Edit queued message"
            hint="This message keeps its place in the queue."
            saveLabel="Save changes"
            available={!disabled}
            cancel={() => setEditing(false)}
            saved={() => setEditing(false)}
            save={(prompt) =>
              window.dextana.updateQueuedMessage({
                activityId,
                messageId: item.id,
                action: 'edit',
                prompt,
              })
            }
          />
        ) : (
          <p>{item.prompt}</p>
        )}
      </div>
      {!editing && (
        <div className="queued-message-actions">
          <IconButton
            variant="plain"
            icon="edit"
            label={`Edit queued message ${number}`}
            disabled={disabled || deleting}
            onClick={() => setEditing(true)}
          />
          <IconButton
            variant="plain"
            icon="trash"
            label={`Delete queued message ${number}`}
            disabled={disabled || deleting}
            onClick={() => void remove()}
          />
          <Button
            variant="layout"
            className="queue-steer"
            disabled={disabled || deleting}
            title="Stop the current response and apply this message now"
            onClick={() => steer(item.id)}
          >
            Steer
          </Button>
        </div>
      )}
    </div>
  );
}
