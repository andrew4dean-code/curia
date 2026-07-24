import { useEffect, useRef, useState } from 'react';

export function useFlash(value: number): string {
  const prev = useRef(value);
  const [cls, setCls] = useState('');
  useEffect(() => {
    if (value > prev.current) setCls('flash-up');
    else if (value < prev.current) setCls('flash-dn');
    prev.current = value;
  }, [value]);
  useEffect(() => {
    if (!cls) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setCls('')));
    return () => cancelAnimationFrame(id);
  }, [cls]);
  return cls;
}
