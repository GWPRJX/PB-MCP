import type { ReactNode } from 'react';

interface TooltipProps {
  text: string;
  children?: ReactNode;
}

export function Tooltip({ text, children }: TooltipProps) {
  return (
    <span className="relative group inline-flex items-center">
      {children ?? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-3.5 h-3.5 inline-block ml-1 text-gray-400 hover:text-gray-600 cursor-help"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z"
            clipRule="evenodd"
          />
        </svg>
      )}
      <span
        className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-150
          absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2
          px-3 py-2 text-xs text-white bg-gray-900 rounded-lg shadow-lg
          max-w-xs w-max pointer-events-none"
      >
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
      </span>
    </span>
  );
}
