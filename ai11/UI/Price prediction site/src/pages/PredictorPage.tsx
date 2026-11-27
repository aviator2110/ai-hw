import { useState, type FormEvent } from 'react';
import { cities } from '../cities';
import { predict } from '../api';

function formatPrice(value: number): string {
  return `${Math.round(value).toLocaleString('ru-RU')} AZN`;
}

export default function PredictorPage() {
  const [city, setCity] = useState<string>('Baku');
  const [sqm, setSqm] = useState<number | string>(0);
  const [bedrooms, setBedrooms] = useState<number | string>(0);
  const [bathrooms, setBathrooms] = useState<number | string>(0);

  const [predictedPrice, setPredictedPrice] = useState<string>('0 AZN');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const numSqm = Number(sqm);
    const numBedrooms = Number(bedrooms);
    const numBathrooms = Number(bathrooms);

    if (!city) {
      setError('Please select a city.');
      return;
    }
    if (isNaN(numSqm) || numSqm <= 0) {
      setError('Please enter valid square meters (greater than 0).');
      return;
    }
    if (isNaN(numBedrooms) || numBedrooms < 0) {
      setError('Please enter valid number of bedrooms.');
      return;
    }
    if (isNaN(numBathrooms) || numBathrooms < 0) {
      setError('Please enter valid number of bathrooms.');
      return;
    }

    setLoading(true);
    try {
      const result = await predict({
        city,
        sqm: numSqm,
        bedrooms: numBedrooms,
        bathrooms: numBathrooms,
      });

      setPredictedPrice(formatPrice(result.priceAZN));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Prediction request failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
  <div className="card">
      <div className="card-header">
        <h1 className="header-title">Price Predictor</h1>
      </div>

      <form onSubmit={handleSubmit} className="predictor-form">
        <div className="form-row">
          <label htmlFor="city-select" className="form-label">
            City
          </label>
          <div className="input-wrapper">
            <select
              id="city-select"
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
          <label htmlFor="sqm-input" className="form-label">
            Square meters
          </label>
          <div className="input-wrapper">
            <input
              id="sqm-input"
              type="number"
              min="0"
              step="any"
              className="form-input"
              value={sqm}
              onChange={(e) => setSqm(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="form-row">
          <label htmlFor="bedrooms-input" className="form-label">
            Bedrooms
          </label>
          <div className="input-wrapper">
            <input
              id="bedrooms-input"
              type="number"
              min="0"
              step="1"
              className="form-input"
              value={bedrooms}
              onChange={(e) => setBedrooms(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="form-row">
          <label htmlFor="bathrooms-input" className="form-label">
            Bathrooms
          </label>
          <div className="input-wrapper">
            <input
              id="bathrooms-input"
              type="number"
              min="0"
              step="1"
              className="form-input"
              value={bathrooms}
              onChange={(e) => setBathrooms(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="card-bottom">
          <div className={`price-display ${loading ? 'loading' : ''}`} title="Predicted Price">
            {predictedPrice}
          </div>
          <button
            type="submit"
            className="predict-button"
            disabled={loading}
          >
            {loading ? 'Predicting...' : 'Predict'}
          </button>
        </div>

        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
          </div>
        )}
      </form>
    </div>
  );
}
