import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';

export function Table({ className = '', ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse text-sm ${className}`} {...props} />
    </div>
  );
}

export function TableHead({ className = '', ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={className} {...props} />;
}

export function TableBody({ className = '', ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}

export function TableRow({ className = '', ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={`border-t border-taupe first:border-t-0 [thead_&]:border-t-0 ${className}`} {...props} />;
}

export function TableHeaderCell({ className = '', scope = 'col', ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope={scope} className={`eyebrow p-3 text-left ${className}`} {...props} />;
}

export function TableCell({ className = '', ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={`p-3 text-espresso ${className}`} {...props} />;
}
