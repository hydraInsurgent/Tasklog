# JSON-as-TEXT columns in relational databases

**Last updated:** 2026-07-04 - first encountered in Journaling (#79, v3.0.0)

Relational schemas want every field declared up front; some data refuses to hold still. When a record's shape must evolve without migrations - a journal entry whose sections change as the template evolves, a settings object, a form with user-defined fields - one honest option is to store the whole flexible part as a JSON string in a single TEXT column and let the application give it meaning. Tasklog's journal introduced this pattern: entries persist a `ContentJson` column, templates persist their section definitions the same way, and SQLite never looks inside either.

## Mental model

The database stores an envelope; the application owns the letter. SQL can find the row (by date, by foreign key, by any REAL column beside the blob) but cannot meaningfully filter, join, or index on what is inside the blob. The pattern is therefore a deliberate trade: schema flexibility for content, purchased by giving up SQL-level access to that content. The discipline that keeps it honest is a single sorting rule: anything you need to QUERY gets a real column; the JSON blob is only for shape-flexible content you read whole. In Tasklog, mood energy and Map-of-Consciousness level are real columns (future charts filter on them) while journal prose lives in the blob (a day is always loaded whole).

## Why it exists / what problem it solves

The alternatives all cost more than they return for content-shaped data. Full normalization (a Sections table, a SectionValues table, a type column) models flexibility relationally but turns "load one day's note" into joins and every template tweak into data gymnastics. Adding real columns per field means a schema migration every time the shape evolves - exactly the friction the flexible design exists to avoid. Document databases solve it natively but bring a second storage engine into a system that otherwise fits one SQLite file. ORMs offer a middle path (EF Core's owned-entity `ToJson`, Postgres `jsonb` mapping) that adds query-ability at the cost of mapping machinery and generated SQL that is harder to reason about. Plain TEXT plus explicit serialize/deserialize in application code is the version a single maintainer can read top to bottom.

## How it actually works

```
JournalEntries
  Id          INTEGER   <- real column: primary key
  TemplateId  INTEGER   <- real column: FK, joinable, cascade rules work
  EntryDate   TEXT      <- real column: unique index (TemplateId, EntryDate) works
  ContentJson TEXT      <- envelope: '{"mind_dump":"...","todays_plan":{...}}'

write path:  object --serialize--> string --> ordinary UPDATE/INSERT
read path:   SELECT ... --> string --deserialize--> object
```

Everything relational (uniqueness, foreign keys, cascade deletes, date-range scans) keeps working because it runs on the real columns. The blob rides along untouched. Validation moves to the application boundary: the API checks "is this a JSON object" and enforces a size cap on write, because the database will happily store any string. Consumers of the shape (in Tasklog: the TypeScript client contract and the C# markdown renderer) form a paired contract that must change together - the schema now lives in code comments and tests instead of in `CREATE TABLE`.

## Common misconceptions

- "It is not queryable at all." Most engines can reach inside JSON when needed (SQLite `json_extract`, Postgres `->>`), but doing so without expression indexes is a full-table scan wearing SQL syntax; treat it as an escape hatch, not a design assumption.
- "Schema-less means validation-less." The shape contract did not disappear, it moved: to the application layer, where it must be enforced (type checks, size caps) and documented, or it drifts silently.
- "We can always add the column later if we need to query a field." True, but the backfill (parse every row's blob, extract, populate the column) is itself a migration - the pattern defers that cost, it does not delete it. Promote fields early when a query need is foreseeable.
- "Since we have a JSON column, everything flexible can go in it." The blob attracts data like a junk drawer. Without the query-rule the design degrades into an unindexable table-in-a-cell.
- "ORM-native JSON mapping is strictly better." It buys LINQ-into-JSON at the price of mapping configuration, provider-specific behavior, and less obvious SQL. For opaque-by-design content the plain string is simpler and equally correct.

## When it matters in practice

- Template-driven content where users or code evolve the template: journal sections, form builders, CMS blocks. New section = template edit, zero migrations, old rows keep the shape they were written with.
- Settings/preferences objects read and written whole, one per user or per install.
- Event payloads in an outbox or audit table: the envelope columns (type, timestamp, aggregate id) are queried; the payload is replayed whole.
- The counter-case that should stay relational: anything you will filter, sort, aggregate, or join on - the moment "show me all entries where energy < 3" is a requirement, energy is a column, not a JSON key.

## Configuration in common stacks

- .NET / EF Core: plain `string` property + `System.Text.Json` (de)serialization in application code (the Tasklog choice), or `OwnsOne(...).ToJson()` for mapped JSON with LINQ support (EF 7+).
- Postgres: `jsonb` column with `->>` operators and GIN expression indexes when partial query-ability is genuinely needed.
- SQLite: TEXT column + the `json1` functions (`json_extract`, `json_each`) as the escape hatch.

## Further reading

- SQLite JSON1 extension: https://www.sqlite.org/json1.html
- EF Core JSON columns (owned entities, `ToJson`): https://learn.microsoft.com/en-us/ef/core/what-is-new/ef-core-7.0/whatsnew#json-columns
- PostgreSQL JSON types (`json` vs `jsonb`): https://www.postgresql.org/docs/current/datatype-json.html
