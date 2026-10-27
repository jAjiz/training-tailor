# Training Tailor

The domain library (movements, contraindications, taxonomy, conversions, expectations and eval
cases) has one source of truth: the published version in the database, edited in
`/admin/library`. Don't duplicate library entries in code, tests or docs, where they would drift
from it; examples use the demo library in `data/sample/library.json`.

Tests pin mechanics on invented fixtures (`tests/helpers/library-builders.ts`, names starting
with `Test `). A result that depends on the library's content is a library expectation, added
in `/admin/library`, not a test.
