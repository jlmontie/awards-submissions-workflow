'use client';

import type { SurveyField as SurveyFieldType } from '@/lib/surveys/templates';

interface SurveyFieldProps {
  field: SurveyFieldType;
  value: string | boolean;
  error?: string;
  onChange: (key: string, value: string | boolean) => void;
  disabled?: boolean;
}

export default function SurveyField({ field, value, error, onChange, disabled }: SurveyFieldProps) {
  if (field.type === 'checkbox') {
    return (
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id={field.key}
          checked={!!value}
          onChange={(e) => onChange(field.key, e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
        />
        <label htmlFor={field.key} className="text-sm font-medium text-gray-700">
          {field.label}
        </label>
      </div>
    );
  }

  const inputType = field.type === 'currency' || field.type === 'percent' ? 'text' : field.type;

  return (
    <div>
      <label htmlFor={field.key} className="block text-sm font-medium text-gray-700 mb-1">
        {field.label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <div className="relative">
        {field.type === 'currency' && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
        )}
        <input
          type={inputType}
          id={field.key}
          value={typeof value === 'boolean' ? '' : value || ''}
          onChange={(e) => onChange(field.key, e.target.value)}
          disabled={disabled}
          placeholder={field.placeholder}
          className={`
            block w-full rounded-md border shadow-sm sm:text-sm px-3 py-2
            ${field.type === 'currency' ? 'pl-7' : ''}
            ${field.type === 'percent' ? 'pr-7' : ''}
            ${error
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:border-amber-500 focus:ring-amber-500'
            }
            disabled:bg-gray-50 disabled:text-gray-500
          `}
        />
        {field.type === 'percent' && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
        )}
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
