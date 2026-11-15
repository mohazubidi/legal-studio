import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  titleEn?: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, titleEn, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {titleEn ? (
          <p lang="en" className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {titleEn}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
