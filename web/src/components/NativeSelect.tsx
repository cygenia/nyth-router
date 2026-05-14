import { SelectHTMLAttributes } from 'react';

type NativeSelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function NativeSelect({ className = '', children, ...props }: NativeSelectProps) {
  return (
    <div className="native-select-wrap">
      <select {...props} className={`native-select ${className}`}>
        {children}
      </select>
      <span className="native-select-chevron" aria-hidden="true">⌄</span>
    </div>
  );
}
