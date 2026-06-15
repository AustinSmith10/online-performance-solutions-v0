# Stockland Template — Token Mapping

**Template file:** `stockland_template_v1.docx`  
**Completed:** 2026-06-05  
**Relates to:** Issue #1 — Template Placeholder Mapping Session

---

## Overview

This document is the authoritative record of all placeholder tokens in the Stockland PBDB template, their naming conventions, data sources, and resolution logic. No form fields, database schema, or document generation code should be written without reference to this mapping.

---

## Token Convention

- Single curly braces: `{TOKEN_NAME}`
- ALL_CAPS with underscores
- Prefixed by source group (see groups below)
- Validated and replaced by `docxtemplater` at PBDB generation time

---

## Token Groups

### `CLIENT`_ — Client form input

Values entered manually by the client on the submission form.


| Token              | Description          | Occurrences      |
| ------------------ | -------------------- | ---------------- |
| `{CLIENT_ADDRESS}` | Site/project address | 6 (body + cover) |


---

### `EXTRACT_` — System-populated from uploaded plans

Values extracted by Claude (Haiku) from the uploaded building plans. All `EXTRACT_` tokens are resolved before `docxtemplater` runs — the client and consultant do not enter these manually.


| Token                          | Description                                      | How resolved                                     |
| ------------------------------ | ------------------------------------------------ | ------------------------------------------------ |
| `{EXTRACT_HOUSE_TYPE}`         | House/dwelling type                              | Claude reads directly from plans                 |
| `{EXTRACT_SITE_WD_NO}`         | Site working drawing number                      | Claude reads directly from plans                 |
| `{EXTRACT_FLOOR_WD_NO}`        | Floor working drawing number                     | Claude reads directly from plans                 |
| `{EXTRACT_ROOF_WD_NO}`         | Roof working drawing number                      | Claude reads directly from plans                 |
| `{EXTRACT_DRAW_DATE}`          | Date shown on drawings                           | Claude reads directly from plans                 |
| `{EXTRACT_TRUSTEE}`            | Full Stockland trustee entity name               | Matrix lookup via `EXTRACT_DEV_NAME` (see below) |
| `{EXTRACT_RAINFALL_INTENSITY}` | AEP rainfall intensity value for the development | Matrix lookup via `EXTRACT_DEV_NAME` (see below) |


#### Silent extraction key: `EXTRACT_DEV_NAME`

`EXTRACT_DEV_NAME` is **not a template token** — it does not appear in the `.docx` file. It is extracted by Claude from the plans (e.g. `Halcyon Promenade`) and used internally to key the development lookup table, which resolves `{EXTRACT_TRUSTEE}` and `{EXTRACT_RAINFALL_INTENSITY}`.

**Development lookup table** (stored in DB, sourced from `DDEG Project Details - PSR_.xlsx`):


| Development Name   | Project Code | AEP | Trustee Entity                                                                                                |
| ------------------ | ------------ | --- | ------------------------------------------------------------------------------------------------------------- |
| Halcyon Promenade  | 2110         | 240 | Stockland LLC No. 2 Pty Ltd ACN 651 781 556 in its capacity as trustee for the Stockland LLC Burpengary Trust |
| Halcyon Edgebrook  | 2113         | 233 | Stockland LLC No. 4 Pty Ltd ACN 657 303 501 in its capacity as trustee for the GRRP LLC Crystal Trust         |
| Halcyon Vista      | 2114         | 220 | Stockland LLC No. 4 Pty Ltd ACN 657 303 501 in its capacity as trustee for the GRRP LLC Crystal Trust         |
| Halcyon Dales      | 2115         | 251 | Stockland LLC Halcyon Dales Pty Ltd ACN 641 671 507                                                           |
| Halcyon Serrata    | 2116         | 240 | Stockland LLC No. 2 Pty Ltd ACN 651 781 556 in its capacity as trustee for the Stockland LLC Burpengary Trust |
| Halcyon Coves      | 2117         | 259 | Stockland LLC No. 4 Pty Ltd ACN 657 303 501 in its capacity as trustee for the GRRP LLC Crystal Trust         |
| Halcyon Providence | 2119         | 217 | Stockland LLC No. 4 Pty Ltd ACN 657 303 501 in its capacity as trustee for the SLLP1 Providence Trust         |
| Halcyon Yandina    | 2120         | 248 | Halcyon TF Pty Ltd (ACN: 64 6217 594)                                                                         |


---

### `ORG_` — Organisation-level config

Values set once by the Super Admin at the Stockland organisation level. These are the same across all Halcyon developments.


| Token                  | Description           | Value (Stockland)                       |
| ---------------------- | --------------------- | --------------------------------------- |
| `{ORG_BUILDER_COY}`    | Builder company name  | Halcyon Constructions QLD (Mark Pitman) |
| `{ORG_CERTIFIER_COY}`  | Certifier company     | GMA Certification                       |
| `{ORG_CERTIFIER_NAME}` | Certifier person name | Christopher Pomeroy                     |


---

### `PROJECT_` — Consultant-entered per project

Values entered by the assigned consultant during the PBDB generation step (Issue #15).


| Token          | Description                  | Occurrences            |
| -------------- | ---------------------------- | ---------------------- |
| `{PROJECT_NO}` | DDEG-assigned project number | 2 (body + page header) |


---

### `SYS_` — Auto-generated by the system

Values computed and written by the system at generation time. No user input required.


| Token            | Description                         | Logic                       |
| ---------------- | ----------------------------------- | --------------------------- |
| `{SYS_GEN_DATE}` | Date the PBDB document is generated | Timestamp at generation     |
| `{SYS_REV_NO}`   | Revision number                     | Increments per review cycle |
| `{SYS_SUB_DATE}` | Original client submission date     | Pulled from project record  |


---

## Full Token Count


| Group      | Tokens             | Template occurrences |
| ---------- | ------------------ | -------------------- |
| `CLIENT_`  | 1                  | 6                    |
| `EXTRACT_` | 7 (+ 1 silent key) | 7                    |
| `ORG_`     | 3                  | 7                    |
| `PROJECT_` | 1                  | 2                    |
| `SYS_`     | 3                  | 5                    |
| **Total**  | **15**             | **27**               |


---

## Notes

- `{ORG_TRUSTEE_SIGNATORY}` (Scott Ng) is **not required** in the template.
- The `DEV_` prefix was considered for trustee and rainfall tokens but rejected — `EXTRACT_` is sufficient since both are system-populated regardless of whether the value comes directly from the document or via a matrix lookup.
- Template uses single curly braces `{TOKEN}`, compatible with `docxtemplater` defaults (no Angular parser required).

