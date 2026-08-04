import { useState } from 'react';
import { brand, scales, status, ink, contrastRatio, WCAG_AA_TEXT, WCAG_AA_LARGE_TEXT, type MarkerStatus } from '@aspire-bloods/shared';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Checkbox } from '../../components/ui/Checkbox';
import { Radio } from '../../components/ui/Radio';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { RangeBar } from '../../components/ui/RangeBar';
import { TrendChart } from '../../components/ui/TrendChart';
import { Modal } from '../../components/ui/Modal';
import { Tabs } from '../../components/ui/Tabs';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../components/ui/Table';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Tooltip } from '../../components/ui/Tooltip';
import { Avatar } from '../../components/ui/Avatar';
import { ToastProvider, useToast } from '../../components/ui/Toast';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';

const STATUS_LIST: { key: MarkerStatus; hex: string; label: string }[] = [
  { key: 'IN_RANGE', hex: status.inRange.hex, label: status.inRange.label },
  { key: 'HIGH', hex: status.high.hex, label: status.high.label },
  { key: 'LOW', hex: status.low.hex, label: status.low.label },
  { key: 'SIGNIFICANT_HIGH', hex: status.significantHigh.hex, label: status.significantHigh.label },
  { key: 'SIGNIFICANT_LOW', hex: status.significantLow.hex, label: status.significantLow.label },
];

function ContrastPill({ ratio, min }: { ratio: number; min: number }) {
  const pass = ratio >= min;
  return (
    <span className={`tabular text-xs font-medium ${pass ? 'text-status-inRange' : 'text-status-significantHigh'}`}>
      {ratio.toFixed(2)}:1 {pass ? '✓' : '✗'} (needs {min}:1)
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-16 first:mt-0">
      <p className="eyebrow mb-4 border-b border-taupe pb-3">{title}</p>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}

function SwatchCard({ name, hex, textOn }: { name: string; hex: string; textOn: 'cream' | 'white' }) {
  const bg = textOn === 'cream' ? brand.cream : brand.white;
  return (
    <div className="rounded-card border border-taupe overflow-hidden">
      <div className="h-16" style={{ backgroundColor: hex }} />
      <div className="p-3">
        <p className="text-sm font-medium text-espresso">{name}</p>
        <p className="tabular text-xs text-espresso/70">{hex}</p>
        <div className="mt-1.5 flex flex-col gap-0.5">
          <ContrastPill ratio={contrastRatio(hex, bg)} min={WCAG_AA_TEXT} />
        </div>
      </div>
    </div>
  );
}

function ToastDemo() {
  const { show } = useToast();
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" onClick={() => show('Saved successfully.', 'success')}>
        Trigger success toast
      </Button>
      <Button variant="secondary" onClick={() => show('Something went wrong.', 'error')}>
        Trigger error toast
      </Button>
    </div>
  );
}

const trendData = [
  { sampleDate: '2025-11-01', value: 4.1, status: 'IN_RANGE' as const, referenceLow: 0.4, referenceHigh: 4 },
  { sampleDate: '2026-01-15', value: 5.8, status: 'HIGH' as const, referenceLow: 0.4, referenceHigh: 4 },
  { sampleDate: '2026-04-01', value: 12, status: 'SIGNIFICANT_HIGH' as const, referenceLow: 0.4, referenceHigh: 4 },
];

