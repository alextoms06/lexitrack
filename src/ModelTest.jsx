
import { useState } from "react";
import { classifyQuery } from "./meaningModule.js";

const sampleQueries = [
  "ephemeral meaning",
  "can you explain what ubiquitous means",
  "best phone for college",
  "how does a MOSFET work"
];

export default function ModelTest({ embedded = false }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function testQueries(queries) {
    setIsLoading(true);
    setError("");
    setResults([]);

    try {
      const nextResults = [];
      for (const text of queries) {
        const result = await classifyQuery(text);
        nextResults.push({ query: text, ...result });
        setResults([...nextResults]);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    const text = query.trim();
    if (text) testQueries([text]);
  }

  return (
    <section className={`model-test ${embedded ? "model-test-embedded" : ""}`} aria-labelledby="model-title">
      <section className="model-panel" aria-labelledby="model-title">
        <div className="model-heading">
          <span className="model-mark" aria-hidden="true">L</span>
          <span className="eyebrow">LEXITRACK · MODEL LAB</span>
        </div>
        <p className="model-kicker">ON-DEVICE QUERY CLASSIFIER</p>
        <h1 id="model-title">Test the meaning model<span>.</span></h1>
        <p className="model-intro">
          Check whether a search looks like someone asking for a word's meaning.
          The model loads the first time you run a test.
        </p>

        <form className="model-form" onSubmit={handleSubmit}>
          <label htmlFor="model-query">Try your own query</label>
          <div className="model-input-row">
            <input
              id="model-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. what does mellifluous mean"
              disabled={isLoading}
            />
            <button className="button button-dark" type="submit" disabled={isLoading || !query.trim()}>
              {isLoading ? "Testing…" : "Test query"}
            </button>
          </div>
        </form>

        <div className="model-samples">
          <div>
            <h2>Sample set</h2>
            <p>Run four meaning and non-meaning examples.</p>
          </div>
          <button
            className="button button-quiet"
            type="button"
            onClick={() => testQueries(sampleQueries)}
            disabled={isLoading}
          >
            {isLoading ? "Running…" : "Run samples"}
          </button>
        </div>

        {isLoading && (
          <p className="model-status" role="status">
            Loading the model or classifying query {results.length + 1}…
          </p>
        )}
        {error && <p className="model-error" role="alert">Model test failed: {error}</p>}

        {results.length > 0 && (
          <div className="model-results" aria-live="polite">
            {results.map((result) => (
              <article className="model-result" key={result.query}>
                <div>
                  <h3>{result.query}</h3>
                  <p>Meaning {result.meaningScore.toFixed(3)} · Other {result.otherScore.toFixed(3)}</p>
                </div>
                <span className={result.isMeaningQuery ? "model-badge is-meaning" : "model-badge"}>
                  {result.isMeaningQuery ? "Meaning query" : "Other query"}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
      {!embedded && <footer className="model-footer">LEXITRACK <span>·</span> LOCAL MODEL TEST</footer>}
    </section>
  );
}
