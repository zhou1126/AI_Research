export function LabNavigation({ active }: { active: 'chess' | 'room' | 'notebook' }) {
  return <nav className="lab-navigation" aria-label="Decision labs"><a href="/notebook" aria-current={active === 'notebook' ? 'page' : undefined}>JEV notebook</a><a href="/" aria-current={active === 'chess' ? 'page' : undefined}>Chess lab</a><a href="/room" aria-current={active === 'room' ? 'page' : undefined}>Room planning lab</a></nav>;
}