export function ComponentsShowcase() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <ToastProvider>
      <main className="min-h-screen bg-cream px-6 py-16 md:px-16">
        <TwoTierHeading eyebrow="Internal — dev only" title="Design system" />
        <p className="mt-4 max-w-2xl text-espresso">
          Token audit, status triad with contrast ratios, and every component in the library with its interactive
          states. Not part of the patient product — this route doesn't ship in production builds.
        </p>

        <Section title="Brand palette">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SwatchCard name="Bronze" hex={brand.bronze} textOn="cream" />
            <SwatchCard name="Espresso" hex={brand.espresso} textOn="cream" />
            <SwatchCard name="Cream" hex={brand.cream} textOn="white" />
            <SwatchCard name="Taupe" hex={brand.taupe} textOn="cream" />
          </div>
          <p className="text-sm text-espresso/80">
            Bronze on cream: <ContrastPill ratio={contrastRatio(brand.bronze, brand.cream)} min={WCAG_AA_LARGE_TEXT} />{' '}
            — passes for large text/UI, not small body copy. Taupe on cream:{' '}
            <ContrastPill ratio={contrastRatio(brand.taupe, brand.cream)} min={WCAG_AA_LARGE_TEXT} /> — borders/
            dividers/large decorative only, confirmed failing, never used for text.
          </p>
        </Section>

        <Section title="Status triad — with contrast ratios (brief §3.6 checkpoint)">
          <p className="text-sm text-espresso/80 max-w-2xl">
            Muted sage / ochre-clay / deep terracotta, desaturated to the same tonal weight as bronze and taupe.
            Shape carries status first (dash / chevron / double-chevron) — colour reinforces. All five pass AA text
            contrast on both cream and white.
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {STATUS_LIST.map((s) => (
              <div key={s.key} className="rounded-card border border-taupe bg-white p-4">
                <StatusBadge status={s.key} />
                <p className="tabular mt-2 text-xs text-espresso/70">{s.hex}</p>
                <div className="mt-1 flex flex-col gap-0.5">
                  <ContrastPill ratio={contrastRatio(s.hex, brand.cream)} min={WCAG_AA_TEXT} />
                  <ContrastPill ratio={contrastRatio(s.hex, brand.white)} min={WCAG_AA_TEXT} />
                </div>
              </div>
            ))}
          </div>
          <div className="max-w-md">
            <p className="mb-2 text-sm font-medium text-espresso">Range bar (status colour only on the point, band always taupe)</p>
            <Card>
              <RangeBar value={5.8} low={0.4} high={4} status="HIGH" />
            </Card>
          </div>
          <div className="max-w-md">
            <p className="mb-2 text-sm font-medium text-espresso">Trend graph — mixed statuses across a series</p>
            <Card>
              <TrendChart data={trendData} />
            </Card>
          </div>
        </Section>

        <Section title="Dark surface — bronze fails here, verified (used on the login split panel)">
          <div className="rounded-card p-8" style={{ background: `linear-gradient(to bottom right, ${brand.espresso}, ${ink})` }}>
            <p className="font-eyebrow text-xs uppercase tracking-eyebrow text-taupe">Eyebrow in taupe</p>
            <p className="mt-3 font-display italic text-3xl text-bronze-300">Aspire</p>
            <p className="mt-3 max-w-xs text-sm text-cream/70">Body copy in cream/70.</p>
          </div>
          <p className="text-sm text-espresso/80">
            Bronze itself on espresso: <ContrastPill ratio={contrastRatio(brand.bronze, brand.espresso)} min={WCAG_AA_LARGE_TEXT} /> —
            fails, both are dark. bronze-300 tint on espresso:{' '}
            <ContrastPill ratio={contrastRatio(scales.bronze[300], brand.espresso)} min={WCAG_AA_LARGE_TEXT} /> — used instead for the wordmark.
          </p>
        </Section>

        <Section title="Button — primary / secondary / ghost / destructive">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled>Disabled</Button>
            <Button loading>Loading</Button>
          </div>
          <p className="text-xs text-espresso/70">Tab to a button to see the bronze focus-visible ring (not a native outline).</p>
        </Section>

        <Section title="Input, Select, Checkbox, Radio">
          <div className="grid max-w-xl grid-cols-1 gap-5 sm:grid-cols-2">
            <Input label="Default" name="demo1" placeholder="Type something" />
            <Input label="Optional field" name="demo2" optional placeholder="Not required" />
            <Input label="With hint" name="demo3" hint="A short helper line." placeholder="…" />
            <Input label="Error state" name="demo4" error="This field is required." defaultValue="bad value" />
            <Input label="Disabled" name="demo5" disabled defaultValue="Can't edit this" />
            <Select label="Select" name="demo6">
              <option>Option one</option>
              <option>Option two</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1 max-w-md">
            <Checkbox name="demoCheck1" label="Unchecked checkbox" />
            <Checkbox name="demoCheck2" defaultChecked label="Checked checkbox" />
            <Checkbox name="demoCheck3" disabled label="Disabled checkbox" />
            <Radio name="demoRadio" value="a" defaultChecked label="Radio option A" />
            <Radio name="demoRadio" value="b" label="Radio option B" />
          </div>
        </Section>

        <Section title="Card (default / interactive hover)">
          <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <p className="font-medium text-espresso">Static card</p>
              <p className="text-sm text-espresso/80">No hover treatment — most cards.</p>
            </Card>
            <Card interactive>
              <p className="font-medium text-espresso">Interactive card</p>
              <p className="text-sm text-espresso/80">Hover me — almost-imperceptible lift, per §3.8.</p>
            </Card>
          </div>
        </Section>

        <Section title="Modal">
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            Open modal
          </Button>
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Example modal"
            footer={
              <>
                <Button variant="secondary" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setModalOpen(false)}>Confirm</Button>
              </>
            }
          >
            Esc or a click outside closes this too.
          </Modal>
        </Section>

        <Section title="Toast">
          <ToastDemo />
        </Section>

        <Section title="Tabs">
          <div className="max-w-xl">
            <Tabs
              items={[
                { id: 'a', label: 'First tab', content: <p className="text-sm text-espresso">Content for the first tab.</p> },
                { id: 'b', label: 'Second tab', content: <p className="text-sm text-espresso">Content for the second tab.</p> },
              ]}
            />
          </div>
        </Section>

        <Section title="Table">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Marker</TableHeaderCell>
                <TableHeaderCell>Value</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>Haemoglobin</TableCell>
                <TableCell className="tabular">145 g/L</TableCell>
                <TableCell>
                  <StatusBadge status="IN_RANGE" />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>LDL Cholesterol</TableCell>
                <TableCell className="tabular">4.2 mmol/L</TableCell>
                <TableCell>
                  <StatusBadge status="HIGH" />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Section>

        <Section title="Skeleton (loading state)">
          <div className="max-w-sm flex flex-col gap-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </Section>

        <Section title="EmptyState">
          <div className="max-w-md">
            <EmptyState
              title="No results yet"
              description="You haven't had any tests yet. Once you've had a sample taken, your results will appear here."
              action={<Button variant="secondary">Book a test</Button>}
            />
          </div>
        </Section>

        <Section title="Tooltip">
          <Tooltip label="This is a tooltip">
            <Button variant="secondary">Hover or focus me</Button>
          </Tooltip>
        </Section>

        <Section title="Avatar">
          <div className="flex items-center gap-4">
            <Avatar name="Demo Patient" size="sm" />
            <Avatar name="Demo Patient" size="md" />
            <Avatar name="Demo Patient" size="lg" />
          </div>
        </Section>
      </main>
    </ToastProvider>
  );
}
