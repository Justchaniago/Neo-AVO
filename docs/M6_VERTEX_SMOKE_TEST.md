# M6 Vertex Smoke Test

Neo AVO uses its own runtime identity through Google Application Default Credentials. It does not read or reuse credentials from connected projects. Configure the Neo AVO worker runtime with `GOOGLE_CLOUD_PROJECT`, optional `VERTEX_LOCATION` (default `us-central1`), and optional `VERTEX_MODEL` (default `gemini-2.0-flash-001`).

After authenticating the Neo AVO runtime with an appropriate service account or workload identity, set `DATABASE_URL` and choose a real incident ID:

```sh
gcloud auth application-default login
GOOGLE_CLOUD_PROJECT=my-neo-avo-project \
NEO_AVO_SMOKE_INCIDENT_ID=<incident-uuid> \
npm run vertex:smoke
```

The command builds the bounded project-scoped context, calls Vertex once, validates the structured output, and prints only the validated advisory result. It does not execute recommended actions or send Telegram. Production should use workload identity/service-account runtime identity instead of a developer login.
