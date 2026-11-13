import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type Ref,
} from 'react';
import {
  formatDays,
  formatShare,
  verdictText,
  type DemoMission,
  type DemoSite,
} from '../../data/demoData';
import { formatNeedsMet, needsMet } from '../../data/needsMet';
import { readSlipText, type SlipResult } from '../../services/slipApi';
import {
  SLIP_TEXT_MAX,
  type SlipQuestionAbout,
  type SlipReading,
} from '../../services/slipReading';
import { joinClassNames } from '../../utils/classNames';
import {
  DAY_MS,
  formatClock,
  formatWindowDays,
  formatWindowRange,
  type TimeRange,
} from '../../utils/time';
import { planSlip, type SlipNeedLine, type SlipPlan } from './slipPlan';
import { answerQuestion, type SlipAnswer } from './slipQuestion';
import styles from './SlipAssistant.module.css';

/** Tried with one click: each is read at once, and each is a kind of text the assistant reads. */
const SLIP_EXAMPLES = [
  'Launch slipped 3 weeks',
  'We now need 6 days of power',
  'When is the best time to land in March?',
  'Which site is best this month?',
  'Which site has the most Earth time?',
] as const;

interface SlipAssistantProps {
  missions: readonly DemoMission[];
  /** The selected mission: the text changes this one unless it names another. */
  mission: DemoMission;
  /** The time bar's time: a shift counts from here. */
  time: number;
  /** The time bar's range: "which site is best?" without months answers for it. */
  range: TimeRange;
  /** The demo sites, for questions about when or where to land. */
  sites: readonly DemoSite[];
  /** "Go there" on an answer: that mission and site, the time bar at that moment. */
  onGoToSite: (missionId: string, siteId: string, ms: number) => void;
  /** Uses the reading (the mission, its needs and the time). */
  onApply: (plan: SlipPlan) => void;
  /** Opens the Mission form with the reading in it (also "Add its details"). */
  onEdit: (plan: SlipPlan) => void;
  /** Opens the plain Mission form: the way to do it all by hand. */
  onOpenForm: () => void;
  /** The app's results now, as the fixed sentence, and whether they are still being worked out. */
  results: { text: string; updating: boolean };
  /** Reads the text (the server call). Tests swap it. */
  read?: (text: string) => Promise<SlipResult>;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'reading' }
  // `at`: the real clock when the reply came (months that have ended are "in the past").
  | { kind: 'read'; reading: SlipReading; text: string; at: number }
  | { kind: 'unavailable' }
  | { kind: 'tooLong' }
  /** Applied, for this mission id (filled in on the render after Apply, once the app has it). */
  | { kind: 'applied'; missionId: string | null };

/** "3 days → 6 days", "6 days (as before)", "3 days (unchanged)". */
function needValue(line: SlipNeedLine): string {
  if (line.changed && line.before !== null) return `${line.before} → ${line.after}`;
  if (line.mentioned) return line.before === null ? line.after : `${line.after} (as before)`;
  return line.before === null ? line.after : `${line.after} (unchanged)`;
}

/**
 * "Launch slipped?": one text box. An AI reads the text into the mission's settings only; the app
 * checks every value, works out the date and shows "I read this as …" before anything changes.
 * Apply uses it, Edit opens the Mission form with it. Whenever the AI cannot be reached, the
 * Mission form does the same by hand.
 */
