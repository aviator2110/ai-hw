import sys
import threading
import traceback
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import AliasChoices, BaseModel, ConfigDict, Field

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from data_service import (
    FEATURE_COLUMNS,
    ApartmentValidationError,
    append_apartments,
    parse_and_validate_csv,
    validate_apartment_values,
)
from trainer import load_model_bundle, retrain_model

ROOT_DIR = BASE_DIR.parent.parent
DATA_PATH = ROOT_DIR / "data" / "housing_az_realistic.csv"
MODEL_PATH = ROOT_DIR / "models" / "model.pkl"

app = FastAPI(
    title="Price prediction AI Service API",
)

model_lock = threading.RLock()
retrain_lock = threading.Lock()

print(f"Model path: {MODEL_PATH}")
print(f"File exists: {MODEL_PATH.exists()}")

try:
    BUNDLE, PIPELINE, FEATURES = load_model_bundle(MODEL_PATH)
    print(f"Model successfully loaded: {MODEL_PATH}")
except Exception as e:
    print(f"Model could not be loaded: {e}")
    BUNDLE = None
    PIPELINE = None
    FEATURES = FEATURE_COLUMNS


class PredictIn(BaseModel):
    bedrooms: float
    bathrooms: float
    sqm: float
    city: str


class ApartmentIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    bedrooms: Any = Field(
        default=None,
        validation_alias=AliasChoices("bedrooms", "Bedrooms"),
    )
    bathrooms: Any = Field(
        default=None,
        validation_alias=AliasChoices("bathrooms", "Bathrooms"),
    )
    sqm: Any = Field(
        default=None,
        validation_alias=AliasChoices("sqm", "Sqm"),
    )
    city: Any = Field(
        default=None,
        validation_alias=AliasChoices("city", "City"),
    )
    priceAZN: Any = Field(
        default=None,
        validation_alias=AliasChoices("priceAZN", "PriceAZN", "price_azn"),
    )


@app.post("/predict")
def predict(request: PredictIn):
    with model_lock:
        pipeline = PIPELINE
        features_order = FEATURES

    if pipeline is None:
        raise HTTPException(status_code=400, detail="Model could not be loaded")

    try:
        features = {
            "Bedrooms": [request.bedrooms],
            "Bathrooms": [request.bathrooms],
            "Sqm": [request.sqm],
            "City": [request.city],
        }

        features_df = pd.DataFrame(features, columns=features_order)
        prediction = pipeline.predict(features_df)[0]
        return {"PriceAZN": float(prediction)}
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Prediction failed")


@app.post("/apartments")
def add_apartment(request: ApartmentIn):
    try:
        validated = validate_apartment_values(
            bedrooms=request.bedrooms,
            bathrooms=request.bathrooms,
            sqm=request.sqm,
            city=request.city,
            price_azn=request.priceAZN,
        )
        total_records = append_apartments(DATA_PATH, [validated])
        return {
            "message": "Apartment added successfully.",
            "addedCount": 1,
            "totalRecords": total_records,
        }
    except ApartmentValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to add apartment to dataset.")


@app.post("/apartments/import")
async def import_apartments(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="CSV file is required.")

    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are supported.")

    try:
        raw_bytes = await file.read()
        validated_rows = parse_and_validate_csv(raw_bytes)
        total_records = append_apartments(DATA_PATH, validated_rows)
        return {
            "message": f"Successfully imported {len(validated_rows)} apartment records.",
            "addedCount": len(validated_rows),
            "totalRecords": total_records,
        }
    except ApartmentValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to import apartments from CSV.")


@app.post("/retrain")
def retrain():
    global BUNDLE, PIPELINE, FEATURES

    if not retrain_lock.acquire(blocking=False):
        raise HTTPException(
            status_code=409,
            detail="Model retraining is already in progress. Please wait until it completes.",
        )

    try:
        result = retrain_model(DATA_PATH, MODEL_PATH)
        with model_lock:
            BUNDLE = result["bundle"]
            PIPELINE = result["pipeline"]
            FEATURES = result["features"]

        return {
            "message": "Model retrained and reloaded successfully.",
            "recordsUsed": result["recordsUsed"],
            "trainRecords": result["trainRecords"],
            "testRecords": result["testRecords"],
            "metrics": result["metrics"],
            "finishedAt": result["finishedAt"],
        }
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Model retraining failed; previous model remains active. Reason: {exc}",
        )
    finally:
        retrain_lock.release()
