using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Tasklog.Api.Data;
using Tasklog.Api.Models;

namespace Tasklog.Api.Services
{
    // Local semantic embeddings via Ollama (#87). The first true DI service in the
    // codebase (unlike the pure static helpers beside it, it needs an HttpClient and the
    // DbContext). Everything here is BEST-EFFORT by contract: any Ollama failure returns
    // null / no-ops, because embeddings are an enrichment - a task write or a search must
    // never fail because the local model is down (hosts without Ollama, e.g. the OCI VM
    // or the phone, simply never get vectors and search falls back to keyword).
    //
    // Vectors are raw float32 little-endian BLOBs compared with brute-force cosine in
    // C# - deliberately no native vector extension at personal scale (see P87 Decision 7).
    public class EmbeddingService
    {
        // Part of each Embeddings row's key: vectors from different models are not
        // comparable, so a model swap re-embeds into new rows instead of corrupting these.
        public const string ModelName = "nomic-embed-text";

        private readonly HttpClient _http;
        private readonly TasklogDbContext _context;
        private readonly ILogger<EmbeddingService> _logger;

        public EmbeddingService(HttpClient http, TasklogDbContext context,
            IConfiguration config, ILogger<EmbeddingService> logger)
        {
            _http = http;
            _context = context;
            _logger = logger;
            _http.BaseAddress = new Uri(config["Ollama:Url"] ?? "http://localhost:11434");
            // Generous enough for a cold model load on CPU, short enough that an absent
            // Ollama fails a request fast (connection refused is immediate anyway).
            _http.Timeout = TimeSpan.FromSeconds(20);
        }

        // Embed one text. Null on ANY failure (Ollama absent, model missing, timeout) -
        // callers treat null as "no semantic signal available".
        public async Task<float[]?> EmbedAsync(string text)
        {
            try
            {
                var response = await _http.PostAsJsonAsync("/api/embed",
                    new { model = ModelName, input = text });
                if (!response.IsSuccessStatusCode) return null;

                var body = await response.Content.ReadFromJsonAsync<JsonElement>();
                if (!body.TryGetProperty("embeddings", out var embeddings) ||
                    embeddings.ValueKind != JsonValueKind.Array ||
                    embeddings.GetArrayLength() == 0)
                    return null;

                return embeddings[0].EnumerateArray().Select(v => v.GetSingle()).ToArray();
            }
            catch (Exception ex)
            {
                _logger.LogDebug("Embedding unavailable: {Reason}", ex.Message);
                return null;
            }
        }

        // Embed-on-write: upsert the vector for one entity. Swallows failure entirely -
        // the caller's SaveChanges has already happened and must stay committed.
        // `precomputed` lets a caller that already embedded the text (the backfill
        // probe, review R24) skip a second Ollama round-trip.
        public async Task UpsertAsync(string entityType, int entityId, string text, float[]? precomputed = null)
        {
            var vector = precomputed ?? await EmbedAsync(text);
            if (vector is null) return;

            try
            {
                var row = await _context.Embeddings.FirstOrDefaultAsync(e =>
                    e.EntityType == entityType && e.EntityId == entityId && e.Model == ModelName);
                if (row is null)
                {
                    row = new Embedding { EntityType = entityType, EntityId = entityId, Model = ModelName };
                    _context.Embeddings.Add(row);
                }
                row.Vector = ToBytes(vector);
                row.UpdatedAt = DateTime.Now;
                await _context.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                _logger.LogDebug("Embedding upsert failed for {Type}/{Id}: {Reason}",
                    entityType, entityId, ex.Message);
            }
        }

        // Bounded catch-up for open tasks with no vector yet: covers rows created while
        // Ollama was down and the pre-#87 backlog. Called fire-and-forget at startup.
        public async Task BackfillOpenTasksAsync(int max = 500)
        {
            var embedded = await _context.Embeddings
                .Where(e => e.EntityType == "task" && e.Model == ModelName)
                .Select(e => e.EntityId)
                .ToListAsync();
            var missing = await _context.Tasks
                .Where(t => !t.IsCompleted && !embedded.Contains(t.Id))
                .OrderByDescending(t => t.Id)
                .Take(max)
                .Select(t => new { t.Id, t.Title })
                .ToListAsync();

            foreach (var task in missing)
            {
                // One probe is enough to learn Ollama is absent - stop, don't hammer.
                var vector = await EmbedAsync(task.Title);
                if (vector is null) return;
                await UpsertAsync("task", task.Id, task.Title, vector);
            }
            if (missing.Count > 0)
                _logger.LogInformation("Embedding backfill covered {Count} tasks.", missing.Count);
        }

        // float32[] <-> little-endian bytes (4 bytes/dim). MemoryMarshal is exact and
        // allocation-cheap; SQLite stores the bytes verbatim.
        public static byte[] ToBytes(float[] vector) =>
            MemoryMarshal.AsBytes<float>(vector).ToArray();

        public static float[] FromBytes(byte[] bytes) =>
            MemoryMarshal.Cast<byte, float>(bytes).ToArray();

        // Ranks candidate entities by cosine similarity to a query vector: the pure,
        // provider-free core of semantic search (review R34 - unit-testable without
        // Ollama, the ComputeDueStatus/RecurrenceRule shape).
        public static List<(int EntityId, double Score)> RankBySimilarity(
            float[] queryVector, IReadOnlyDictionary<int, byte[]> vectorsByEntityId, int limit)
        {
            return vectorsByEntityId
                .Select(kv => (EntityId: kv.Key, Score: Cosine(queryVector, FromBytes(kv.Value))))
                .OrderByDescending(x => x.Score)
                .Take(limit)
                .ToList();
        }

        // Plain cosine similarity. Not assuming pre-normalized vectors.
        public static double Cosine(float[] a, float[] b)
        {
            if (a.Length != b.Length || a.Length == 0) return 0;
            double dot = 0, magA = 0, magB = 0;
            for (var i = 0; i < a.Length; i++)
            {
                dot += (double)a[i] * b[i];
                magA += (double)a[i] * a[i];
                magB += (double)b[i] * b[i];
            }
            if (magA == 0 || magB == 0) return 0;
            return dot / (Math.Sqrt(magA) * Math.Sqrt(magB));
        }
    }
}
