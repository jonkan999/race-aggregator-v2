import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import 'leaflet/dist/leaflet.css';
import {
  createRaceSubmission,
  findPotentialDuplicateRace,
  uploadRaceSubmissionImages,
} from '../lib/raceSubmissions';

type Props = {
  countryCode: string;
  locale: string;
  siteKey: string;
  siteName: string;
  mapboxToken: string;
  centerLat: number;
  centerLng: number;
  zoom: number;
  labels: {
    name: string;
    type: string;
    typePlaceholder: string;
    date: string;
    multiDay: string;
    endDate: string;
    startTime: string;
    optional: string;
    mapMessage: string;
    place: string;
    distance: string;
    distancePlaceholder: string;
    addDistance: string;
    organizer: string;
    organizerContact: string;
    website: string;
    priceRange: string;
    summary: string;
    additional: string;
    images: string;
    chooseImages: string;
    dragDrop: string;
    clearImages: string;
    clearForm: string;
    submit: string;
    disclaimerLead: string;
    disclaimerLink: string;
    disclaimerTail: string;
    coordinatesPrefix: string;
    removeImage: string;
  };
  placeholders: {
    name: string;
    place: string;
    organizer: string;
    organizerMail: string;
    website: string;
    startTime: string;
    priceRange: string;
    summary: string;
    additional: string;
  };
  quickDistances: Array<{ value: string; label: string }>;
  raceTypeOptions: Array<{ value: string; label: string }>;
  messages: {
    missingFields: string;
    duplicateRace: string;
    submissionFailed: string;
    submissionSuccess: string;
    processing: string;
    uploadLimit: string;
    mapUnavailable: string;
  };
  contactHref: string;
};

type StoredImage = {
  id: string;
  name: string;
  dataUrl: string;
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

const FORM_STORAGE_KEY = 'raceFormData';
const IMAGE_STORAGE_KEY = 'raceImages';
const COORD_STORAGE_KEY = 'raceCoordinates';
const MAX_IMAGES = 8;

const EMPTY_FORM = {
  'race-name': '',
  'race-type': '',
  'race-date': '',
  'race-end-date': '',
  'race-start-time': '',
  'race-location': '',
  'race-organizer': '',
  'race-contact': '',
  'race-website': '',
  'race-price-range': '',
  'race-summary': '',
  'race-additional': '',
};

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function isValidCoordinates(value: Coordinates | null): value is Coordinates {
  return Boolean(
    value &&
      Number.isFinite(value.latitude) &&
      Number.isFinite(value.longitude),
  );
}

function formatUploadLimit(template: string, count: number): string {
  return template.replace('{count}', String(count));
}

function createImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load image'));
    image.src = src;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not create blob'));
    }, type, quality);
  });
}

async function createPreviewDataUrl(file: File): Promise<string> {
  const sourceUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });

  const image = await createImageElement(sourceUrl);
  const maxWidth = 1600;
  const scale = image.width > maxWidth ? maxWidth / image.width : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create image context');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.88);
}

async function processImageForUpload(dataUrl: string): Promise<Blob> {
  const image = await createImageElement(dataUrl);
  const maxWidth = 1000;
  const scale = image.width > maxWidth ? maxWidth / image.width : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create upload image context');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.9;
  let blob = await canvasToBlob(canvas, 'image/webp', quality);
  while (blob.size > 500 * 1024 && quality > 0.1) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, 'image/webp', quality);
  }
  return blob;
}

function distanceLabel(
  distance: string,
  quickDistanceMap: Map<string, string>,
): string {
  return quickDistanceMap.get(distance) ?? `${distance} km`;
}

