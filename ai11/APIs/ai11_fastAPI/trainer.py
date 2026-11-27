import os
from datetime import datetime
from pathlib import Path
from typing import Any

import joblib
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    root_mean_squared_error,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from data_service import FEATURE_COLUMNS, REQUIRED_COLUMNS, read_dataset

TARGET_COLUMN = "PriceAZN"
NUMERIC_FEATURES = ["Bedrooms", "Bathrooms", "Sqm"]
CATEGORICAL_FEATURES = ["City"]


def load_model_bundle(model_path: Path) -> tuple[dict[str, Any], Any, list[str]]:
    """Load the persisted joblib model bundle and return (bundle, pipeline, feature_order)."""
    loaded = joblib.load(model_path)
    if not isinstance(loaded, dict) or "pipeline" not in loaded:
        raise ValueError("Invalid model bundle format: missing 'pipeline' key.")
    pipeline = loaded["pipeline"]
    features = loaded.get("featured_order", FEATURE_COLUMNS)
    return loaded, pipeline, features


def build_training_pipeline() -> Pipeline:
    """Build the preprocessing + RandomForestRegressor pipeline matching Train model.ipynb."""
    numeric_transformers = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
        ]
    )

    categorical_transformers = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_transformers, NUMERIC_FEATURES),
            ("cat", categorical_transformers, CATEGORICAL_FEATURES),
        ]
    )

    rf = RandomForestRegressor(n_estimators=300, random_state=42, n_jobs=-1)

    return Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("model", rf),
        ]
    )


def retrain_model(data_path: Path, model_path: Path) -> dict[str, Any]:
    """Read the CSV dataset, train a new model pipeline, evaluate metrics, and save atomically."""
    data = read_dataset(data_path)

    missing_cols = [col for col in REQUIRED_COLUMNS if col not in data.columns]
    if missing_cols:
        raise ValueError(f"Dataset is missing required columns: {', '.join(missing_cols)}")

    if len(data) < 5:
        raise ValueError("Dataset must contain at least 5 records to train and evaluate the model.")

    y = data[TARGET_COLUMN].astype(float)
    X = data[FEATURE_COLUMNS]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    pipe = build_training_pipeline()
    pipe.fit(X_train, y_train)

    pred = pipe.predict(X_test)
    metrics = {
        "mae": round(float(mean_absolute_error(y_test, pred)), 4),
        "mse": round(float(mean_squared_error(y_test, pred)), 4),
        "rmse": round(float(root_mean_squared_error(y_test, pred)), 4),
        "r2": round(float(r2_score(y_test, pred)), 6),
    }

    bundle: dict[str, Any] = {
        "pipeline": pipe,
        "featured_order": FEATURE_COLUMNS,
    }

    model_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = model_path.with_name(f"{model_path.name}.tmp")
    try:
        joblib.dump(bundle, tmp_path)
        os.replace(tmp_path, model_path)
    except Exception:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
        raise

    finished_at = datetime.now().astimezone().isoformat(timespec="seconds")

    return {
        "bundle": bundle,
        "pipeline": pipe,
        "features": FEATURE_COLUMNS,
        "recordsUsed": int(len(data)),
        "trainRecords": int(len(X_train)),
        "testRecords": int(len(X_test)),
        "metrics": metrics,
        "finishedAt": finished_at,
    }
