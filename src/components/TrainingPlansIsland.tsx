import { useEffect, useMemo, useState } from 'react';

type TrainingSession = {
  day: string;
  workout: string;
  description: string;
  intensity: string;
  duration: number;
  duration_unit: string;
};

type TrainingWeek = {
  week: number;
  focus: string;
  sessions: TrainingSession[];
};

type Variation = {
  variation: {
    title: string;
    focus: string;
    description: string;
    highlights: string[];
    main_weeks: TrainingWeek[];
    weeks: number;
  };
};

type TrainingPlan = {
  name: string;
  user_inputs?: {
    target_distance?: string;
    experience_level?: string;
    weekly_days?: { min?: number; max?: number };
    time_per_session?: { min?: number; max?: number };
  };
  variations: Variation[];
};

type TrainingPlanData = {
  metadata?: Record<string, unknown>;
  plans: Record<string, TrainingPlan>;
};

type Props = {
  dataUrl: string;
  loadingText: string;
  requiredFieldsError: string;
  loadingPlansError: string;
  noMatchingPlanError: string;
  resultsTitle: string;
  regenerateButtonText: string;
  exportButtonText: string;
  raceDateLabel: string;
  targetDistanceLabel: string;
  targetTimeLabel: string;
  trainingDaysLabel: string;
  sessionTimeLabel: string;
  isHillyLabel: string;
  submitButtonText: string;
  hourUnit: string;
  minuteUnit: string;
  secondUnit: string;
  targetDistanceOptions: Array<{ value: string; label: string }>;
  trainingDayOptions: Array<{ value: string; label: string }>;
  sessionTimeOptions: Array<{ value: string; label: string }>;
  focusLabel: string;
  weeklyStructureLabel: string;
  distributionLabel: string;
  sessionsPerWeekText: string;
  weeksText: string;
  weekLabel: string;
  hillyTerrainNote: string;
  weekdays: Record<string, string>;
  durationLabel: string;
  paceLabel: string;
};

const DISTANCE_MAPPINGS: Record<string, string> = {
  '5000': '5k',
  '10000': '10k',
  '21097': 'half_marathon',
  '42195': 'marathon',
};

function defaultRaceDate(): string {
  const raceDate = new Date();
  raceDate.setDate(raceDate.getDate() + 12 * 7);
  const daysUntilSaturday = (6 - raceDate.getDay() + 7) % 7;
  raceDate.setDate(raceDate.getDate() + daysUntilSaturday);
  return raceDate.toISOString().split('T')[0];
}

function calculateTargetPaceMinutesPerKm(targetTime: {
  hours: number;
  minutes: number;
  seconds: number;
}, distanceMeters: number): number {
  const totalMinutes = targetTime.hours * 60 + targetTime.minutes + targetTime.seconds / 60;
  return totalMinutes / (distanceMeters / 1000);
}

function calculateExperienceLevel(targetDistance: string, targetTime: {
  hours: number;
  minutes: number;
  seconds: number;
}): 'beginner' | 'intermediate' | 'advanced' {
  const distance = Number.parseInt(targetDistance, 10);
  const pace = calculateTargetPaceMinutesPerKm(targetTime, distance);
  const thresholds: Record<number, { beginner: number; intermediate: number; advanced: number }> = {
    5000: { beginner: 6.5, intermediate: 5.0, advanced: 4.0 },
    10000: { beginner: 7.0, intermediate: 5.2, advanced: 4.2 },
    21097: { beginner: 7.2, intermediate: 5.5, advanced: 4.5 },
    42195: { beginner: 7.5, intermediate: 5.7, advanced: 4.7 },
  };
  const selected = thresholds[distance] ?? thresholds[42195];
  if (pace >= selected.beginner) return 'beginner';
  if (pace >= selected.intermediate) return 'intermediate';
  if (pace >= selected.advanced) return 'intermediate';
  return 'advanced';
}

function calculateDaysUntilRace(raceDate: string): number {
  const today = new Date();
  const race = new Date(raceDate);
  const diffTime = race.getTime() - today.getTime();
  return Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}

function sessionTimeRange(value: string): { min: number; max: number } {
  if (value === '90+') return { min: 90, max: 999 };
  const [min, max] = value.split('-').map((part) => Number.parseInt(part, 10));
  return { min, max };
}

