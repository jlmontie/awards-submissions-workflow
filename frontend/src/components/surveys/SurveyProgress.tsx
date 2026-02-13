'use client';

interface SurveyProgressProps {
  sections: string[];
  currentSection: number;
}

export default function SurveyProgress({ sections, currentSection }: SurveyProgressProps) {
  const progress = Math.round(((currentSection + 1) / sections.length) * 100);

  return (
    <div className="mb-8">
      {/* Progress bar */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">
          Section {currentSection + 1} of {sections.length}
        </span>
        <span className="text-sm text-gray-500">{progress}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-amber-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Section labels */}
      <div className="hidden sm:flex justify-between mt-3">
        {sections.map((name, idx) => (
          <span
            key={idx}
            className={`text-xs ${
              idx === currentSection
                ? 'text-amber-600 font-semibold'
                : idx < currentSection
                  ? 'text-gray-500'
                  : 'text-gray-400'
            }`}
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
