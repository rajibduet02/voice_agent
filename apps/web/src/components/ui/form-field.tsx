import { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

type FormFieldProps = {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
};

export function FormField({ label, htmlFor, hint, error, children }: FormFieldProps) {
  return (
    <label htmlFor={htmlFor} className="block space-y-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
      {hint && !error ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      {error ? (
        <span className="block text-xs text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

const controlClassName =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={controlClassName} {...props} />;
}

export function TextSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={controlClassName} {...props} />;
}

export function TextTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${controlClassName} min-h-24 resize-y`} {...props} />;
}
