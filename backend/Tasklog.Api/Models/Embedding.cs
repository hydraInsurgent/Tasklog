namespace Tasklog.Api.Models
{
    // One semantic vector per entity per embedding model (#87). Generic across entity
    // types on purpose: "task" rows are embedded in v4.0 for companion grounding, and
    // people / journal entries / vault imports reuse this exact table in later minors.
    //
    // The vector is a raw float32[] stored as a BLOB and compared with brute-force cosine
    // in C# (sub-millisecond at personal scale) - deliberately NO native vector extension
    // (sqlite-vec) until row counts demand one. Rows are best-effort: hosts without a
    // local Ollama (OCI, phone) simply have no rows and search degrades to keyword LIKE.
    public class Embedding
    {
        public int Id { get; set; }

        // What kind of entity this vector belongs to, e.g. "task".
        public string EntityType { get; set; } = "";

        // The id of that entity in its own table.
        public int EntityId { get; set; }

        // Which embedding model produced the vector (e.g. "nomic-embed-text"). Vectors
        // from different models are not comparable, so the model is part of the key and
        // a model swap simply re-embeds into new rows.
        public string Model { get; set; } = "";

        // float32[] as little-endian bytes (4 bytes per dimension).
        public byte[] Vector { get; set; } = Array.Empty<byte>();

        public DateTime UpdatedAt { get; set; }
    }
}
