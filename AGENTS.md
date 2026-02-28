# Scaled Image Edit - Agent Context (non-secret)

## Google Cloud
- Project ID: ai-image-generator-485823
- Service account: use Application Default Credentials (ADC) or a key file set via `GOOGLE_APPLICATION_CREDENTIALS` (do not store secrets here)

## Sheets
- Spreadsheet ID: 1NkL_Er7NP91_DlWThIezDnIz-1yqFFUCnlfASsr073w
- Default tab: Sheet1

## Storage
- GCS bucket: ai_image_generator

## Firestore
- Database: (default)
- Collection: layouts

## Backend (Cloud Run)
- Service name: scaled-image-edit-api
- Service URL: https://scaled-image-edit-api-657587868045.us-east1.run.app
- Runtime service account: ai-image-gen@ai-image-generator-485823.iam.gserviceaccount.com
- Endpoints:
  - `GET /api/config`
  - `GET /api/sheets`
  - `GET /api/rows`
  - `GET /api/image`
  - `POST /api/upload`
  - `GET /api/layouts`
  - `POST /api/layouts`
  - `DELETE /api/layouts`

## Notes
- This file intentionally excludes secrets (API keys, private URLs, or JSON key contents).
- If a key file is needed locally, set `GOOGLE_APPLICATION_CREDENTIALS` to its path.
- Supabase/Vercel are no longer used for this app.

When making new changes, make sure you are viewing your app via an chrome dev MCP or playwright MCP so that you know the changes were applied well