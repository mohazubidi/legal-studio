import { KeyRound } from "lucide-react";
import { Brand } from "./brand";

/**
 * Rendered instead of the workspace when Supabase is not configured.
 * The workspace is never shown without a verified session.
 */
export function SetupRequired() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-6 py-4">
          <Brand />
        </div>
        <div className="space-y-4 px-6 py-6">
          <div className="flex items-center gap-2 text-verify">
            <KeyRound className="size-5" aria-hidden />
            <h1 className="text-lg font-semibold text-foreground">يتطلب الإعداد: المصادقة غير مهيأة</h1>
          </div>
          <p className="text-sm leading-7 text-muted-foreground">
            مساحة العمل محمية ولا تُعرض دون جلسة موثّقة. أضف متغيرات Supabase التالية إلى ملف
            <code dir="ltr" className="mx-1 rounded-sm bg-surface-muted px-1.5 py-0.5 text-xs">.env.local</code>
            ثم أعد تشغيل الخادم.
          </p>
          <pre dir="ltr" className="overflow-x-auto rounded-md border border-border bg-surface-muted p-4 text-start text-xs leading-6">
{`NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>`}
          </pre>
          <p className="text-sm leading-7 text-muted-foreground">
            ثم نفّذ ملف الترحيل
            <code dir="ltr" className="mx-1 rounded-sm bg-surface-muted px-1.5 py-0.5 text-xs">supabase/migrations/0001_profiles.sql</code>
            لإنشاء جدول الملفات الشخصية. التفاصيل في README.
          </p>
        </div>
      </div>
    </div>
  );
}
