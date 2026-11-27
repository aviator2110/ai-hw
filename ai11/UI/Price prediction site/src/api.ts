const API = "http://localhost:5224/api";

export type PredictIn = {
  bedrooms: number;
  bathrooms: number;
  sqm: number;
  city: string;
};

export interface PredictResponse {
  priceAZN: number;
}

export type ApartmentIn = {
  bedrooms: number;
  bathrooms: number;
  sqm: number;
  city: string;
  priceAZN: number;
};

export interface DataOperationResponse {
  message: string;
  addedCount: number;
  totalRecords: number;
}

export interface RetrainMetrics {
  mae: number;
  mse: number;
  rmse: number;
  r2: number;
}

export interface RetrainResponse {
  message: string;
  recordsUsed: number;
  trainRecords: number;
  testRecords: number;
  metrics: RetrainMetrics;
  finishedAt: string;
}

async function fetchWithFallback(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API}${path}`, init);
  } catch {
    return await fetch(`/api${path}`, init);
  }
}

async function extractErrorMessage(response: Response): Promise<string> {
  const fallback = `Http status ${response.status} (${response.statusText || "Request failed"})`;

  let rawText = "";
  try {
    rawText = await response.text();
  } catch {
    return fallback;
  }

  if (!rawText.trim()) {
    return fallback;
  }

  try {
    const parsed: unknown = JSON.parse(rawText);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (typeof record.detail === "string" && record.detail.trim()) {
        return record.detail;
      }
      if (record.errors && typeof record.errors === "object") {
        const messages = Object.values(record.errors as Record<string, unknown>)
          .flatMap((v) => (Array.isArray(v) ? v : [v]))
          .filter((v): v is string => typeof v === "string" && v.trim().length > 0);
        if (messages.length > 0) {
          return messages.join(" ");
        }
      }
      if (typeof record.title === "string" && record.title.trim()) {
        return record.title;
      }
      if (typeof record.message === "string" && record.message.trim()) {
        return record.message;
      }
    }
  } catch {
    // Plain text error body
  }

  return rawText;
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetchWithFallback(path, init);

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  return (await response.json()) as T;
}

export async function predict(data: PredictIn): Promise<PredictResponse> {
  const result = await requestJson<{ priceAZN?: number; PriceAZN?: number }>("/AI", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const price = result.priceAZN ?? result.PriceAZN ?? 0;
  return { priceAZN: price };
}

export async function addApartment(data: ApartmentIn): Promise<DataOperationResponse> {
  return requestJson<DataOperationResponse>("/AI/apartments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
}

export async function importApartmentsCsv(file: File): Promise<DataOperationResponse> {
  const formData = new FormData();
  formData.append("file", file);

  return requestJson<DataOperationResponse>("/AI/apartments/import", {
    method: "POST",
    body: formData,
  });
}

export async function retrainModel(): Promise<RetrainResponse> {
  return requestJson<RetrainResponse>("/AI/retrain", {
    method: "POST",
  });
}