export default function AddRaceFormIsland(props: Props) {
  const {
    countryCode,
    locale,
    siteKey,
    siteName,
    mapboxToken,
    centerLat,
    centerLng,
    zoom,
    labels,
    placeholders,
    quickDistances,
    raceTypeOptions,
    messages,
    contactHref,
  } = props;

  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const mapInstanceRef = useRef<import('leaflet').Map | null>(null);
  const markerRef = useRef<import('leaflet').Marker | null>(null);
  const initializedRef = useRef(false);
  const saveReadyRef = useRef(false);
  const [formValues, setFormValues] =
    useState<Record<keyof typeof EMPTY_FORM, string>>(EMPTY_FORM);
  const [multiDay, setMultiDay] = useState(false);
  const [distances, setDistances] = useState<string[]>([]);
  const [images, setImages] = useState<StoredImage[]>([]);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [distanceInput, setDistanceInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const quickDistanceMap = useMemo(
    () => new Map(quickDistances.map((entry) => [entry.value, entry.label])),
    [quickDistances],
  );

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const savedForm = safeJsonParse<Record<string, unknown>>(
      localStorage.getItem(FORM_STORAGE_KEY),
    );
    if (savedForm) {
      setFormValues((current) => ({
        ...current,
        ...Object.fromEntries(
          Object.keys(EMPTY_FORM).map((key) => [key, String(savedForm[key] ?? current[key as keyof typeof EMPTY_FORM] ?? '')]),
        ),
      }));
      setDistances(
        Array.isArray(savedForm.distances)
          ? savedForm.distances.map((value) => String(value))
          : [],
      );
      setMultiDay(Boolean(savedForm['multi-day-toggle']));
    }

    const savedImages = safeJsonParse<{ images?: Array<string | StoredImage> }>(
      localStorage.getItem(IMAGE_STORAGE_KEY),
    );
    if (savedImages?.images) {
      setImages(
        savedImages.images
          .map((entry, index) => {
            if (typeof entry === 'string') {
              return {
                id: crypto.randomUUID(),
                name: `image-${index + 1}.webp`,
                dataUrl: entry,
              };
            }
            if (entry && typeof entry === 'object') {
              return {
                id: String(entry.id ?? crypto.randomUUID()),
                name: String(entry.name ?? `image-${index + 1}.webp`),
                dataUrl: String(entry.dataUrl ?? ''),
              };
            }
            return null;
          })
          .filter((entry): entry is StoredImage => Boolean(entry?.dataUrl)),
      );
    }

    const savedCoordinates = safeJsonParse<Coordinates>(
      localStorage.getItem(COORD_STORAGE_KEY),
    );
    if (isValidCoordinates(savedCoordinates)) {
      setCoordinates(savedCoordinates);
    }

    saveReadyRef.current = true;
  }, []);

  useEffect(() => {
    if (!saveReadyRef.current) return;
    localStorage.setItem(
      FORM_STORAGE_KEY,
      JSON.stringify({
        ...formValues,
        distances,
        'multi-day-toggle': multiDay,
      }),
    );
  }, [formValues, distances, multiDay]);

  useEffect(() => {
    if (!saveReadyRef.current) return;
    localStorage.setItem(
      IMAGE_STORAGE_KEY,
      JSON.stringify({
        images,
      }),
    );
  }, [images]);

  useEffect(() => {
    if (!saveReadyRef.current) return;
    if (coordinates) {
      localStorage.setItem(COORD_STORAGE_KEY, JSON.stringify(coordinates));
    } else {
      localStorage.removeItem(COORD_STORAGE_KEY);
    }
  }, [coordinates]);

  useEffect(() => {
    if (!mapboxToken.trim() || !mapRef.current) return undefined;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void import('leaflet').then((L) => {
      if (cancelled || !mapRef.current) return;

      leafletRef.current = L;
      const map = L.map(mapRef.current, { attributionControl: false }).setView(
        [centerLat, centerLng],
        zoom,
      );

      L.tileLayer(
        `https://api.mapbox.com/styles/v1/mapbox/outdoors-v11/tiles/{z}/{x}/{y}@2x?access_token=${mapboxToken}`,
        {
          minZoom: 5,
          maxZoom: 19,
          tileSize: 512,
          zoomOffset: -1,
        },
      ).addTo(map);

      map.on('click', (event) => {
        setCoordinates({
          latitude: event.latlng.lat,
          longitude: event.latlng.lng,
        });
      });

      mapInstanceRef.current = map;

      window.setTimeout(() => {
        map.invalidateSize();
      }, 100);

      cleanup = () => {
        markerRef.current?.remove();
        markerRef.current = null;
        map.remove();
        mapInstanceRef.current = null;
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [centerLat, centerLng, mapboxToken, zoom]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    if (!coordinates) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const latLng: [number, number] = [coordinates.latitude, coordinates.longitude];
    if (markerRef.current) {
      markerRef.current.setLatLng(latLng);
    } else {
      markerRef.current = L.marker(latLng, {
        icon: L.divIcon({
          className: 'marker-default',
          iconSize: [12, 12],
        }),
      }).addTo(map);
    }
    map.setView(latLng, map.getZoom());
  }, [coordinates]);

  const updateValue = (field: keyof typeof EMPTY_FORM, value: string) => {
    setFormValues((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const addDistanceValue = (value: string) => {
    const normalized = value.trim();
    if (!normalized || distances.includes(normalized)) return;
    setDistances((current) => [...current, normalized]);
    setDistanceInput('');
  };

  const removeDistanceValue = (value: string) => {
    setDistances((current) => current.filter((entry) => entry !== value));
  };

  const updateImages = async (files: FileList | File[]) => {
    const incoming = Array.from(files);
    const remainingSlots = MAX_IMAGES - images.length;

    if (incoming.length > remainingSlots) {
      alert(formatUploadLimit(messages.uploadLimit, remainingSlots));
      return;
    }

    const nextImages = await Promise.all(
      incoming.map(async (file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        dataUrl: await createPreviewDataUrl(file),
      })),
    );

    setImages((current) => [...current, ...nextImages]);
  };

  const clearImages = () => {
    setImages([]);
  };

  const clearAll = () => {
    setFormValues(EMPTY_FORM);
    setMultiDay(false);
    setDistances([]);
    setImages([]);
    setCoordinates(null);
    setDistanceInput('');
    setStatusMessage('');
    localStorage.removeItem(FORM_STORAGE_KEY);
    localStorage.removeItem(IMAGE_STORAGE_KEY);
    localStorage.removeItem(COORD_STORAGE_KEY);
  };

  const handleDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files?.length) {
      await updateImages(event.dataTransfer.files);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      !formValues['race-name'].trim() ||
      !formValues['race-type'].trim() ||
      !formValues['race-date'].trim() ||
      !formValues['race-location'].trim() ||
      !formValues['race-contact'].trim() ||
      !formValues['race-summary'].trim() ||
      !coordinates
    ) {
      alert(messages.missingFields);
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(messages.processing);

    try {
      const duplicateExists = await findPotentialDuplicateRace({
        countryCode,
        locale,
        name: formValues['race-name'],
        startDate: formValues['race-date'],
      });

      if (duplicateExists) {
        alert(messages.duplicateRace);
        setStatusMessage('');
        setIsSubmitting(false);
        return;
      }

      const submissionId = crypto.randomUUID();
      const uploadImages = await Promise.all(
        images.map(async (image) => ({
          fileName: image.name.replace(/\.[^.]+$/, '') || 'image',
          blob: await processImageForUpload(image.dataUrl),
        })),
      );

      const uploadedImages = await uploadRaceSubmissionImages({
        siteKey,
        countryCode,
        submissionId,
        images: uploadImages,
      });

      await createRaceSubmission({
        id: submissionId,
        siteKey,
        siteName,
        countryCode,
        locale,
        submitterEmail: formValues['race-contact'].trim(),
        name: formValues['race-name'].trim(),
        raceType: formValues['race-type'].trim(),
        startDate: formValues['race-date'],
        endDate: multiDay ? formValues['race-end-date'] || undefined : undefined,
        isMultiDay: multiDay,
        startTime: formValues['race-start-time'] || undefined,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        locationName: formValues['race-location'].trim(),
        distances,
        organizerName: formValues['race-organizer'].trim() || undefined,
        organizerWebsite: formValues['race-website'].trim() || undefined,
        priceRange: formValues['race-price-range'].trim() || undefined,
        summary: formValues['race-summary'].trim(),
        additionalInformation: formValues['race-additional'].trim() || undefined,
        imagePaths: uploadedImages.map((entry) => entry.path),
      });

      alert(messages.submissionSuccess);
      clearAll();
    } catch (error) {
      console.error(error);
      alert(messages.submissionFailed);
    } finally {
      setStatusMessage('');
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <form id="add-race-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="race-name">{labels.name}</label>
          <input
            type="text"
            id="race-name"
            name="race-name"
            placeholder={placeholders.name}
            required
            value={formValues['race-name']}
            onChange={(event) => updateValue('race-name', event.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="race-type">{labels.type}</label>
          <select
            id="race-type"
            name="race-type"
            required
            value={formValues['race-type']}
            onChange={(event) => updateValue('race-type', event.target.value)}
          >
            <option value="">{labels.typePlaceholder}</option>
            {raceTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="race-date">{labels.date}</label>
          <input
            type="date"
            id="race-date"
            name="race-date"
            required
            value={formValues['race-date']}
            onChange={(event) => updateValue('race-date', event.target.value)}
          />
          <div className="multi-day-toggle">
            <label htmlFor="multi-day-toggle">{labels.multiDay}</label>
            <input
              type="checkbox"
              id="multi-day-toggle"
              name="multi-day-toggle"
              checked={multiDay}
              onChange={(event) => {
                setMultiDay(event.target.checked);
                if (!event.target.checked) {
                  updateValue('race-end-date', '');
                }
              }}
            />
          </div>
          <div
            id="end-date-container"
            style={{ display: multiDay ? 'block' : 'none' }}
          >
            <label htmlFor="race-end-date">{labels.endDate}</label>
            <input
              type="date"
              id="race-end-date"
              name="race-end-date"
              value={formValues['race-end-date']}
              onChange={(event) => updateValue('race-end-date', event.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="race-start-time">
            {labels.startTime} <span className="optional">({labels.optional})</span>
          </label>
          <input
            type="time"
            id="race-start-time"
            name="race-start-time"
            placeholder={placeholders.startTime}
            step="1"
            data-format="24h"
            value={formValues['race-start-time']}
            onChange={(event) => updateValue('race-start-time', event.target.value)}
          />
        </div>

        <div className="form-group map-container">
          <label>{labels.mapMessage}</label>
          {mapboxToken.trim() ? (
            <div
              ref={mapRef}
              id="map-placeholder"
              data-latitude={centerLat}
              data-longitude={centerLng}
              data-zoom={zoom}
            />
          ) : (
            <div id="map-placeholder" className="map-placeholder-empty">
              {messages.mapUnavailable}
            </div>
          )}
          <input
            type="hidden"
            id="latitude"
            name="latitude"
            value={coordinates?.latitude ?? ''}
          />
          <input
            type="hidden"
            id="longitude"
            name="longitude"
            value={coordinates?.longitude ?? ''}
          />
          <div id="coordinates-display">
            {coordinates
              ? `${labels.coordinatesPrefix}: ${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)}`
              : ''}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="race-location">{labels.place}</label>
          <input
            type="text"
            id="race-location"
            name="race-location"
            placeholder={placeholders.place}
            required
            value={formValues['race-location']}
            onChange={(event) => updateValue('race-location', event.target.value)}
          />
        </div>

        <div className="form-group">
          <label>{labels.distance}</label>
          <div className="distance-input-container">
            <input
              type="number"
              id="distance-input"
              placeholder={labels.distancePlaceholder}
              min="0"
              step="0.1"
              value={distanceInput}
              onChange={(event) => setDistanceInput(event.target.value)}
            />
            <button
              type="button"
              id="add-distance"
              onClick={() => addDistanceValue(distanceInput)}
            >
              {labels.addDistance}
            </button>
          </div>
          <div className="quick-distance-buttons">
            {quickDistances.map((entry) => (
              <button
                key={entry.value}
                type="button"
                className="quick-distance"
                data-distance={entry.value}
                onClick={() => addDistanceValue(entry.value)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div id="distances-container">
            {distances.map((distance) => (
              <div key={distance} className="distance-tag">
                {distanceLabel(distance, quickDistanceMap)}
                <button
                  type="button"
                  className="remove-distance"
                  data-distance={distance}
                  onClick={() => removeDistanceValue(distance)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <input
            type="hidden"
            id="race-distances"
            name="race-distances"
            value={JSON.stringify(distances)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="race-organizer">
            {labels.organizer} <span className="optional">({labels.optional})</span>
          </label>
          <input
            type="text"
            id="race-organizer"
            name="race-organizer"
            placeholder={placeholders.organizer}
            value={formValues['race-organizer']}
            onChange={(event) => updateValue('race-organizer', event.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="race-contact">{labels.organizerContact}</label>
          <input
            type="email"
            id="race-contact"
            name="race-contact"
            placeholder={placeholders.organizerMail}
            required
            value={formValues['race-contact']}
            onChange={(event) => updateValue('race-contact', event.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="race-website">
            {labels.website} <span className="optional">({labels.optional})</span>
          </label>
          <input
            type="url"
            id="race-website"
            name="race-website"
            placeholder={placeholders.website}
            value={formValues['race-website']}
            onChange={(event) => updateValue('race-website', event.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="race-price-range">
            {labels.priceRange} <span className="optional">({labels.optional})</span>
          </label>
          <input
            type="text"
            id="race-price-range"
            name="race-price-range"
            placeholder={placeholders.priceRange}
            value={formValues['race-price-range']}
            onChange={(event) => updateValue('race-price-range', event.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="race-summary">{labels.summary}</label>
          <textarea
            id="race-summary"
            name="race-summary"
            placeholder={placeholders.summary}
            required
            value={formValues['race-summary']}
            onChange={(event) => updateValue('race-summary', event.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="race-additional">
            {labels.additional} <span className="optional">({labels.optional})</span>
          </label>
          <textarea
            id="race-additional"
            name="race-additional"
            placeholder={placeholders.additional}
            value={formValues['race-additional']}
            onChange={(event) => updateValue('race-additional', event.target.value)}
          />
        </div>

        <div className="form-group picture-upload-container">
          <label htmlFor="race-images">{labels.images}</label>
          <input
            type="file"
            id="race-images"
            className="picture-upload-input"
            multiple
            accept="image/*"
            onChange={async (event) => {
              if (event.target.files?.length) {
                await updateImages(event.target.files);
                event.target.value = '';
              }
            }}
          />
          <label
            htmlFor="race-images"
            className={`picture-upload-button drag-drop-area${isDragging ? ' dragging-over' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <span>{labels.chooseImages}</span>
            <span className="drag-drop-copy">{labels.dragDrop}</span>
          </label>
        </div>

        <div id="fileUploadStatus">{statusMessage}</div>
        <div className="image-container">
          {images.map((image) => (
            <div key={image.id} className="uploaded-image-container">
              <img src={image.dataUrl} alt="" className="uploaded-image" />
              <button
                type="button"
                className="delete-icon"
                aria-label={labels.removeImage}
                onClick={() =>
                  setImages((current) => current.filter((entry) => entry.id !== image.id))
                }
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          id="clearImagesButton"
          style={{ display: images.length > 0 ? 'inline-block' : 'none' }}
          onClick={clearImages}
        >
          {labels.clearImages}
        </button>

        <div className="info-disclaimer">
          <p>
            {labels.disclaimerLead} <a href={contactHref}>{labels.disclaimerLink}</a>{' '}
            {labels.disclaimerTail}
          </p>
        </div>

        <div className="form-actions">
          <button type="submit" id="submit-race-button" disabled={isSubmitting}>
            {labels.submit}
          </button>
        </div>
      </form>

      <button type="button" id="clear-form" onClick={clearAll} disabled={isSubmitting}>
        {labels.clearForm}
      </button>
    </>
  );
}
