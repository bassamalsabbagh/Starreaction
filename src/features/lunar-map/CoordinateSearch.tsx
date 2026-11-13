import { useId, useState } from 'react';
import type { LatLon } from '../../utils/lunarSky';
import { MAX_COORDINATE_QUERY_LENGTH, parseCoordinateQuery } from '../../utils/selenographic';
import { joinClassNames } from '../../utils/classNames';
import styles from './CoordinateSearch.module.css';

interface CoordinateSearchProps {
  /** A valid coordinate was entered: check that point, as if it were clicked on the Moon. */
  onGo: (point: LatLon) => void;
}

/**
 * "Go to coordinates": type a latitude and longitude ("85.5 S, 31 E" or "-85.5, 31") and the point
 * opens like a click on the Moon. The parser's own message explains anything it cannot read.
 */
export function CoordinateSearch({ onGo }: CoordinateSearchProps) {
  const id = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className={styles.form}
      role="search"
      aria-label="Go to coordinates"
      onSubmit={(event) => {
        event.preventDefault();
        const result = parseCoordinateQuery(text);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setError(null);
        onGo({ lat: result.value.lat, lon: result.value.lon });
      }}
    >
      <label className={styles.label} htmlFor={id}>
        Go to coordinates
      </label>
      <div className={styles.row}>
        <input
          id={id}
          className={styles.input}
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="85.5 S, 31 E"
          maxLength={MAX_COORDINATE_QUERY_LENGTH}
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint`}
          onChange={(event) => {
            setText(event.target.value);
            if (error) setError(null);
          }}
        />
        <button type="submit" className={styles.go}>
          Go
        </button>
      </div>
      {/* Polite live region: a typing mistake is read out, not only shown in red. */}
      <p
        id={`${id}-hint`}
        className={joinClassNames(styles.hint, error && styles.error)}
        aria-live="polite"
      >
        {error ?? 'Latitude, then longitude. Or click anywhere on the Moon.'}
      </p>
    </form>
  );
}
