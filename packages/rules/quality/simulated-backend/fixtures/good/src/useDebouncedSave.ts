// Debounce: a timer that SCHEDULES work rather than one that is awaited.
// This is the false-positive class the rule is calibrated against, and it
// sits in a file with a save handler so only the trigger shape excludes it.
export function useDebouncedSave(value, onSave) {
  useEffect(() => {
    const handleSave = () => onSave(value);
    const timer = setTimeout(handleSave, 400);
    return () => clearTimeout(timer);
  }, [value, onSave]);
}