function rangeOverlap(a: { min: number; max: number }, b: { min: number; max: number }): boolean {
  return a.min <= b.max && b.min <= a.max;
}

function toSessionCount(variation: Variation): number {
  return (
    variation.variation.main_weeks[0]?.sessions.filter(
      (session) => session.workout !== 'Vila' && session.workout !== 'Rest',
    ).length ?? 0
  );
}

function formatPace(minutesPerKm: number): string {
  const totalSeconds = Math.max(0, Math.round(minutesPerKm * 60));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')} min/km`;
}

function calculatePaces(targetTime: { hours: number; minutes: number; seconds: number }, targetDistance: string) {
  const goalPace = calculateTargetPaceMinutesPerKm(targetTime, Number.parseInt(targetDistance, 10));
  const adjustments: Record<string, Record<string, number>> = {
    '5000': { EASY_PACE: 1.2, LONG_PACE: 0.85, TEMPO_PACE: 0, INTERVAL_PACE: -0.1, RECOVERY_PACE: 1.0 },
    '10000': { EASY_PACE: 1.1, LONG_PACE: 0.75, TEMPO_PACE: 0, INTERVAL_PACE: -0.08, RECOVERY_PACE: 0.9 },
    '21097': { EASY_PACE: 1.0, LONG_PACE: 0.6, TEMPO_PACE: -0.05, INTERVAL_PACE: -0.12, RECOVERY_PACE: 0.85 },
    '42195': { EASY_PACE: 0.9, LONG_PACE: 0.45, TEMPO_PACE: -0.08, INTERVAL_PACE: -0.15, RECOVERY_PACE: 0.8 },
  };
  const selected = adjustments[targetDistance] ?? adjustments['42195'];

  return Object.fromEntries(
    Object.entries(selected).map(([key, delta]) => [key, formatPace(goalPace + delta)]),
  );
}

function exportToPdf(title: string) {
  const jspdf = (window as typeof window & { jspdf?: { jsPDF: new () => {
    setFontSize: (size: number) => void;
    text: (text: string, x: number, y: number, options?: Record<string, unknown>) => void;
    splitTextToSize: (text: string, width: number) => string[];
    addPage: () => void;
    save: (filename: string) => void;
    internal: { pageSize: { width: number; height: number } };
  } } }).jspdf;

  if (!jspdf?.jsPDF) {
    window.print();
    return;
  }

  const doc = new jspdf.jsPDF();
  const width = doc.internal.pageSize.width - 20;
  let y = 20;

  doc.setFontSize(20);
  doc.text(title, 10, y);
  y += 10;

  const nodes = Array.from(document.querySelectorAll('.plan-overview, .week-container'));
  nodes.forEach((node) => {
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    const lines = doc.splitTextToSize(text, width);
    lines.forEach((line) => {
      if (y > doc.internal.pageSize.height - 20) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(11);
      doc.text(line, 10, y);
      y += 6;
    });
    y += 6;
  });

  doc.save('training_plan.pdf');
}

