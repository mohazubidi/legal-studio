export function AuthNotConfigured() {
  return (
    <div role="alert" className="mb-6 rounded-md border border-verify/30 bg-verify-soft px-3 py-2 text-sm leading-6 text-verify">
      <p>المصادقة غير مهيأة في هذه البيئة. أضف المتغيرات التالية إلى ‎.env.local‎ (انظر README):</p>
      <ul dir="ltr" className="mt-1 text-start font-mono text-xs leading-6 break-all">
        <li>NEXT_PUBLIC_SUPABASE_URL</li>
        <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
      </ul>
    </div>
  );
}
