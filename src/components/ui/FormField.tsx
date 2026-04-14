import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface Option {
  value: string;
  label: string;
}

interface FormFieldProps {
  id: string;
  label: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'date' | 'textarea' | 'select';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  options?: Option[];
  allowOther?: boolean;
  min?: string | number;
  max?: string | number;
  className?: string;
  icon?: React.ReactNode;
}

export const FormField = ({
  id,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  required = false,
  disabled = false,
  options = [],
  allowOther = false,
  min,
  max,
  className,
  icon,
}: FormFieldProps) => {
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherValue, setOtherValue] = useState('');

  const handleSelectChange = (selectedValue: string) => {
    if (selectedValue === '__other__') {
      setShowOtherInput(true);
      onChange('');
    } else {
      setShowOtherInput(false);
      onChange(selectedValue);
    }
  };

  const handleOtherInputChange = (newValue: string) => {
    setOtherValue(newValue);
    onChange(newValue);
  };

  if (type === 'textarea') {
    return (
      <div className={cn('space-y-2', className)}>
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className="min-h-[100px] resize-none"
        />
      </div>
    );
  }

  if (type === 'select') {
    const isOtherSelected = showOtherInput || (value && !options.some((o) => o.value === value));

    return (
      <div className={cn('space-y-2', className)}>
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
        {!showOtherInput && !isOtherSelected ? (
          <Select
            value={value}
            onValueChange={handleSelectChange}
            disabled={disabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={placeholder || `Select ${label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent className="bg-popover border border-border shadow-lg z-50">
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
              {allowOther && (
                <SelectItem value="__other__" className="text-muted-foreground">
                  Other...
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex gap-2">
            <Input
              id={id}
              value={isOtherSelected ? value : otherValue}
              onChange={(e) => handleOtherInputChange(e.target.value)}
              placeholder="Enter custom value..."
              required={required}
              disabled={disabled}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => {
                setShowOtherInput(false);
                setOtherValue('');
                onChange('');
              }}
              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </div>
        )}
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          min={min}
          max={max}
          className={cn(icon && 'pl-10')}
        />
      </div>
    </div>
  );
};