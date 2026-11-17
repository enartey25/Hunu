import React from 'react';

interface ValueScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const verdict = (score: number) =>
  score >= 90 ? 'Best value' : score >= 75 ? 'Good value' : score >= 60 ? 'Fair value' : 'Weak value';

export const ValueScoreBadge: React.FC<ValueScoreBadgeProps> = ({
  score,
  size = 'md',
  showLabel = true
}) => {
  const numeral = size === 'lg' ? 'text-[32px]' : size === 'md' ? 'text-xl' : 'text-base';

  return (
    <span
      className="inline-flex items-baseline gap-1.5"
      title={`Hunu value score: ${score} out of 100`}
    >
      <span className={`fig leading-none ${numeral}`}>{score}</span>
      <span className="t-mute text-xs">/ 100</span>
      {showLabel && size !== 'sm' && (
        <span className={`text-xs font-semibold ${score < 60 ? 'text-warn' : 't-good'}`}>
          {verdict(score)}
        </span>
      )}
    </span>
  );
};
