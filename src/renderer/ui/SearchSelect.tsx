import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TextInput } from './index';
import { Icon } from './Icon';

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

/** Editable combobox with DOM focus kept in the input and a filtered listbox. */
export function SearchSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Search options…',
  disabled = false,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const filtered = options.filter((option) =>
    `${option.label} ${option.description ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  );
  const available = filtered.filter((option) => !option.disabled);
  const current = available[Math.min(active, available.length - 1)];
  const selected = options.find((option) => option.value === value);
  const optionId = (option: SelectOption) => `${id}-option-${options.indexOf(option)}`;
  const expanded = open && !disabled;
  useLayoutEffect(() => {
    if (!expanded) return;
    const position = () => {
      const box = input.current!.getBoundingClientRect();
      const popup = list.current!;
      popup.style.width = `${Math.min(Math.max(box.width, 240), window.innerWidth - 24)}px`;
      popup.style.left = `${Math.max(12, Math.min(box.left, window.innerWidth - popup.offsetWidth - 12))}px`;
      const below = window.innerHeight - box.bottom - 12;
      const above = box.top - 12;
      const useAbove = below < 200 && above > below;
      popup.style.maxHeight = `${Math.max(80, Math.min(280, useAbove ? above - 8 : below - 8))}px`;
      popup.style.top = `${useAbove ? Math.max(12, box.top - popup.offsetHeight - 8) : box.bottom + 8}px`;
    };
    list.current?.showPopover();
    position();
    const outside = (event: PointerEvent) => {
      if (
        !input.current?.contains(event.target as Node) &&
        !list.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    document.addEventListener('pointerdown', outside);
    return () => {
      list.current?.hidePopover();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      document.removeEventListener('pointerdown', outside);
    };
  }, [expanded, query]);
  useLayoutEffect(() => {
    if (expanded && current)
      document.getElementById(optionId(current))?.scrollIntoView({ block: 'nearest' });
  }, [expanded, current?.value]);
  function choose(option: SelectOption) {
    onChange(option.value);
    setOpen(false);
    setQuery('');
    input.current?.focus();
  }
  return (
    <div className="dx-search-select">
      <Icon name="search" />
      <TextInput
        ref={input}
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={`${id}-list`}
        aria-activedescendant={expanded && current ? optionId(current) : undefined}
        disabled={disabled}
        placeholder={placeholder}
        value={expanded ? query : (selected?.label ?? '')}
        onFocus={() => {
          setOpen(true);
          setQuery('');
          setActive(0);
        }}
        onClick={() => {
          if (!expanded) {
            setOpen(true);
            setQuery('');
            setActive(0);
          }
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            if (expanded) {
              event.preventDefault();
              event.stopPropagation();
            }
            setOpen(false);
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!expanded) {
              setOpen(true);
              setQuery('');
              setActive(0);
            } else
              setActive((index) =>
                available.length
                  ? (index + (event.key === 'ArrowDown' ? 1 : -1) + available.length) %
                    available.length
                  : 0,
              );
          } else if (expanded && event.key === 'Enter') {
            event.preventDefault();
            if (current) choose(current);
          } else if (expanded && event.key === 'Home') {
            event.preventDefault();
            setActive(0);
          } else if (expanded && event.key === 'End') {
            event.preventDefault();
            setActive(Math.max(0, available.length - 1));
          }
        }}
      />
      {createPortal(
        <div
          ref={list}
          id={`${id}-list`}
          popover="manual"
          role="listbox"
          aria-label={`${label} options`}
          className="dx-select-options"
          onPointerDown={(event) => event.preventDefault()}
        >
          {filtered.map((option) => (
            <div
              key={option.value}
              id={optionId(option)}
              role="option"
              aria-selected={value === option.value}
              aria-disabled={option.disabled || undefined}
              data-active={current?.value === option.value}
              onPointerMove={() => {
                if (!option.disabled) setActive(available.indexOf(option));
              }}
              onClick={() => {
                if (!option.disabled) choose(option);
              }}
            >
              <span>
                <strong>{option.label}</strong>
                {option.description && <small>{option.description}</small>}
              </span>
              {value === option.value && <Icon name="check" />}
            </div>
          ))}
          {!filtered.length && (
            <div className="dx-select-empty" role="status">
              No matching options.
            </div>
          )}
        </div>,
        input.current?.closest('dialog, [data-overlay-root]') ?? document.body,
      )}
    </div>
  );
}
