import { useMemo, useState } from 'react';

type LookupPrediction = {
  distance: number;
  pace: number;
};

type LookupEntry = {
  input_distance: number;
  input_time: number;
  predictions: LookupPrediction[];
};

type ResultRow = {
  name: string;
  time: string;
  paceKm: string;
  paceMile: string;
};

type Props = {
  lookupTable: LookupEntry[];
  knownDistanceLabel: string;
  knownTimeLabel: string;
  calculateButtonText: string;
  predictedTimesTitle: string;
  distanceHeader: string;
  finishTimeHeader: string;
  pacePerKmHeader: string;
  pacePerMileHeader: string;
  hillyCourseLabel: string;
  halfMarathonLabel: string;
  marathonLabel: string;
};

const mileKm = 1.60934;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'N/A';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function formatPace(paceSeconds: number): string {
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = Math.floor(paceSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatPaceMile(paceSecondsPerKm: number): string {
  return formatPace(paceSecondsPerKm * mileKm);
}

function calculateHillAdjustment(basePaceSeconds: number): number {
  const pacePerKm = basePaceSeconds < 600 ? basePaceSeconds : basePaceSeconds / mileKm;
  const paceFactor = Math.max(1, Math.min(3, (pacePerKm - 240) / 90 + 1));
  return 12 * paceFactor;
}

export default function RaceTimeEstimatorIsland(props: Props) {
  const {
    lookupTable,
    knownDistanceLabel,
    knownTimeLabel,
    calculateButtonText,
    predictedTimesTitle,
    distanceHeader,
    finishTimeHeader,
    pacePerKmHeader,
    pacePerMileHeader,
    hillyCourseLabel,
    halfMarathonLabel,
    marathonLabel,
  } = props;

  const commonDistances = useMemo(
    () => [
      { km: 1.60934, name: '1 Mile' },
      { km: 3, name: '3K' },
      { km: 3.21868, name: '2 Mile' },
      { km: 5, name: '5K' },
      { km: 10, name: '10K' },
      { km: 15, name: '15K' },
      { km: 21.0975, name: halfMarathonLabel },
      { km: 42.195, name: marathonLabel },
    ],
    [halfMarathonLabel, marathonLabel],
  );

  const [distanceMeters, setDistanceMeters] = useState('5000');
  const [hours, setHours] = useState('0');
  const [minutes, setMinutes] = useState('30');
  const [seconds, setSeconds] = useState('0');
  const [isHilly, setIsHilly] = useState(false);
  const [results, setResults] = useState<ResultRow[]>([]);

  const calculatePredictions = () => {
    const distanceKm = Number.parseInt(distanceMeters, 10) / 1000;
    const totalSeconds =
      (Number.parseInt(hours, 10) || 0) * 3600 +
      (Number.parseInt(minutes, 10) || 0) * 60 +
      (Number.parseInt(seconds, 10) || 0);

    if (!distanceKm || !totalSeconds) {
      setResults([]);
      return;
    }

    const shortestPredictions = [...lookupTable[0].predictions]
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2);
    const paceChangePerKm =
      (shortestPredictions[1].pace - shortestPredictions[0].pace) /
      (shortestPredictions[1].distance - shortestPredictions[0].distance);

    const computedResults = commonDistances
      .map((target) => {
        const closest = lookupTable
          .map((entry) => ({
            ...entry,
            diff:
              Math.abs(entry.input_distance - distanceKm) +
              Math.abs(entry.input_time - totalSeconds) / 3600,
          }))
          .sort((a, b) => a.diff - b.diff)
          .slice(0, 4);

        if (!closest[0]) return null;

        let adjustedPace: number | undefined;

        if (target.km < shortestPredictions[0].distance) {
          const distanceDiff = shortestPredictions[0].distance - target.km;
          const basePace = shortestPredictions[0].pace * (totalSeconds / closest[0].input_time);
          adjustedPace = basePace - paceChangePerKm * distanceDiff;
        } else {
          const distanceRatio = distanceKm / closest[0].input_distance;
          const timeRatio = totalSeconds / closest[0].input_time;
          const paceRatio = timeRatio / distanceRatio;
          adjustedPace =
            closest[0].predictions.find((prediction) => Math.abs(prediction.distance - target.km) < 0.01)
              ?.pace ?? undefined;
          if (adjustedPace != null) adjustedPace *= paceRatio;
        }

        if (!adjustedPace || !Number.isFinite(adjustedPace)) return null;

        const finalPace = isHilly
          ? adjustedPace + calculateHillAdjustment(adjustedPace)
          : adjustedPace;

        return {
          name: target.name,
          time: formatTime(finalPace * target.km),
          paceKm: formatPace(finalPace),
          paceMile: formatPaceMile(finalPace),
        };
      })
      .filter((entry): entry is ResultRow => Boolean(entry));

    setResults(computedResults);
  };

  return (
    <>
      <div className="calculator-container">
        <form className="calculator-form" id="race-calculator" onSubmit={(event) => event.preventDefault()}>
          <div className="form-group">
            <label htmlFor="known-distance">{knownDistanceLabel}</label>
            <select
              id="known-distance"
              name="known-distance"
              className="form-select"
              value={distanceMeters}
              onChange={(event) => setDistanceMeters(event.target.value)}
            >
              <option value="5000">5 km</option>
              <option value="10000">10 km</option>
              <option value="21097">{halfMarathonLabel}</option>
              <option value="42195">{marathonLabel}</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="hours">{knownTimeLabel}</label>
            <div className="time-inputs">
              <div className="time-input">
                <input
                  type="number"
                  id="hours"
                  className="form-input"
                  min="0"
                  value={hours}
                  onChange={(event) => setHours(event.target.value)}
                />
                <span className="unit">h</span>
              </div>
              <div className="time-input">
                <input
                  type="number"
                  id="minutes"
                  className="form-input"
                  min="0"
                  max="59"
                  value={minutes}
                  onChange={(event) => setMinutes(event.target.value)}
                />
                <span className="unit">m</span>
              </div>
              <div className="time-input">
                <input
                  type="number"
                  id="seconds"
                  className="form-input"
                  min="0"
                  max="59"
                  value={seconds}
                  onChange={(event) => setSeconds(event.target.value)}
                />
                <span className="unit">s</span>
              </div>
            </div>
          </div>

          <div className="form-group">
            <div className="checkbox-wrapper">
              <input
                type="checkbox"
                id="is-hilly"
                className="form-checkbox"
                checked={isHilly}
                onChange={(event) => {
                  setIsHilly(event.target.checked);
                  if (results.length > 0) {
                    requestAnimationFrame(calculatePredictions);
                  }
                }}
              />
              <label htmlFor="is-hilly">{hillyCourseLabel}</label>
            </div>
          </div>

          <button type="button" className="btn btn--full" id="calculate-button" onClick={calculatePredictions}>
            {calculateButtonText}
          </button>
        </form>
      </div>

      <div className={`results-container ${results.length === 0 ? 'hidden' : ''}`}>
        <h2 className="heading-secondary">{predictedTimesTitle}</h2>
        <table className="results-table">
          <thead>
            <tr>
              <th>{distanceHeader}</th>
              <th>{finishTimeHeader}</th>
              <th>{pacePerKmHeader}</th>
              <th>{pacePerMileHeader}</th>
            </tr>
          </thead>
          <tbody id="results-body">
            {results.map((result) => (
              <tr key={result.name}>
                <td>{result.name}</td>
                <td>{result.time}</td>
                <td>{result.paceKm}</td>
                <td>{result.paceMile}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
