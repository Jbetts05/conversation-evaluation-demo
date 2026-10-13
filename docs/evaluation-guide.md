# Evaluate multi-turn conversations in Microsoft Foundry

Assess whether an assistant fulfilled the user's requests across an interaction.
Use turn-level evaluation alongside it to identify replies that need work.

## Why evaluate the whole conversation?

Consider a support conversation:

| User request | Assistant response |
|--------------|--------------------|
| "Help me dispute this charge." | Asks for the charge date |
| "Before that, is France roaming included?" | Answers the roaming question |
| "The charge was on 12 June. How do I enable roaming?" | Gives roaming instructions, but forgets the dispute |

Useful replies can coexist with an unfinished request. Conversation evaluation
checks the outcome; turn checks help locate the missed step.

## 1. Choose an evaluation level

| Level | What is assessed | Use it for |
|-------|------------------|------------|
| **Turn** | One reply, with the context available at that point | Relevance, answer quality and individual tool interactions |
| **Conversation** | The complete interaction | Task completion, satisfaction, topic changes and continuity |

Set `evaluation_level` explicitly; the default is `"turn"`. A whole `messages`
record may yield only a final-reply score in turn mode. To assess every reply,
submit prefixes as in step 4. Check `supported_evaluation_levels`: unsupported
evaluators can be skipped without failing the run.

## 2. Prepare conversation data

Use one complete conversation per JSONL line. This record is formatted for
readability; serialize it onto one line:

```json
{
  "messages": [
    {"role": "system", "content": "Fictional facts: monthly plan GBP 24; France roaming included."},
    {"role": "user", "content": "What is my monthly plan charge?"},
    {"role": "assistant", "content": "GBP 24."},
    {"role": "user", "content": "New question: is France roaming included?"},
    {"role": "assistant", "content": "Yes, France roaming is included."}
  ]
}
```

Include supporting facts and, where used, tool calls, results and `tool_definitions`.
Don't penalise legitimate topic changes or withdrawn requests. Review privacy
and retention requirements before uploading.

## 3. Select compatible evaluators

| Evaluator | What it helps assess |
|-----------|----------------------|
| `output_quality` | Multiple quality dimensions in one composite assessment |
| `tool_use_quality` | Tool selection, inputs, execution and use of results |
| `deflection_rate` | Whether the assistant deflected requests |
| `customer_satisfaction` | Helpfulness and the overall user experience |
| `task_completion` | Whether the requested work was completed |
| `coherence` | Consistency and flow across the interaction |
| `groundedness` | Whether claims are supported by supplied evidence |

All seven support conversation level. Add a rubric for domain-specific criteria,
such as retaining corrections. Composite and individual scores overlap; don't
count them as independent votes.

## 4. Create and run an evaluation

Complete the [client setup](https://learn.microsoft.com/azure/foundry/observability/how-to/cloud-evaluation#set-up-the-sdk-client)
with a deployed judge. This JavaScript fragment uses its `openAIClient`, your
`judgeDeployment`, and the record above as `conversation`:

```javascript
const evaluation = await openAIClient.evals.create({
  name: "Support conversation",
  data_source_config: {
    type: "custom",
    item_schema: {
      type: "object", properties: { messages: { type: "array" } },
      required: ["messages"]
    },
    include_sample_schema: false
  },
  testing_criteria: [{
    type: "azure_ai_evaluator", name: "task_completion",
    evaluator_name: "builtin.task_completion",
    initialization_parameters: { deployment_name: judgeDeployment },
    data_mapping: { messages: "{{item.messages}}" }
  }]
});
const run = await openAIClient.evals.runs.create(evaluation.id, {
  data_source: {
    type: "jsonl",
    source: { type: "file_content", content: [{ item: conversation }] }
  },
  evaluation_level: "conversation"
});
```

Poll the run and retrieve output items. For turn scores, submit a prefix ending
at each completed reply, retaining earlier tool evidence but excluding future messages.

## 5. Read the results

Inspect the **score, threshold, verdict, reason and execution status**. A composite
gate uses `0/1`; components have their own scales. A no-tools `not_applicable`
result is not a pass, and unexpected skips/errors need investigation.

Calibrate a compatible judge against human-reviewed examples. This demo uses
GPT-6 Astra to judge GPT-6 Luna. Several evaluators are preview; review current
restrictions before operational use. Evaluation detects behaviour; it does not
implement memory or orchestration.

**Continue:** [Foundry conversation how-to](https://learn.microsoft.com/azure/foundry/observability/how-to/cloud-evaluation-conversations)
· [Python sample](https://github.com/Azure/azure-sdk-for-python/blob/main/sdk/ai/azure-ai-projects/samples/evaluations/sample_multiturn_conversation_evaluation.py)
· [JavaScript sample](https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/ai/ai-projects/samples-dev/evaluations/multiturnConversationEvaluation.ts)
· [this repo's implementation](../api/lib/core.mjs)
· [rubric criteria](../data/rubric.json).
