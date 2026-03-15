# Scaled Image Edit (local prototype)

A local, no-build web UI to design a bulk image template against the CSV or a Google Sheet.
Edit one row, apply to all.

## Run locally

Run the FastAPI app directly so the editor and API share the same origin:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python server.py
```

Then open http://127.0.0.1:3001 in your browser.

If the default CSV does not auto-load, click **Load default CSV** or pick a file manually.

## What works

- 1080x1080 editor canvas with higher-resolution PNG export options
- Includes a "Four Squares (2x2)" preset for four equal square image slots
- Unlimited layers: images, text, shapes (with backup columns)
- Drag layers; image layers move by default, shift-drag to move the crop inside the frame
- Scroll on image layers to zoom in/out (range 0.3–4)
- Text blocks with {column} tokens, typography controls, and backup columns
- Export to Google Sheets: uploads to GCS and writes URL into selected column
- Bulk export range (start/end rows)
- Quick preview range (generate thumbnail grid)
- Auto-saves template to localStorage

## Notes

- If you see "No image", the column is empty for that row or image load failed.
- Canvas export may fail for URLs without CORS headers. If that happens, we will add a local proxy/server step.

## Sheets + GCS config

Set in `.env` (already provided in this repo):

- `GOOGLE_APPLICATION_CREDENTIALS`
- `SHEET_ID`
- `SHEET_DEFAULT_TAB`
- `GCS_BUCKET`

The UI allows selecting the output column to update and a bulk export range.

See `IMAGE_APP_CONTEXT.md` for existing Sheets + GCS details (do not commit secrets).
