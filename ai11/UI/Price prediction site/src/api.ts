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

export async function predict(data: PredictIn): Promise<PredictResponse> {
  let response: Response;

  try {
    response = await fetch(`${API}/AI`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
  } catch {
    response = await fetch("/api/AI", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
  }

  if (!response.ok) {
    throw new Error(`Http status ${response.status} with status ${response.statusText}`);
  }

  const result = await response.json();
  const price = result.priceAZN ?? result.PriceAZN;
  return { priceAZN: price };
}
