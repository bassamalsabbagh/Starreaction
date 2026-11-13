import { PanelView } from '../../components/PanelView';
import { LANDING_LESSONS, LESSON_OUTCOME_LABEL } from '../../data/landingLessons';
import { joinClassNames } from '../../utils/classNames';
import styles from './LessonsView.module.css';

/**
 * Lessons from past landings: real missions where sunlight, the Earth's position or the lunar
 * night decided how long a lander lasted. Every fact carries its source (docs/DATA_SOURCES.md).
 */
export function LessonsView({
  onSeeInTool,
}: {
  /** "See it in the tool": that landing site, at its landing date. */
  onSeeInTool?: (siteId: string) => void;
}) {
  return (
    <PanelView title="Lessons from past landings">
      <p className={styles.intro}>
        Real landings where sunlight, the Earth or the lunar night decided how long a lander lasted.
        These are real missions, and each fact links to its source.
      </p>
      <ol className={styles.list}>
        {LANDING_LESSONS.map((lesson) => (
          <li key={lesson.id} className={styles.card}>
            <div className={styles.head}>
              <h3 className={styles.name}>{lesson.name}</h3>
              <span className={joinClassNames(styles.outcome, styles[lesson.outcome])}>
                {LESSON_OUTCOME_LABEL[lesson.outcome]}
              </span>
            </div>
            <p className={styles.meta}>
              {lesson.who} · {lesson.when} · {lesson.where}
            </p>
            <p className={styles.what}>{lesson.whatHappened}</p>
            <p className={styles.lesson}>
              <span className={styles.lessonLabel}>The lesson</span> {lesson.lesson}
            </p>
            {lesson.note ? <p className={styles.note}>{lesson.note}</p> : null}
            {lesson.siteId && onSeeInTool ? (
              <button
                type="button"
                className={styles.seeInTool}
                aria-label={`See it in the tool: ${lesson.name}`}
                onClick={() => {
                  if (lesson.siteId) onSeeInTool(lesson.siteId);
                }}
              >
                See it in the tool
              </button>
            ) : null}
            <p className={styles.sources}>
              Sources:{' '}
              {lesson.sources.map((source, index) => (
                <span key={source.url}>
                  {index > 0 ? ' · ' : null}
                  <a href={source.url} target="_blank" rel="noopener noreferrer">
                    {source.label}
                  </a>
                </span>
              ))}
            </p>
          </li>
        ))}
      </ol>
    </PanelView>
  );
}