export default function TrainingPlansIsland(props: Props) {
  const {
    dataUrl,
    loadingText,
    requiredFieldsError,
    loadingPlansError,
    noMatchingPlanError,
    resultsTitle,
    regenerateButtonText,
    exportButtonText,
    raceDateLabel,
    targetDistanceLabel,
    targetTimeLabel,
    trainingDaysLabel,
    sessionTimeLabel,
    isHillyLabel,
    submitButtonText,
    hourUnit,
    minuteUnit,
    secondUnit,
    targetDistanceOptions,
    trainingDayOptions,
    sessionTimeOptions,
    focusLabel,
    weeklyStructureLabel,
    distributionLabel,
    sessionsPerWeekText,
    weeksText,
    weekLabel,
    hillyTerrainNote,
    weekdays,
    durationLabel,
    paceLabel,
  } = props;

  const [trainingPlans, setTrainingPlans] = useState<TrainingPlanData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [raceDate, setRaceDate] = useState(defaultRaceDate);
  const [targetDistance, setTargetDistance] = useState('42195');
  const [hours, setHours] = useState('4');
  const [minutes, setMinutes] = useState('0');
  const [seconds, setSeconds] = useState('0');
  const [trainingDays, setTrainingDays] = useState('5');
  const [sessionTime, setSessionTime] = useState('60-90');
  const [isHilly, setIsHilly] = useState(false);
  const [matchingVariations, setMatchingVariations] = useState<Variation[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [resultError, setResultError] = useState('');

  useEffect(() => {
    let active = true;

    fetch(dataUrl)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to fetch training plans');
        return response.json() as Promise<TrainingPlanData>;
      })
      .then((data) => {
        if (!active) return;
        setTrainingPlans(data);
      })
      .catch(() => {
        if (!active) return;
        setLoadError(loadingPlansError);
      });

    return () => {
      active = false;
    };
  }, [dataUrl, loadingPlansError]);

  const currentVariation = matchingVariations[selectedIndex] ?? null;
  const calculatedPaces = useMemo(
    () =>
      calculatePaces(
        {
          hours: Number.parseInt(hours, 10) || 0,
          minutes: Number.parseInt(minutes, 10) || 0,
          seconds: Number.parseInt(seconds, 10) || 0,
        },
        targetDistance,
      ),
    [hours, minutes, seconds, targetDistance],
  );

  const generateTrainingPlan = () => {
    if (!trainingPlans || !targetDistance || !raceDate) {
      setResultError(requiredFieldsError);
      return;
    }

    const targetTime = {
      hours: Number.parseInt(hours, 10) || 0,
      minutes: Number.parseInt(minutes, 10) || 0,
      seconds: Number.parseInt(seconds, 10) || 0,
    };

    const desiredWeeks = Math.max(1, Math.floor(calculateDaysUntilRace(raceDate) / 7));
    const experienceLevel = calculateExperienceLevel(targetDistance, targetTime);
    const desiredSessionRange = sessionTimeRange(sessionTime);
    const desiredDays = Number.parseInt(trainingDays, 10);
    const desiredDistanceKey = DISTANCE_MAPPINGS[targetDistance];

    const candidates = Object.values(trainingPlans.plans)
      .filter((plan) => {
        const inputs = plan.user_inputs;
        if (!inputs) return false;
        if (inputs.target_distance !== desiredDistanceKey) return false;
        if (inputs.experience_level !== experienceLevel) return false;

        const weeklyDays = {
          min: inputs.weekly_days?.min ?? 0,
          max: inputs.weekly_days?.max ?? 99,
        };
        const sessionWindow = {
          min: inputs.time_per_session?.min ?? 0,
          max: inputs.time_per_session?.max ?? 999,
        };

        return desiredDays >= weeklyDays.min && desiredDays <= weeklyDays.max && rangeOverlap(sessionWindow, desiredSessionRange);
      })
      .flatMap((plan) => plan.variations)
      .sort((a, b) => {
        const weekDiff = Math.abs((a.variation.weeks ?? a.variation.main_weeks.length) - desiredWeeks) -
          Math.abs((b.variation.weeks ?? b.variation.main_weeks.length) - desiredWeeks);
        if (weekDiff !== 0) return weekDiff;

        return Math.abs(toSessionCount(a) - desiredDays) - Math.abs(toSessionCount(b) - desiredDays);
      });

    if (candidates.length === 0) {
      setMatchingVariations([]);
      setSelectedIndex(0);
      setResultError(noMatchingPlanError);
      return;
    }

    setMatchingVariations(candidates);
    setSelectedIndex(0);
    setResultError('');
  };

  return (
    <>
      <div className="calculator-container">
        <form className="calculator-form" id="training-calculator" onSubmit={(event) => event.preventDefault()}>
          <div className="form-group">
            <label htmlFor="race-date">{raceDateLabel}</label>
            <input
              type="date"
              id="race-date"
              name="race-date"
              className="form-select"
              min={new Date().toISOString().split('T')[0]}
              value={raceDate}
              onChange={(event) => setRaceDate(event.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="target-distance">{targetDistanceLabel}</label>
            <select
              id="target-distance"
              name="target-distance"
              className="form-select"
              required
              value={targetDistance}
              onChange={(event) => setTargetDistance(event.target.value)}
            >
              {targetDistanceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="hours">{targetTimeLabel}</label>
            <div className="time-inputs">
              <div className="time-input">
                <input type="number" id="hours" className="form-input" min="0" value={hours} onChange={(event) => setHours(event.target.value)} />
                <span className="unit">{hourUnit}</span>
              </div>
              <div className="time-input">
                <input type="number" id="minutes" className="form-input" min="0" max="59" value={minutes} onChange={(event) => setMinutes(event.target.value)} />
                <span className="unit">{minuteUnit}</span>
              </div>
              <div className="time-input">
                <input type="number" id="seconds" className="form-input" min="0" max="59" value={seconds} onChange={(event) => setSeconds(event.target.value)} />
                <span className="unit">{secondUnit}</span>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="training-days">{trainingDaysLabel}</label>
            <select id="training-days" name="training-days" className="form-select" value={trainingDays} onChange={(event) => setTrainingDays(event.target.value)}>
              {trainingDayOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="session-time">{sessionTimeLabel}</label>
            <select id="session-time" name="session-time" className="form-select" value={sessionTime} onChange={(event) => setSessionTime(event.target.value)}>
              {sessionTimeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <div className="checkbox-wrapper">
              <input type="checkbox" id="is-hilly" className="form-checkbox" checked={isHilly} onChange={(event) => setIsHilly(event.target.checked)} />
              <label htmlFor="is-hilly">{isHillyLabel}</label>
            </div>
          </div>

          <button type="button" className="btn btn--full" id="generate-plan" onClick={generateTrainingPlan}>
            {submitButtonText}
          </button>

          {loadError ? <p className="aux-inline-error">{loadError}</p> : null}
          {!loadError && !trainingPlans ? <p className="aux-inline-loading">{loadingText}</p> : null}
          {resultError ? <p className="aux-inline-error">{resultError}</p> : null}
        </form>
      </div>

      <div className="plan-actions">
        <button
          type="button"
          className="btn btn--outline"
          id="regenerate-plan"
          disabled={matchingVariations.length < 2}
          onClick={() => setSelectedIndex((current) => (current + 1) % matchingVariations.length)}
        >
          {regenerateButtonText}
        </button>
        <button
          type="button"
          className="btn btn--outline"
          id="export-pdf"
          disabled={!currentVariation}
          onClick={() => exportToPdf(resultsTitle)}
        >
          {exportButtonText}
        </button>
      </div>

      <div className={`results-container ${currentVariation ? '' : 'hidden'}`}>
        <h2 className="heading-secondary">{resultsTitle}</h2>
        {currentVariation ? (
          <div className="selected-plan">
            <div id="training-schedule">
              <div className="plan-overview">
                <h3>{currentVariation.variation.title}</h3>
                <div className="plan-focus">
                  <strong>{focusLabel}:</strong> {currentVariation.variation.focus}
                </div>
                <div className="plan-description">{currentVariation.variation.description}</div>
                <div className="plan-highlights">
                  <ul>
                    {currentVariation.variation.highlights.map((highlight) => (
                      <li key={highlight}>{highlight}</li>
                    ))}
                  </ul>
                </div>
                <div className="plan-structure">
                  <strong>{weeklyStructureLabel}:</strong> {currentVariation.variation.weeks} {weeksText}
                </div>
                <div className="plan-distribution">
                  <strong>{distributionLabel}:</strong> {toSessionCount(currentVariation)} {sessionsPerWeekText}
                </div>
                {isHilly ? <div className="terrain-note">{hillyTerrainNote}</div> : null}
              </div>

              {currentVariation.variation.main_weeks.map((week) => (
                <div className="week-container" key={`${week.week}-${week.focus}`}>
                  <div className="week-header">
                    <h4>{weekLabel} {week.week}</h4>
                    <div className="week-focus">{week.focus}</div>
                  </div>
                  <div className="sessions-container">
                    {week.sessions.map((session) => {
                      const dayKey = session.day.toLowerCase();
                      const pace = calculatedPaces[session.intensity as keyof typeof calculatedPaces];
                      return (
                        <div className="session" key={`${week.week}-${session.day}-${session.workout}`}>
                          <div className="session-header">
                            <strong>{weekdays[dayKey] ?? session.day}:</strong> {session.workout}
                          </div>
                          <div className="session-details">
                            <p>{session.description}</p>
                            <ul className="workout-specs">
                              <li>
                                <strong>{durationLabel}:</strong> {session.duration} {session.duration_unit}
                              </li>
                              {pace ? (
                                <li>
                                  <strong>{paceLabel}:</strong> {pace}
                                </li>
                              ) : null}
                            </ul>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
