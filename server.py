import base64
import os
import re
import time
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google.oauth2 import service_account
from googleapiclient.discovery import build
from google.cloud import storage
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError


def load_env():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.exists(env_path):
        return
    with open(env_path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key and key not in os.environ:
                os.environ[key] = value.strip().strip('"')


load_env()

SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
GCS_SCOPES = ["https://www.googleapis.com/auth/devstorage.read_write"]
SCOPES = list(set(SHEETS_SCOPES + GCS_SCOPES))

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"] ,
)


def get_credentials():
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not cred_path:
        raise RuntimeError("GOOGLE_APPLICATION_CREDENTIALS not set")
    if not os.path.exists(cred_path):
        raise RuntimeError(f"Credentials file not found: {cred_path}")
    return service_account.Credentials.from_service_account_file(cred_path, scopes=SCOPES)


def get_sheets_service():
    creds = get_credentials()
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def get_storage_client():
    creds = get_credentials()
    return storage.Client(project=creds.project_id, credentials=creds)


def get_sheet_id(sheet_id: Optional[str]):
    env_sheet = os.environ.get("SHEET_ID")
    return normalize_sheet_id(sheet_id or env_sheet)


def normalize_sheet_id(value: Optional[str]):
    if not value:
        return value
    value = value.strip()
    if "docs.google.com/spreadsheets" in value:
        match = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", value)
        if match:
            return match.group(1)
        match = re.search(r"[?&]id=([a-zA-Z0-9-_]+)", value)
        if match:
            return match.group(1)
    return value


def column_to_a1(index: int) -> str:
    if index < 0:
        raise ValueError("Column index must be non-negative")
    result = ""
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


class UploadColumns(BaseModel):
    url: str = "gen image"


class UploadRequest(BaseModel):
    sheet_id: Optional[str] = None
    tab: str
    row_index: int
    header_row: int = 1
    output_columns: UploadColumns = UploadColumns()
    data_url: str


@app.get("/api/config")
def api_config():
    return {
        "sheetId": os.environ.get("SHEET_ID", ""),
        "defaultTab": os.environ.get("SHEET_DEFAULT_TAB", ""),
        "bucket": os.environ.get("GCS_BUCKET", ""),
    }


@app.get("/api/image")
def api_image(url: str):
    if not url.startswith("http"):
        raise HTTPException(status_code=400, detail="Invalid URL")
    try:
        request = Request(url, headers={"User-Agent": "ScaledImageEdit/1.0"})
        with urlopen(request, timeout=15) as response:
            data = response.read()
            content_type = response.headers.get("Content-Type", "image/jpeg")
    except (HTTPError, URLError, TimeoutError) as exc:
        raise HTTPException(status_code=400, detail="Unable to fetch image") from exc
    return Response(content=data, media_type=content_type)


@app.get("/api/sheets")
def api_sheets(sheet_id: Optional[str] = None):
    sheet_id = get_sheet_id(sheet_id)
    if not sheet_id:
        raise HTTPException(status_code=400, detail="Sheet ID missing")
    service = get_sheets_service()
    spreadsheet = service.spreadsheets().get(spreadsheetId=sheet_id).execute()
    tabs = [sheet["properties"]["title"] for sheet in spreadsheet.get("sheets", [])]
    return {"tabs": tabs}


@app.get("/api/rows")
def api_rows(sheet_id: Optional[str] = None, tab: Optional[str] = None, limit: int = 500, header_row: int = 1):
    sheet_id = get_sheet_id(sheet_id)
    if not sheet_id:
        raise HTTPException(status_code=400, detail="Sheet ID missing")
    if not tab:
        tab = os.environ.get("SHEET_DEFAULT_TAB", "")
    if not tab:
        raise HTTPException(status_code=400, detail="Sheet tab missing")

    service = get_sheets_service()
    start_row = max(1, header_row)
    end_row = start_row + limit
    range_name = f"'{tab}'!A{start_row}:ZZ{end_row}"
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=sheet_id, range=range_name)
        .execute()
    )
    values = result.get("values", [])
    if not values:
        return {"columns": [], "rows": []}
    columns = values[0]
    rows = values[1:]
    return {"columns": columns, "rows": rows, "headerRow": start_row}


@app.post("/api/upload")
def api_upload(payload: UploadRequest):
    sheet_id = get_sheet_id(payload.sheet_id)
    if not sheet_id:
        raise HTTPException(status_code=400, detail="Sheet ID missing")

    if not payload.data_url.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Invalid data_url")

    if "," not in payload.data_url:
        raise HTTPException(status_code=400, detail="Invalid data_url")

    header, encoded = payload.data_url.split(",", 1)
    try:
        data = base64.b64decode(encoded)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Unable to decode image") from exc

    bucket_name = os.environ.get("GCS_BUCKET")
    if not bucket_name:
        raise HTTPException(status_code=400, detail="GCS_BUCKET missing")

    object_name = f"generated/{payload.tab}/row-{payload.row_index + 1}-{int(time.time())}.png"

    storage_client = get_storage_client()
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(object_name)
    blob.upload_from_string(data, content_type="image/png")

    public_url = f"https://storage.googleapis.com/{bucket_name}/{object_name}"

    service = get_sheets_service()
    header_row = payload.header_row or 1
    header_range = f"'{payload.tab}'!{header_row}:{header_row}"
    header_result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=sheet_id, range=header_range)
        .execute()
    )
    header_values = header_result.get("values", [[]])
    headers = header_values[0] if header_values else []

    desired = [payload.output_columns.url]
    updated = False
    for col in desired:
        if col not in headers:
            headers.append(col)
            updated = True

    if updated:
        service.spreadsheets().values().update(
            spreadsheetId=sheet_id,
            range=header_range,
            valueInputOption="RAW",
            body={"values": [headers]},
        ).execute()

    header_index = {name: idx for idx, name in enumerate(headers)}
    row_number = payload.row_index + header_row + 1

    updates = {
        payload.output_columns.url: public_url,
    }

    for key, value in updates.items():
        col_index = header_index.get(key)
        if col_index is None:
            continue
        cell = f"'{payload.tab}'!{column_to_a1(col_index)}{row_number}"
        service.spreadsheets().values().update(
            spreadsheetId=sheet_id,
            range=cell,
            valueInputOption="RAW",
            body={"values": [[value]]},
        ).execute()

    return {
        "url": public_url,
        "object": object_name,
        "rowIndex": payload.row_index,
        "sheetRow": row_number,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3001)