export function SlipAssistant({
  missions,
  mission,
  time,
  range,
  sites,
  onGoToSite,
  onApply,
  onEdit,
  onOpenForm,
  results,
  read = readSlipText,
}: SlipAssistantProps) {
  const baseId = useId();
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  // Each request gets a number; a reply to an older one (the text changed since) is ignored.
  const requestRef = useRef(0);
  const readBackRef = useRef<HTMLDivElement>(null);

  // The "Applied" sentence describes the mission that was applied: picking another mission
  // clears it rather than describing a mission the text never touched.
  if (phase.kind === 'applied') {
    if (phase.missionId === null) setPhase({ kind: 'applied', missionId: mission.id });
    else if (phase.missionId !== mission.id) setPhase({ kind: 'idle' });
  }

  // Worked out again whenever the mission list, the selection or the time bar moves, so the
  // read-back always describes what Apply would do now.
  const plan = useMemo(
    () =>
      phase.kind === 'read'
        ? planSlip(phase.reading, { text: phase.text, missions, selected: mission, time })
        : null,
    [phase, missions, mission, time],
  );

  // A question is answered by the app, from the same checks as the Sites list, for the mission the
  // text names (when it is in the list) or the selected one.
  const answer = useMemo(() => {
    if (phase.kind !== 'read' || phase.reading.question === null || !plan) return null;
    return answerQuestion(phase.reading.question, {
      text: phase.text,
      mission: plan.mission.kind === 'unknown' ? mission : plan.mission.mission,
      sites,
      time,
      range,
      now: phase.at,
    });
  }, [phase, plan, mission, sites, time, range]);

  // With an answer, the read-back shows only when the text also changes something.
  const showReadBack =
    plan !== null &&
    (answer === null ||
      plan.time !== null ||
      plan.changed ||
      plan.errors.length > 0 ||
      plan.mission.kind === 'unknown');

  useEffect(() => {
    if (phase.kind === 'read') readBackRef.current?.focus();
  }, [phase.kind]);

  const send = async (raw: string) => {
    const sent = raw.trim();
    if (sent === '' || phase.kind === 'reading') return;
    requestRef.current += 1;
    const request = requestRef.current;
    setPhase({ kind: 'reading' });
    const result = await read(sent);
    if (request !== requestRef.current) return;
    if (result.kind === 'ok') {
      setPhase({ kind: 'read', reading: result.reading, text: sent, at: clockNow() });
    } else setPhase({ kind: result.kind });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(text);
  };
  const tryExample = (example: string) => {
    setText(example);
    void send(example);
  };

  const changeText = (next: string) => {
    setText(next);
    if (phase.kind !== 'idle') {
      requestRef.current += 1;
      setPhase({ kind: 'idle' });
    }
  };

  const formButton = (
    <button type="button" className={styles.secondary} onClick={onOpenForm}>
      Open the mission form
    </button>
  );

  return (
    <section className={styles.assistant} aria-labelledby={`${baseId}-title`}>
      <h3 id={`${baseId}-title`} className={styles.title}>
        Launch slipped?
      </h3>
      <form className={styles.ask} onSubmit={submit}>
        <label className={styles.label} htmlFor={`${baseId}-text`}>
          Describe the change
        </label>
        <textarea
          id={`${baseId}-text`}
          className={styles.text}
          rows={3}
          maxLength={SLIP_TEXT_MAX}
          value={text}
          placeholder="Launch slipped 3 weeks, and we now need 6 days of power."
          aria-describedby={`${baseId}-hint`}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          onChange={(event) => changeText(event.target.value)}
          onKeyDown={(event) => {
            // Enter makes a new line in a text box; Ctrl/Cmd+Enter sends it.
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className={styles.examples} role="group" aria-label="Examples to try">
          {SLIP_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              className={styles.example}
              disabled={phase.kind === 'reading'}
              onClick={() => tryExample(example)}
            >
              {example}
            </button>
          ))}
        </div>
        <p id={`${baseId}-hint`} className={styles.hint}>
          A change to the launch or its needs, or a question about when or where to land. In
          English. An AI (Google Gemini, free tier) only reads it into the settings; every number
          comes from your text or the app. Google may use what you type to improve its models, so
          don&apos;t type anything private.{' '}
          <span className={styles.count}>
            {text.length}/{SLIP_TEXT_MAX}
          </span>
        </p>
        <button
          type="submit"
          className={styles.primary}
          disabled={text.trim() === '' || phase.kind === 'reading'}
        >
          {phase.kind === 'reading' ? 'Reading…' : 'Read it'}
        </button>
      </form>

      <div className={styles.status} role="status">
        {phase.kind === 'reading' ? 'Reading your text…' : null}
        {phase.kind === 'unavailable'
          ? 'The assistant isn’t available right now. Set the date and needs yourself in the mission form.'
          : null}
        {phase.kind === 'tooLong'
          ? `That is over ${SLIP_TEXT_MAX} characters. Shorten it and try again.`
          : null}
        {phase.kind === 'applied' ? (
          <span className={styles.applied}>
            <strong>Applied.</strong>{' '}
            {results.updating ? 'Working out the new results…' : results.text}
          </span>
        ) : null}
      </div>
      {phase.kind === 'unavailable' ? formButton : null}
      {phase.kind === 'applied' ? (
        <p className={styles.hint}>
          Worked out by the app from the real Sun and Earth; the sites and needs are{' '}
          <span className={styles.demo}>DEMO</span>. The AI only read your text.
        </p>
      ) : null}

      {answer ? (
        <Answer
          answer={answer}
          containerRef={readBackRef}
          titleId={`${baseId}-answer`}
          onGo={(siteId, ms) => onGoToSite(answer.mission.id, siteId, ms)}
        />
      ) : null}

      {plan && phase.kind === 'read' && showReadBack ? (
        <ReadBack
          plan={plan}
          time={time}
          containerRef={answer ? undefined : readBackRef}
          titleId={`${baseId}-read`}
          onApply={() => {
            onApply(plan);
            setPhase({ kind: 'applied', missionId: null });
          }}
          onEdit={() => onEdit(plan)}
          formButton={formButton}
        />
      ) : null}
    </section>
  );
}

