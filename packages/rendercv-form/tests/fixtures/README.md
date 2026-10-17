# Test fixtures

## `rendercv-cv-schema.json`

A snapshot of the **dereferenced `$defs.Cv`** from the RenderCV `v2.8` schema
(`https://raw.githubusercontent.com/rendercv/rendercv/refs/tags/v2.8/schema.json`), i.e. the same
section schema `loadSchemas()` hands to `<FormRenderer>` for the `cv` key.

It is committed so the validation tests can assert against a *real* schema — the
interchangeable section options (their `items.required` lists disambiguate them), the free-form
section map, the `anyOf`-with-`null` optional markers, and the custom Pydantic types that carry
only a `default` — without a network fetch. The `design` / `locale` / `settings` sections used by the tests are small
hand-written schemas (see `validate.test.ts`), since only their union / exclusive-group shapes
matter there.

Refresh it by re-running the playground's schema fetch, or with the opt-in live test:

```bash
RENDERC_V_LIVE_SCHEMA=1 npm test -w @r3dacted42/rendercv-form
```
