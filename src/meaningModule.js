
import { pipeline } from "@huggingface/transformers";
import { MIN_CLASSIFIER_MARGIN, MIN_MEANING_SIMILARITY } from "./lib/meaningThresholds.js";

const DEFAULT_MEANING_EXAMPLES = [
  "What does this word mean?",
  "What is the definition of this word?",
  "Explain this word in simple language.",
  "What does this expression mean?",
  "Define an unfamiliar vocabulary word.",
  "Give the meaning of a single English word.",
  "Explain the definition of an unfamiliar term."
];

const DEFAULT_OTHER_EXAMPLES = [
  "Best laptop for engineering students",
  "How to repair a bicycle",
  "Latest technology news",
  "How does a transistor work?",
  "Weather forecast for tomorrow",
  "How much money did a fictional character have in a television series?",
  "How wealthy was an actor or character in a TV show?",
  "What is the interpretation of an ancient epic or novel?",
  "Discuss the themes and symbolism of a poem or literary work.",
  "Who played a character in a popular television show?",
  "What is the plot of a television drama?",
  "Translate a complete sentence into another language.",
  "Translate a single word from one language into another."
];

function cosineSimilarity(a, b) {
  let sum = 0;

  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }

  return sum;
}

export function createQueryClassifier({
  pipelineFactory = pipeline,
  modelId = "Xenova/all-MiniLM-L6-v2",
  pipelineOptions = {},
  meaningExamples = DEFAULT_MEANING_EXAMPLES,
  otherExamples = DEFAULT_OTHER_EXAMPLES
} = {}) {
  let extractorPromise;
  let exampleEmbeddingsPromise;

  function getExtractor() {
    if (!extractorPromise) {
      extractorPromise = Promise.resolve()
        .then(() => pipelineFactory("feature-extraction", modelId, pipelineOptions))
        .catch((error) => {
          extractorPromise = undefined;
          throw error;
        });
    }

    return extractorPromise;
  }

  async function getExampleEmbeddings() {
    if (!exampleEmbeddingsPromise) {
      exampleEmbeddingsPromise = (async () => {
        const extractor = await getExtractor();
        const embed = async (text) => {
          const result = await extractor(text, {
            pooling: "mean",
            normalize: true
          });
          return result.tolist()[0];
        };

        return {
          meaning: await Promise.all(meaningExamples.map(embed)),
          other: await Promise.all(otherExamples.map(embed))
        };
      })().catch((error) => {
        exampleEmbeddingsPromise = undefined;
        throw error;
      });
    }

    return exampleEmbeddingsPromise;
  }

  return async function classifyQuery(query) {
    const extractor = await getExtractor();
    const examples = await getExampleEmbeddings();
    const result = await extractor(query, {
      pooling: "mean",
      normalize: true
    });
    const queryEmbedding = result.tolist()[0];
    const bestMeaning = Math.max(
      ...examples.meaning.map((embedding) => cosineSimilarity(queryEmbedding, embedding))
    );
    const bestOther = Math.max(
      ...examples.other.map((embedding) => cosineSimilarity(queryEmbedding, embedding))
    );
    const margin = bestMeaning - bestOther;

    return {
      isMeaningQuery:
        bestMeaning >= MIN_MEANING_SIMILARITY && margin >= MIN_CLASSIFIER_MARGIN,
      meaningScore: bestMeaning,
      otherScore: bestOther
    };
  };
}

export const classifyQuery = createQueryClassifier();
