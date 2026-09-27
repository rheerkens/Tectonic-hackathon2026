export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

export function Avatar({ name, color, size = 28, title }: { name: string; color: string; size?: number; title?: string }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.4) }}
      title={title ?? name}
      aria-label={title ?? name}
      role="img"
    >
      {initials(name)}
    </span>
  );
}
