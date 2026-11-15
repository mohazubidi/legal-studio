/**
 * A file name in RTL text. The extension is isolated as a left-to-right run so
 * names like «مكالمة العميل (مثال).m4a» are not reordered into «m4a.(مثال)…».
 */
export function FileName({ name, className }: { name: string; className?: string }) {
  const dot = name.lastIndexOf(".");
  const hasExtension = dot > 0 && dot >= name.length - 6 && /^[A-Za-z0-9]+$/.test(name.slice(dot + 1));
  if (!hasExtension) return <bdi className={className}>{name}</bdi>;
  return (
    <bdi className={className}>
      <bdi dir="rtl">{name.slice(0, dot)}</bdi>
      <bdi dir="ltr">{name.slice(dot)}</bdi>
    </bdi>
  );
}