function ReadBack({
  plan,
  time,
  containerRef,
  titleId,
  onApply,
  onEdit,
  formButton,
}: {
  plan: SlipPlan;
  time: number;
  containerRef: Ref<HTMLDivElement> | undefined;
  titleId: string;
  onApply: () => void;
  onEdit: () => void;
  formButton: ReactNode;
}) {
  if (plan.empty) {
    return (
      <div
        ref={containerRef}
        tabIndex={-1}
        role="group"
        className={styles.readBack}
        aria-labelledby={titleId}
      >
        <p id={titleId} className={styles.readTitle}>
          I couldn’t find a change or a question in your text.
        </p>
        <p className={styles.hint}>{NOTHING_READ_HINT}</p>
        {formButton}
      </div>
    );
  }
  const unknown = plan.mission.kind === 'unknown' ? plan.mission.name : null;
  const missionText =
    plan.mission.kind === 'unknown'
      ? `${plan.mission.name} (not in the list)`
      : plan.mission.kind === 'known'
        ? `${plan.mission.mission.name} (in your list)`
        : `${plan.mission.mission.name} (the one selected)`;

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="group"
      className={styles.readBack}
      aria-labelledby={titleId}
      data-testid="slip-read-back"
    >
      <p id={titleId} className={styles.readTitle}>
        I read this as:
      </p>
      {unknown ? (
        <p className={styles.unknown}>{`${unknown} isn’t in our list yet, add its details.`}</p>
      ) : null}
      <dl className={styles.lines}>
        <div className={styles.line}>
          <dt>Mission</dt>
          <dd>{missionText}</dd>
        </div>
        <div className={styles.line}>
          <dt>Date</dt>
          <dd>
            {plan.time ? (
              <>
                <strong>{formatClock(plan.time.to)}</strong>
                <span className={styles.how}>{plan.time.how}</span>
              </>
            ) : (
              <>
                {formatClock(time)} <span className={styles.how}>unchanged</span>
              </>
            )}
          </dd>
        </div>
        {plan.needs.map((line) => (
          <div key={line.field} className={styles.line}>
            <dt>{line.label}</dt>
            <dd>
              {line.changed || line.mentioned ? (
                <strong>{needValue(line)}</strong>
              ) : (
                needValue(line)
              )}
            </dd>
          </div>
        ))}
      </dl>

      {plan.errors.length > 0 ? (
        <ul className={joinClassNames(styles.notes, styles.error)} aria-label="Problems">
          {plan.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      {plan.dropped.length > 0 ? (
        <ul className={styles.notes} aria-label="Not used">
          {plan.dropped.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      {plan.unclear.length > 0 || plan.unclearHidden > 0 ? (
        <div className={styles.notes}>
          <span>Couldn’t read:</span>
          {plan.unclear.length > 0 ? (
            <ul className={styles.quotes}>
              {plan.unclear.map((quote) => (
                <li key={quote}>“{quote}”</li>
              ))}
            </ul>
          ) : (
            <span> part of your text.</span>
          )}
        </div>
      ) : null}

      <div className={styles.actions}>
        {unknown ? (
          <button type="button" className={styles.primary} onClick={onEdit}>
            Add its details
          </button>
        ) : (
          <>
            <button
              type="button"
              className={styles.primary}
              disabled={!plan.canApply}
              onClick={onApply}
            >
              Apply
            </button>
            <button type="button" className={styles.secondary} onClick={onEdit}>
              Edit
            </button>
          </>
        )}
      </div>
      {!unknown && !plan.canApply ? (
        <p className={styles.hint}>
          {plan.errors.length > 0
            ? 'Fix the problems above in Edit, or change your text.'
            : plan.readAny
              ? NOTHING_CHANGED
              : NOTHING_READ_HINT}
        </p>
      ) : null}
    </div>
  );
}

/** The real clock, read only when a reply arrives (an event, never during render). */
function clockNow(): number {
  return Date.now();
}

const NOTHING_CHANGED =
  'Nothing changed: your text gives the same date and needs as now. To change something, try “Launch slipped 3 weeks”; to ask, try “Which site is best this month?”.';

const NOTHING_READ_HINT =
  'I can read a change, like “Launch slipped 3 weeks”, or a question: when or where to land, days of sunlight at a site, the most Earth time, or whether a site passes, like “Does Demo Site Bravo pass for Demo Mission B?”. Other questions aren’t read; try an example above.';

const ANSWER_TITLE: Readonly<Record<SlipQuestionAbout, string>> = {
  when: 'When to land',
  where: 'Where to land',
  sunlight: 'Days of sunlight',
  earth: 'Most Earth time',
  passes: 'Does it pass?',
};

/**
 * The app's answer to a question (assistant rule 9): the months checked, the site, then what was
 * asked (the best window, the sunlight, the Earth time or the checks), and Go there. Every value
 * comes from the app.
 */
function Answer({
  answer,
  containerRef,
  titleId,
  onGo,
}: {
  answer: SlipAnswer;
  containerRef: Ref<HTMLDivElement>;
  titleId: string;
  onGo: (siteId: string, ms: number) => void;
}) {
  const { site, assessment, span, sky, about, mission } = answer;
  const window = assessment?.bestWindow ?? null;
  const siteHow = answer.siteNamed
    ? 'the site in your text'
    : about === 'earth'
      ? `the most Earth time of ${answer.siteCount} demo sites`
      : `best of ${answer.siteCount} demo sites; ${answer.suitableCount} ${answer.suitableCount === 1 ? 'passes' : 'pass'} all the checks`;
  const spanDays = span ? (span.end - span.start) / DAY_MS : 0;
  const line = (term: string, value: ReactNode, how?: string) => (
    <div className={styles.line}>
      <dt>{term}</dt>
      <dd>
        {value}
        {how ? <span className={styles.how}>{how}</span> : null}
      </dd>
    </div>
  );
  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="group"
      className={styles.readBack}
      aria-labelledby={titleId}
      data-testid="slip-answer"
    >
      <p id={titleId} className={styles.readTitle}>
        {ANSWER_TITLE[about]}
      </p>
      {answer.errors.length > 0 || span === null ? (
        <ul className={joinClassNames(styles.notes, styles.error)} aria-label="Problems">
          {answer.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : (
        <dl className={styles.lines}>
          <div className={styles.line}>
            <dt>Mission</dt>
            <dd>{answer.mission.name}</dd>
          </div>
          <div className={styles.line}>
            <dt>Months checked</dt>
            <dd>
              <strong>{answer.spanText} (UTC)</strong>
              {answer.past ? (
                <span className={styles.how}>
                  {answer.past === 'past' ? 'in the past' : 'partly in the past'}
                </span>
              ) : null}
              {answer.spanHow ? <span className={styles.how}>{answer.spanHow}</span> : null}
            </dd>
          </div>
          {line(
            'Site',
            site ? (
              <strong>{site.name}</strong>
            ) : (
              `No demo site passes all the checks for ${mission.name} in these months.`
            ),
            site ? siteHow : undefined,
          )}
          {site && sky && about === 'sunlight'
            ? line(
                'Sunlight',
                <strong>{formatDays(sky.longestSunlitDays)} unbroken</strong>,
                `Sun at least ${mission.minSunElevationDeg}° up; ${formatDays((sky.sunPct / 100) * spanDays)} in all (${formatShare(sky.sunPct)} of the time)`,
              )
            : null}
          {site && sky && about === 'earth'
            ? line(
                'Earth time',
                <strong>{formatShare(sky.earthPct)} of the time</strong>,
                `Earth at least ${mission.minEarthElevationDeg}° up`,
              )
            : null}
          {site && (about === 'when' || about === 'where')
            ? line(
                'Best window',
                window ? (
                  <strong>{formatWindowRange(window)}</strong>
                ) : (
                  'No landing window in these months'
                ),
                window ? formatWindowDays(window) : undefined,
              )
            : null}
          {site && assessment && about !== 'earth' && about !== 'sunlight'
            ? line('Checks', verdictText(assessment, mission))
            : null}
          {site && assessment && about === 'passes'
            ? line('Mission needs met', formatNeedsMet(needsMet(assessment, mission), mission))
            : null}
        </dl>
      )}
      {answer.dropped.length > 0 ? (
        <ul className={styles.notes} aria-label="Not used">
          {answer.dropped.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      {site && span ? (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            onClick={() => onGo(site.id, window ? Math.max(window.start, span.start) : span.start)}
          >
            Go there
          </button>
        </div>
      ) : null}
      <p className={styles.hint}>
        Worked out by the app from the real Sun and Earth; the sites and needs are{' '}
        <span className={styles.demo}>DEMO</span>. The AI only read your question.
      </p>
    </div>
  );
}
