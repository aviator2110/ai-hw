import csv
import io
import math
import threading
from pathlib import Path
from typing import Any

import pandas as pd

REQUIRED_COLUMNS = ["PriceAZN", "Bedrooms", "Bathrooms", "Sqm", "City"]
FEATURE_COLUMNS = ["Bedrooms", "Bathrooms", "Sqm", "City"]

csv_lock = threading.RLock()


class ApartmentValidationError(ValueError):
    """Raised when apartment input or CSV data fails server-side validation."""


def _parse_positive_int(value: Any, field_name: str) -> int:
    if value is None or isinstance(value, bool):
        raise ApartmentValidationError(f"{field_name} is required and must be a positive integer.")

    if isinstance(value, int):
        parsed = value
    elif isinstance(value, float):
        if not math.isfinite(value) or not value.is_integer():
            raise ApartmentValidationError(f"{field_name} must be a positive integer.")
        parsed = int(value)
    elif isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            raise ApartmentValidationError(f"{field_name} is required and must be a positive integer.")
        try:
            parsed = int(stripped)
        except ValueError as exc:
            raise ApartmentValidationError(f"{field_name} must be a positive integer.") from exc
    else:
        raise ApartmentValidationError(f"{field_name} must be a positive integer.")

    if parsed <= 0:
        raise ApartmentValidationError(f"{field_name} must be greater than 0.")
    return parsed


def _parse_positive_float(value: Any, field_name: str) -> float:
    if value is None or isinstance(value, bool):
        raise ApartmentValidationError(f"{field_name} is required and must be a positive number.")

    if isinstance(value, (int, float)):
        parsed = float(value)
    elif isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            raise ApartmentValidationError(f"{field_name} is required and must be a positive number.")
        try:
            parsed = float(stripped)
        except ValueError as exc:
            raise ApartmentValidationError(f"{field_name} must be a positive number.") from exc
    else:
        raise ApartmentValidationError(f"{field_name} must be a positive number.")

    if not math.isfinite(parsed) or parsed <= 0:
        raise ApartmentValidationError(f"{field_name} must be a positive finite number greater than 0.")
    return parsed


def _parse_city(value: Any) -> str:
    if not isinstance(value, str):
        raise ApartmentValidationError("City is required and must be a non-empty string.")
    stripped = value.strip()
    if not stripped:
        raise ApartmentValidationError("City cannot be empty.")
    if "\n" in stripped or "\r" in stripped:
        raise ApartmentValidationError("City cannot contain line breaks.")
    return stripped


def validate_apartment_values(
    bedrooms: Any,
    bathrooms: Any,
    sqm: Any,
    city: Any,
    price_azn: Any,
) -> dict[str, Any]:
    """Validate and normalize a single apartment record."""
    return {
        "PriceAZN": _parse_positive_float(price_azn, "PriceAZN"),
        "Bedrooms": _parse_positive_int(bedrooms, "Bedrooms"),
        "Bathrooms": _parse_positive_int(bathrooms, "Bathrooms"),
        "Sqm": _parse_positive_float(sqm, "Sqm"),
        "City": _parse_city(city),
    }


def _format_csv_row(record: dict[str, Any]) -> list[str]:
    price = record["PriceAZN"]
    price_str = str(int(price)) if float(price).is_integer() else str(price)
    return [
        price_str,
        str(record["Bedrooms"]),
        str(record["Bathrooms"]),
        str(record["Sqm"]),
        record["City"],
    ]


def _count_csv_records(data_path: Path) -> int:
    with data_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        next(reader, None)  # skip header
        return sum(1 for row in reader if row)


def append_apartments(data_path: Path, records: list[dict[str, Any]]) -> int:
    """Thread-safely append validated apartment records to the end of the CSV."""
    if not records:
        raise ApartmentValidationError("No apartment records to append.")

    with csv_lock:
        if not data_path.exists():
            raise FileNotFoundError(f"Dataset file not found: {data_path}")

        with data_path.open("rb") as f:
            content = f.read()

        needs_newline = len(content) > 0 and not content.endswith(b"\n")

        with data_path.open("a", encoding="utf-8", newline="") as f:
            if needs_newline:
                f.write("\n")
            writer = csv.writer(f)
            for record in records:
                writer.writerow(_format_csv_row(record))

        return _count_csv_records(data_path)


def parse_and_validate_csv(raw_bytes: bytes) -> list[dict[str, Any]]:
    """Parse an uploaded CSV file and validate headers and every row atomically."""
    if not raw_bytes:
        raise ApartmentValidationError("Uploaded CSV file is empty.")

    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ApartmentValidationError("CSV file must be encoded in UTF-8.") from exc

    reader = csv.reader(io.StringIO(text, newline=""))
    header = next(reader, None)
    if not header:
        raise ApartmentValidationError("CSV file is empty.")

    cleaned_header = [col.strip() for col in header]
    if len(cleaned_header) != len(set(cleaned_header)):
        raise ApartmentValidationError("CSV header contains duplicate column names.")

    missing = [col for col in REQUIRED_COLUMNS if col not in cleaned_header]
    if missing:
        raise ApartmentValidationError(
            f"Missing required CSV columns: {', '.join(missing)}. "
            f"Expected columns: {', '.join(REQUIRED_COLUMNS)}."
        )

    col_index = {col: cleaned_header.index(col) for col in REQUIRED_COLUMNS}
    validated_rows: list[dict[str, Any]] = []

    for line_num, row in enumerate(reader, start=2):
        if not row or all(cell.strip() == "" for cell in row):
            raise ApartmentValidationError(f"Row {line_num}: empty row is not allowed.")

        if len(row) != len(cleaned_header):
            raise ApartmentValidationError(
                f"Row {line_num}: expected {len(cleaned_header)} columns, got {len(row)}."
            )

        try:
            validated = validate_apartment_values(
                bedrooms=row[col_index["Bedrooms"]],
                bathrooms=row[col_index["Bathrooms"]],
                sqm=row[col_index["Sqm"]],
                city=row[col_index["City"]],
                price_azn=row[col_index["PriceAZN"]],
            )
        except ApartmentValidationError as exc:
            raise ApartmentValidationError(f"Row {line_num}: {exc}") from exc

        validated_rows.append(validated)

    if not validated_rows:
        raise ApartmentValidationError("CSV file contains headers only and no apartment records.")

    return validated_rows


def read_dataset(data_path: Path) -> pd.DataFrame:
    """Thread-safely read the main dataset CSV into a DataFrame."""
    with csv_lock:
        if not data_path.exists():
            raise FileNotFoundError(f"Dataset file not found: {data_path}")
        return pd.read_csv(data_path)
