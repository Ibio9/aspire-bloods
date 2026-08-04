import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export function Tabs({ items, defaultTab }: { items: TabItem[]; defaultTab?: string }) {
  const [active, setActive] = useState(defaultTab ?? items[0]?.id);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function activate(id: string) {
    setActive(id);
    tabRefs.current[id]?.focus();
  }

  // Roving tabindex + arrow-key movement per the WAI-ARIA tabs pattern: Left/Right (Home/End too)
  // move focus AND selection together, since these tabs show their content immediately rather
  // than requiring a separate activation step.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const index = items.findIndex((i) => i.id === active);
    if (index === -1) return;
    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % items.length;
    else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + items.length) % items.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = items.length - 1;
    if (nextIndex === null) return;
    e.preventDefault();
    activate(items[nextIndex].id);
  }

  return (
    <div>
      <div role="tablist" onKeyDown={onKeyDown} className="flex gap-1 border-b border-taupe">
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              ref={(el) => {
                tabRefs.current[item.id] = el;
              }}
              id={`tab-${item.id}`}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`tabpanel-${item.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => activate(item.id)}
              className={`relative min-h-[44px] px-4 py-2.5 text-sm font-medium transition duration-150 ease-out ${
                isActive ? 'text-espresso' : 'text-espresso/60 hover:text-espresso'
              }`}
            >
              {item.label}
              {isActive && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-bronze" />}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`tabpanel-${item.id}`}
          aria-labelledby={`tab-${item.id}`}
          hidden={item.id !== active}
          className="motion-safe:animate-fadeIn pt-6"
        >
          {item.id === active && item.content}
        </div>
      ))}
    </div>
  );
}
