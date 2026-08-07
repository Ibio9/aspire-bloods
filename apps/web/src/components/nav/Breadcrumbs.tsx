import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

/** Every segment but the last is a real link — the last is the current screen, marked
 * with aria-current rather than being a dead (unstyled, unclickable) link to itself. */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-espresso/80">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden="true" className="text-taupe">
                  /
                </span>
              )}
              {item.to && !isLast ? (
                <Link
                  to={item.to}
                  className="rounded-sm underline-offset-2 transition duration-150 ease-out hover:text-bronze-700 hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current={isLast ? 'page' : undefined} className={isLast ? 'font-medium text-espresso' : ''}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
