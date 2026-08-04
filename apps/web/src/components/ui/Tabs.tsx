import { useState, type ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export function Tabs({ items, defaultTab }: { items: TabItem[]; defaultTab?: string }) {
  const [active, setActive] = useState(defaultTab ?? items[0]?.id);

  return (
    <div>
      <div role="tablist" className="flex gap-1 border-b border-taupe">
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => setActive(item.id)}
              className={`relative px-4 py-2.5 text-sm font-medium transition duration-150 ease-out ${
                isActive ? 'text-espresso' : 'text-espresso/60 hover:text-espresso'
              }`}
            >
              {item.label}
              {isActive && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-bronze" />}
            </button>
          );
        })}
      </div>
      <div className="motion-safe:animate-fadeIn pt-6">{items.find((item) => item.id === active)?.content}</div>
    </div>
  );
}
