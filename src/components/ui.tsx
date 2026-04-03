import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes
} from 'react';

export function AppButton({
  className = '',
  variant = 'primary',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button className={`app-button ${variant} ${className}`} type={type} {...props} />;
}

export function AppInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`app-input ${props.className ?? ''}`} {...props} />;
}

export function AppTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`app-input app-textarea ${props.className ?? ''}`} {...props} />;
}

export function AppLabel({ children, className = '', ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={`app-label ${className}`.trim()} {...props}>
      {children}
    </label>
  );
}

export function AppCard({ children, className = '', ...props }: HTMLAttributes<HTMLElement> & { children?: ReactNode }) {
  return (
    <section className={`app-card ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}

export function StatusPill({
  children,
  tone = 'neutral'
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}
