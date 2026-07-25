export type TabId = 'portfolio' | 'options' | 'ledger' | 'settings';

const TABS: { id: TabId; label: string }[] = [
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'options', label: 'Options' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'settings', label: 'Settings' },
];

export function TabBar({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={active === t.id ? 'active' : ''}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
