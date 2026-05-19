import * as React from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'default' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'default' | 'sm' | 'icon';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  default: 'bg-primary text-white hover:bg-primary-dark border border-primary',
  outline:
    'bg-transparent text-text-primary border border-border hover:bg-bg-elevated',
  ghost: 'bg-transparent text-text-secondary hover:bg-bg-elevated hover:text-text-primary border border-transparent',
  destructive: 'bg-red-600 text-white hover:bg-red-700 border border-red-600',
};

const sizeClasses: Record<ButtonSize, string> = {
  default: 'h-9 px-3 py-2 text-sm',
  sm: 'h-8 px-2.5 text-xs',
  icon: 'h-9 w-9 p-0',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
);

Button.displayName = 'Button';
