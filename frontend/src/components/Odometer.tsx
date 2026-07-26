export type RollSpeed = 'hero' | 'detail';

interface OdometerProps {
  value: string;
  speed?: RollSpeed;
  className?: string;
  dataTestid?: string;
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export function Odometer({ value, speed = 'hero', className, dataTestid }: OdometerProps) {
  const cls = ['odo', speed === 'detail' ? 'odo-detail' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={cls} data-value={value} data-testid={dataTestid}>
      {value.split('').map((c, i) => {
        if (c >= '0' && c <= '9') {
          const d = Number(c);
          return (
            <span className="odo-reel" key={i}>
              <span
                className="odo-strip"
                style={{ transform: `translateY(-${d * 10}%)`, transitionDelay: `${i * 0.035}s` }}
              >
                {DIGITS.map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </span>
            </span>
          );
        }
        return (
          <span className="odo-ch" key={i}>
            {c}
          </span>
        );
      })}
    </span>
  );
}
