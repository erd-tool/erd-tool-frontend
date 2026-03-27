import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

export function AppButton({
  className = '',
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  return <button className={`app-button ${variant} ${className}`} {...props} />;
}

export function AppInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`app-input ${props.className ?? ''}`} {...props} />;
}

export function AppTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`app-input app-textarea ${props.className ?? ''}`} {...props} />;
}

export function AppLabel({ children }: { children: ReactNode }) {
  return <label className="app-label">{children}</label>;
}

export function AppCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`app-card ${className}`}>{children}</section>;
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

