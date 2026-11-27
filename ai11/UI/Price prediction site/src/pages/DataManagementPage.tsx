import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { cities } from '../cities';
import {
  addApartment,
  importApartmentsCsv,
  retrainModel,
  type DataOperationResponse,
  type RetrainResponse,
} from '../api';

function parsePositiveInt(raw: string): number | null {
  if (!raw.trim()) return null;
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

function parsePositiveNumber(raw: string): number | null {
  if (!raw.trim()) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function formatFinishedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ru-RU');
}

export default function DataManagementPage() {
  // Single apartment form state
  const [city, setCity] = useState<string>('Baku');
  const [sqm, setSqm] = useState<string>('');
  const [bedrooms, setBedrooms] = useState<string>('');
  const [bathrooms, setBathrooms] = useState<string>('');
  const [priceAZN, setPriceAZN] = useState<string>('');
  const [adding, setAdding] = useState<boolean>(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<DataOperationResponse | null>(null);

  // CSV import state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<DataOperationResponse | null>(null);

  // Retrain state
  const [retraining, setRetraining] = useState<boolean>(false);
  const [retrainError, setRetrainError] = useState<string | null>(null);
  const [retrainResult, setRetrainResult] = useState<RetrainResponse | null>(null);

  const handleAddApartment = async (e: FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAddSuccess(null);

    const parsedBedrooms = parsePositiveInt(bedrooms);
    const parsedBathrooms = parsePositiveInt(bathrooms);
    const parsedSqm = parsePositiveNumber(sqm);
    const parsedPrice = parsePositiveNumber(priceAZN);

    if (!city.trim()) {
      setAddError('Выберите город.');
      return;
    }
    if (parsedSqm === null) {
      setAddError('Площадь (Sqm) должна быть положительным числом.');
      return;
    }
    if (parsedBedrooms === null) {
      setAddError('Количество спален (Bedrooms) должно быть положительным целым числом.');
      return;
    }
    if (parsedBathrooms === null) {
      setAddError('Количество ванных (Bathrooms) должно быть положительным целым числом.');
      return;
    }
    if (parsedPrice === null) {
      setAddError('Известная стоимость (PriceAZN) должна быть положительным числом.');
      return;
    }

    setAdding(true);
    try {
      const response = await addApartment({
        city: city.trim(),
        sqm: parsedSqm,
        bedrooms: parsedBedrooms,
        bathrooms: parsedBathrooms,
        priceAZN: parsedPrice,
      });
      setAddSuccess(response);
      setSqm('');
      setBedrooms('');
      setBathrooms('');
      setPriceAZN('');
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Не удалось добавить квартиру.');
    } finally {
      setAdding(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    setImportSuccess(null);
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
  };

  const handleImportCsv = async (e: FormEvent) => {
    e.preventDefault();
    setImportError(null);
    setImportSuccess(null);

    if (!selectedFile) {
      setImportError('Выберите CSV-файл для импорта.');
      return;
    }
    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setImportError('Поддерживаются только файлы с расширением .csv.');
      return;
    }

    setImporting(true);
    try {
      const response = await importApartmentsCsv(selectedFile);
      setImportSuccess(response);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Не удалось импортировать CSV.');
    } finally {
      setImporting(false);
    }
  };

  const handleRetrain = async () => {
    if (retraining) return;
    setRetrainError(null);
    setRetrainResult(null);
    setRetraining(true);

    try {
      const result = await retrainModel();
      setRetrainResult(result);
    } catch (err: unknown) {
      setRetrainError(err instanceof Error ? err.message : 'Не удалось переобучить модель.');
    } finally {
      setRetraining(false);
    }
  };

  return (
    <div className="data-page">
      {/* Section 1: Add Single Apartment */}
      <section className="card card-wide">
        <div className="card-header">
          <h2 className="header-title">Добавить квартиру</h2>
        </div>

        <form onSubmit={handleAddApartment} className="predictor-form" noValidate>
          <div className="form-row">
            <label htmlFor="add-city" className="form-label">
              City (Город)
            </label>
            <div className="input-wrapper">
              <select
                id="add-city"
                className="form-input form-select"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              >
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <label htmlFor="add-sqm" className="form-label">
              Sqm (Площадь, м²)
            </label>
            <div className="input-wrapper">
              <input
                id="add-sqm"
                type="number"
                min="0"
                step="any"
                placeholder="Например: 110"
                className="form-input"
                value={sqm}
                onChange={(e) => setSqm(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <label htmlFor="add-bedrooms" className="form-label">
              Bedrooms (Спальни)
            </label>
            <div className="input-wrapper">
              <input
                id="add-bedrooms"
                type="number"
                min="1"
                step="1"
                placeholder="Например: 3"
                className="form-input"
                value={bedrooms}
                onChange={(e) => setBedrooms(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <label htmlFor="add-bathrooms" className="form-label">
              Bathrooms (Ванные)
            </label>
            <div className="input-wrapper">
              <input
                id="add-bathrooms"
                type="number"
                min="1"
                step="1"
                placeholder="Например: 2"
                className="form-input"
                value={bathrooms}
                onChange={(e) => setBathrooms(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <label htmlFor="add-price" className="form-label">
              PriceAZN (Цена, AZN)
            </label>
            <div className="input-wrapper">
              <input
                id="add-price"
                type="number"
                min="0"
                step="any"
                placeholder="Известная цена, например: 250000"
                className="form-input"
                value={priceAZN}
                onChange={(e) => setPriceAZN(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="section-actions">
            <button type="submit" className="predict-button" disabled={adding}>
              {adding ? 'Добавление...' : 'Добавить квартиру'}
            </button>
          </div>

          {addSuccess && (
            <div className="success-banner" role="status">
              <div>{addSuccess.message}</div>
              <div className="banner-subtext">
                Всего записей в датасете: <strong>{addSuccess.totalRecords}</strong>
              </div>
            </div>
          )}

          {addError && (
            <div className="error-banner" role="alert">
              <span>{addError}</span>
            </div>
          )}
        </form>
      </section>

      {/* Section 2: Import CSV */}
      <section className="card card-wide">
        <div className="card-header">
          <h2 className="header-title">Импорт данных из CSV</h2>
        </div>

        <form onSubmit={handleImportCsv} className="predictor-form">
          <p className="helper-text">
            Обязательные столбцы: <code>PriceAZN,Bedrooms,Bathrooms,Sqm,City</code>
          </p>

          <div className="file-upload-row">
            <input
              ref={fileInputRef}
              id="csv-file-input"
              type="file"
              accept=".csv,text/csv"
              className="file-input"
              onChange={handleFileChange}
            />
            <button type="submit" className="predict-button" disabled={importing}>
              {importing ? 'Импортирование...' : 'Импортировать'}
            </button>
          </div>

          {selectedFile && (
            <div className="selected-file-info">
              Выбран файл: <strong>{selectedFile.name}</strong>
            </div>
          )}

          {importSuccess && (
            <div className="success-banner" role="status">
              <div>{importSuccess.message}</div>
              <div className="banner-subtext">
                Добавлено строк: <strong>{importSuccess.addedCount}</strong> · Всего записей:{' '}
                <strong>{importSuccess.totalRecords}</strong>
              </div>
            </div>
          )}

          {importError && (
            <div className="error-banner" role="alert">
              <span>{importError}</span>
            </div>
          )}
        </form>
      </section>

      {/* Section 3: Retrain Model */}
      <section className="card card-wide">
        <div className="card-header">
          <h2 className="header-title">Переобучение модели</h2>
        </div>

        <div className="predictor-form">
          <p className="helper-text">
            Переобучение читает актуальный датасет <code>housing_az_realistic.csv</code> и
            обновляет активную модель без перезапуска сервера.
          </p>

          <div className="section-actions">
            <button
              type="button"
              className="predict-button retrain-button"
              onClick={handleRetrain}
              disabled={retraining}
            >
              {retraining ? 'Идёт переобучение…' : 'Retrain — переобучить модель'}
            </button>
          </div>

          {retrainResult && (
            <div className="success-banner" role="status">
              <div>{retrainResult.message}</div>
              <div className="banner-subtext">
                Использовано записей: <strong>{retrainResult.recordsUsed}</strong> (train:{' '}
                {retrainResult.trainRecords}, test: {retrainResult.testRecords}) · Завершено:{' '}
                <strong>{formatFinishedAt(retrainResult.finishedAt)}</strong>
              </div>

              <div className="metrics-grid">
                <div className="metric-item">
                  <span className="metric-label">MAE</span>
                  <span className="metric-value">
                    {retrainResult.metrics.mae.toLocaleString('ru-RU')}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">MSE</span>
                  <span className="metric-value">
                    {retrainResult.metrics.mse.toLocaleString('ru-RU')}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">RMSE</span>
                  <span className="metric-value">
                    {retrainResult.metrics.rmse.toLocaleString('ru-RU')}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">R²</span>
                  <span className="metric-value">{retrainResult.metrics.r2.toFixed(4)}</span>
                </div>
              </div>
            </div>
          )}

          {retrainError && (
            <div className="error-banner" role="alert">
              <span>{retrainError}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
