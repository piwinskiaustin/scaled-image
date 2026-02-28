import base64
import os
import re
import time
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import google.auth
from google.oauth2 import service_account
from googleapiclient.discovery import build
from google.cloud import firestore
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
FIRESTORE_SCOPES = ["https://www.googleapis.com/auth/datastore"]
SCOPES = list(set(SHEETS_SCOPES + GCS_SCOPES + FIRESTORE_SCOPES))

BASE_DIR = os.path.dirname(__file__)
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"] ,
)
app.mount("/static", StaticFiles(directory=BASE_DIR), name="static")


def get_credentials():
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if cred_path:
        if not os.path.exists(cred_path):
            raise RuntimeError(f"Credentials file not found: {cred_path}")
        return service_account.Credentials.from_service_account_file(cred_path, scopes=SCOPES)
    credentials, _ = google.auth.default(scopes=SCOPES)
    if not credentials:
        raise RuntimeError("Google credentials not available")
    return credentials


def get_sheets_service():
    creds = get_credentials()
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def get_storage_client():
    creds = get_credentials()
    project_id = get_firestore_project_id()
    return storage.Client(project=project_id, credentials=creds)


def get_firestore_project_id():
    env_project = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCP_PROJECT")
    if env_project:
        return env_project
    creds = get_credentials()
    return getattr(creds, "project_id", None)


def get_firestore_client():
    project_id = get_firestore_project_id()
    creds = get_credentials()
    return firestore.Client(project=project_id, credentials=creds)


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


class LayoutPayload(BaseModel):
    name: str
    template: dict


@app.get("/")
def root():
    return FileResponse(os.path.join(BASE_DIR, "index.html"))


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


@app.get("/api/layouts")
def api_layouts(name: Optional[str] = None):
    db = get_firestore_client()
    collection = db.collection("layouts")
    if name:
        doc = collection.document(name).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Not found")
        data = doc.to_dict() or {}
        template = data.get("template")
        if template is None:
            raise HTTPException(status_code=404, detail="Not found")
        return {"name": name, "template": template}

    layouts = []
    try:
        docs = collection.order_by("updated_at", direction=firestore.Query.DESCENDING).stream()
    except Exception:
        docs = collection.stream()
    for doc in docs:
        layouts.append({"name": doc.id})
    return {"layouts": layouts}


@app.post("/api/layouts")
def api_layouts_save(payload: LayoutPayload):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name and template required")
    db = get_firestore_client()
    doc_ref = db.collection("layouts").document(name)
    existing = doc_ref.get()
    data = {
        "name": name,
        "template": payload.template,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }
    if not existing.exists:
        data["created_at"] = firestore.SERVER_TIMESTAMP
    doc_ref.set(data, merge=True)
    return {"name": name}


@app.delete("/api/layouts")
def api_layouts_delete(name: Optional[str] = None):
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    db = get_firestore_client()
    doc_ref = db.collection("layouts").document(name)
    doc_ref.delete()
    return {"ok": True}


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


def get_port() -> int:
    value = os.environ.get("PORT", "3001")
    try:
        return int(value)
    except ValueError:
        return 3001


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=get_port())
